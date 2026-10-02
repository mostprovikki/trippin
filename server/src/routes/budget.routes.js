import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { assertTripWritable } from '../lib/tripWritable.js'
import { generate, aiGuard, LlmValidationError, parseAndValidate, pasteError, pasteBodySchema } from '../llm/index.js'
import { buildBudgetPrompt, budgetSchema, CATEGORIES } from '../llm/prompts/budget.js'

export { CATEGORIES, budgetShape }

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export async function draftBudgetLines(app, trip) {
  const { count: participant_count } = await app.db.get(
    'SELECT COUNT(*)::int AS count FROM trip_participants WHERE trip_id = ?', [trip.id])
  const result = await generate(buildBudgetPrompt(trip, participant_count))
  return { lines: result.lines }
}

async function budgetShape(app, tripId) {
  const rows = await app.db.all('SELECT category, estimate, basis, booked FROM budget_lines WHERE trip_id = ?', [tripId])
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, { ...r, booked: r.booked === 1 }]))
  const lines = CATEGORIES.map((category) => byCategory[category] || { category, estimate: 0, basis: null, booked: false })
  const total = round2(lines.reduce((sum, l) => sum + l.estimate, 0))
  const booked_total = round2(lines.reduce((sum, l) => sum + (l.booked ? l.estimate : 0), 0))
  const { count: participant_count } = await app.db.get(
    'SELECT COUNT(*)::int AS count FROM trip_participants WHERE trip_id = ?', [tripId])
  const overrides = await app.db.all(`SELECT bo.person_id, p.name AS person_name, bo.amount, bo.note FROM budget_overrides bo
    JOIN persons p ON p.id = bo.person_id WHERE bo.trip_id = ? ORDER BY p.name`, [tripId])
  const overrideSum = overrides.reduce((sum, o) => sum + o.amount, 0)
  const equal_share = round2((total - overrideSum) / Math.max(1, participant_count - overrides.length))
  // the booked part of each equal share, in proportion to the booked share of the total
  const equal_share_booked = total > 0 ? round2(equal_share * (booked_total / total)) : 0
  return { lines, total, booked_total, participant_count, equal_share, equal_share_booked, overrides }
}

export default async function routes(app) {
  const getTrip = (req) => app.ownedTrip(req, req.params.id)

  app.get('/trips/:id/budget', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return await budgetShape(app, trip.id)
  })

  app.put('/trips/:id/budget', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object',
        required: ['lines'],
        properties: {
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['category', 'estimate'],
              properties: {
                category: { type: 'string', enum: CATEGORIES },
                estimate: { type: 'number' },
                basis: { type: 'string' },
                booked: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (await assertTripWritable(app, trip, reply)) return reply
    await app.db.tx(async () => {
      // booked left out (an AI draft apply sends estimates only) keeps what was booked
      for (const l of req.body.lines) await (l.booked === undefined
        ? app.db.run(
          `INSERT INTO budget_lines (id, trip_id, category, estimate, basis) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (trip_id, category) DO UPDATE SET estimate = excluded.estimate, basis = excluded.basis`,
          [randomUUID(), trip.id, l.category, l.estimate, l.basis ?? null])
        : app.db.run(
          `INSERT INTO budget_lines (id, trip_id, category, estimate, basis, booked) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (trip_id, category) DO UPDATE SET estimate = excluded.estimate, basis = excluded.basis, booked = excluded.booked`,
          [randomUUID(), trip.id, l.category, l.estimate, l.basis ?? null, l.booked ? 1 : 0]))
    })
    return await budgetShape(app, trip.id)
  })

  app.put('/trips/:id/budget/overrides', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object',
        required: ['overrides'],
        properties: {
          overrides: {
            type: 'array',
            items: {
              type: 'object',
              required: ['person_id', 'amount'],
              properties: {
                person_id: { type: 'string' },
                amount: { type: 'number' },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (await assertTripWritable(app, trip, reply)) return reply
    const overrides = req.body.overrides
    for (const o of overrides) {
      const isParticipant = await app.db.get(
        'SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?', [trip.id, o.person_id])
      if (!isParticipant) return httpError(reply, 400, 'NOT_PARTICIPANT', 'Person is not a trip participant')
    }
    await app.db.tx(async () => {
      await app.db.run('DELETE FROM budget_overrides WHERE trip_id = ?', [trip.id])
      for (const o of overrides) await app.db.run(
        'INSERT INTO budget_overrides (id, trip_id, person_id, amount, note) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), trip.id, o.person_id, o.amount, o.note ?? null],
      )
    })
    return await budgetShape(app, trip.id)
  })

  app.get('/trips/:id/budget/ai-draft/prompt', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const { count: participant_count } = await app.db.get(
      'SELECT COUNT(*)::int AS count FROM trip_participants WHERE trip_id = ?', [trip.id])
    return { prompt: buildBudgetPrompt.standalone(trip, participant_count) }
  })

  app.post('/trips/:id/budget/ai-draft', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (await assertTripWritable(app, trip, reply)) return reply
    if (aiGuard(reply)) return
    try {
      return await draftBudgetLines(app, trip)
    } catch (err) {
      if (err instanceof LlmValidationError || err.name === 'LlmHttpError') return httpError(reply, 502, 'AI_FAILED', err.message)
      throw err
    }
  })

  app.post('/trips/:id/budget/ai-draft/import', { preHandler: app.requireOrganizer, schema: { body: pasteBodySchema } }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (await assertTripWritable(app, trip, reply)) return reply
    try {
      return { lines: parseAndValidate({ text: req.body.text, schema: budgetSchema }).lines }
    } catch (err) {
      return pasteError(reply, err)
    }
  })
}
