import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { generate, aiGuard } from '../llm/index.js'
import { buildDestinationPrompt } from '../llm/prompts/destinations.js'
import { tripToJson } from './trips.routes.js'

// Aggregated (counts-only) preference summary for a trip's participants — never names/emails.
export async function buildPrefSummary(db, tripId) {
  const rows = await db.all(`SELECT p.dietary, p.interests, p.pace, p.budget_band
    FROM trip_participants tp JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ?`, [tripId])
  const total = rows.length
  const dietCounts = {}
  const paceCounts = {}
  const budgetCounts = {}
  const interestCounts = {}
  for (const p of rows) {
    if (p.dietary) dietCounts[p.dietary] = (dietCounts[p.dietary] || 0) + 1
    if (p.pace) paceCounts[p.pace] = (paceCounts[p.pace] || 0) + 1
    if (p.budget_band) budgetCounts[p.budget_band] = (budgetCounts[p.budget_band] || 0) + 1
    for (const tag of JSON.parse(p.interests || '[]')) interestCounts[tag] = (interestCounts[tag] || 0) + 1
  }
  const toLines = (counts) => Object.entries(counts).map(([k, v]) => `${k}: ${v} of ${total}`)
  const top_interests = Object.entries(interestCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => `${tag} (${count} of ${total})`)
  return { total, diet: toLines(dietCounts), pace: toLines(paceCounts), budget_band: toLines(budgetCounts), top_interests }
}

export default async function routes(app) {
  const get = (id) => app.db.get('SELECT * FROM trips WHERE id = ?', [id])
  const getTrip = (req) => app.ownedTrip(req, req.params.id)
  const getCandidate = (req, id) => app.db.get(
    'SELECT c.* FROM destination_candidates c JOIN trips t ON t.id = c.trip_id WHERE c.id = ? AND t.organizer_id = ?', [id, req.organizer.id]
  )
  // sqlite's implicit rowid tie-broke candidates inserted within the same
  // to_char() second (e.g. a batch of ai-suggest rows). Postgres has no rowid,
  // and ctid (physical tuple location) is NOT a substitute — it reshuffles on
  // UPDATE (the decide handler below rewrites every row's tuple) and VACUUM.
  // `seq` (001_init.sql) is a real monotonic identity column, so it keeps
  // insertion order stable across any number of later decide()/VACUUM events.
  const listCandidates = (tripId) => app.db.all(
    'SELECT * FROM destination_candidates WHERE trip_id = ? ORDER BY decided DESC, created_at ASC, seq ASC', [tripId]
  )

  app.get('/trips/:id/candidates', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return { candidates: await listCandidates(trip.id) }
  })

  app.post('/trips/:id/candidates', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          rationale: { type: ['string', 'null'] },
          best_dates: { type: ['string', 'null'] },
          est_budget_per_person: { type: ['number', 'null'] },
          caveats: { type: ['string', 'null'] },
        },
      },
    },
  }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const id = randomUUID()
    const b = req.body
    await app.db.run(`INSERT INTO destination_candidates
      (id, trip_id, name, rationale, best_dates, est_budget_per_person, caveats, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [id, trip.id, b.name, b.rationale ?? null, b.best_dates ?? null, b.est_budget_per_person ?? null, b.caveats ?? null])
    reply.code(201)
    return { candidate: await getCandidate(req, id) }
  })

  app.get('/trips/:id/candidates/ai-suggest/prompt', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const prefSummary = await buildPrefSummary(app.db, trip.id)
    const prompt = buildDestinationPrompt.standalone(await tripToJson(app.db, trip), prefSummary.total, prefSummary)
    return { prompt }
  })

  app.post('/trips/:id/candidates/ai-suggest', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (aiGuard(reply)) return reply
    const prefSummary = await buildPrefSummary(app.db, trip.id)
    const { system, prompt, schema } = buildDestinationPrompt(await tripToJson(app.db, trip), prefSummary.total, prefSummary)
    const result = await generate({ system, prompt, schema })
    for (const c of result.candidates) {
      await app.db.run(`INSERT INTO destination_candidates
        (id, trip_id, name, rationale, best_dates, est_budget_per_person, caveats, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`,
        [randomUUID(), trip.id, c.name, c.rationale ?? null, c.best_dates ?? null, c.est_budget_per_person ?? null, c.caveats ?? null])
    }
    return { candidates: await listCandidates(trip.id) }
  })

  app.post('/candidates/:id/decide', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const candidate = await getCandidate(req, req.params.id)
    if (!candidate) return httpError(reply, 404, 'NOT_FOUND', 'No such candidate')
    await app.db.tx(async () => {
      await app.db.run('UPDATE destination_candidates SET decided = 0 WHERE trip_id = ?', [candidate.trip_id])
      await app.db.run('UPDATE destination_candidates SET decided = 1 WHERE id = ?', [candidate.id])
      await app.db.run(`UPDATE trips SET destination = ?, destination_mode = 'decided', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
        [candidate.name, candidate.trip_id])
    })
    return { trip: await tripToJson(app.db, await get(candidate.trip_id)) }
  })

  app.delete('/candidates/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const candidate = await getCandidate(req, req.params.id)
    if (!candidate) return httpError(reply, 404, 'NOT_FOUND', 'No such candidate')
    if (candidate.decided) return httpError(reply, 400, 'DECIDED', 'Cannot delete a decided candidate')
    await app.db.run('DELETE FROM destination_candidates WHERE id = ?', [candidate.id])
    reply.code(204)
    return null
  })
}
