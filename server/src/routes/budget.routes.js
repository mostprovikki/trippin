import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { generate, aiGuard, LlmValidationError } from '../llm/index.js'
import { buildBudgetPrompt, CATEGORIES } from '../llm/prompts/budget.js'

export { CATEGORIES }

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export async function draftBudgetLines(app, trip) {
  const { count: participant_count } = app.db.prepare('SELECT COUNT(*) AS count FROM trip_participants WHERE trip_id = ?').get(trip.id)
  const result = await generate(buildBudgetPrompt(trip, participant_count))
  return { lines: result.lines }
}

function budgetShape(app, tripId) {
  const rows = app.db.prepare('SELECT category, estimate, basis FROM budget_lines WHERE trip_id = ?').all(tripId)
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]))
  const lines = CATEGORIES.map((category) => byCategory[category] || { category, estimate: 0, basis: null })
  const total = round2(lines.reduce((sum, l) => sum + l.estimate, 0))
  const { count: participant_count } = app.db.prepare('SELECT COUNT(*) AS count FROM trip_participants WHERE trip_id = ?').get(tripId)
  const overrides = app.db.prepare(`SELECT bo.person_id, p.name AS person_name, bo.amount, bo.note FROM budget_overrides bo
    JOIN persons p ON p.id = bo.person_id WHERE bo.trip_id = ? ORDER BY p.name`).all(tripId)
  const overrideSum = overrides.reduce((sum, o) => sum + o.amount, 0)
  const equal_share = round2((total - overrideSum) / Math.max(1, participant_count - overrides.length))
  return { lines, total, participant_count, equal_share, overrides }
}

export default async function routes(app) {
  const getTrip = (req) => app.ownedTrip(req, req.params.id)

  app.get('/trips/:id/budget', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return budgetShape(app, trip.id)
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
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const upsert = app.db.prepare(`INSERT INTO budget_lines (id, trip_id, category, estimate, basis) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (trip_id, category) DO UPDATE SET estimate = excluded.estimate, basis = excluded.basis`)
    const tx = app.db.transaction((lines) => {
      for (const l of lines) upsert.run(randomUUID(), trip.id, l.category, l.estimate, l.basis ?? null)
    })
    tx(req.body.lines)
    return budgetShape(app, trip.id)
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
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const overrides = req.body.overrides
    for (const o of overrides) {
      const isParticipant = app.db.prepare('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?').get(trip.id, o.person_id)
      if (!isParticipant) return httpError(reply, 400, 'NOT_PARTICIPANT', 'Person is not a trip participant')
    }
    const tx = app.db.transaction((overrides) => {
      app.db.prepare('DELETE FROM budget_overrides WHERE trip_id = ?').run(trip.id)
      const ins = app.db.prepare('INSERT INTO budget_overrides (id, trip_id, person_id, amount, note) VALUES (?, ?, ?, ?, ?)')
      for (const o of overrides) ins.run(randomUUID(), trip.id, o.person_id, o.amount, o.note ?? null)
    })
    tx(overrides)
    return budgetShape(app, trip.id)
  })

  app.post('/trips/:id/budget/ai-draft', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (aiGuard(reply)) return
    try {
      return await draftBudgetLines(app, trip)
    } catch (err) {
      if (err instanceof LlmValidationError || err.name === 'LlmHttpError') return httpError(reply, 502, 'AI_FAILED', err.message)
      throw err
    }
  })
}
