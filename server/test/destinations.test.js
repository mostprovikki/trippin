process.env.LLM_PROVIDER = 'mock'
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'
import { queueMock } from '../src/llm/drivers/mock.js'
import { buildPrefSummary } from '../src/routes/destinations.routes.js'
import { buildDestinationPrompt } from '../src/llm/prompts/destinations.js'

const AI_CANDIDATES = [
  { name: 'Goa', rationale: 'Beaches fit the relaxed vibe', best_dates: 'Nov-Feb', est_budget_per_person: 15000, caveats: 'Peak season crowds' },
  { name: 'Manali', rationale: 'Mountain trekking for the group', best_dates: 'Mar-May', est_budget_per_person: 12000, caveats: 'Weather can be unpredictable' },
  { name: 'Rishikesh', rationale: 'Adventure sports and calm evenings', best_dates: 'Sep-Nov', est_budget_per_person: 9000, caveats: 'Limited nightlife' },
]

describe('destinations', () => {
  it('requires organizer auth', async () => {
    const { app, db } = await makeTestApp()
    const trip = await createTrip(db)
    expect((await app.inject({ method: 'GET', url: `/api/trips/${trip.id}/candidates` })).statusCode).toBe(401)
  })

  it('manual candidate CRUD + list order (decided first, then created_at)', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const trip = await createTrip(db)
    const c1 = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`, payload: { name: 'Goa' } })
    expect(c1.statusCode).toBe(201)
    expect(c1.json().candidate.source).toBe('manual')
    expect(c1.json().candidate.decided).toBe(0)
    const c2 = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`,
      payload: { name: 'Kerala', rationale: 'backwaters', best_dates: 'Oct-Dec', est_budget_per_person: 11000, caveats: 'monsoon risk' } })
    expect(c2.statusCode).toBe(201)

    const list = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/candidates` })
    expect(list.json().candidates.map((c) => c.name)).toEqual(['Goa', 'Kerala'])

    await authedInject(app, cookie, { method: 'POST', url: `/api/candidates/${c2.json().candidate.id}/decide` })
    const list2 = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/candidates` })
    expect(list2.json().candidates[0].name).toBe('Kerala')
    expect(list2.json().candidates[0].decided).toBe(1)
  })

  it('404 on unknown trip for manual create', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/trips/nope/candidates', payload: { name: 'X' } })
    expect(res.statusCode).toBe(404)
  })

  it('ai-suggest saves rows with source=ai and appends on repeat calls', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const trip = await createTrip(db)
    await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`, payload: { name: 'Manual Pick' } })

    queueMock({ candidates: AI_CANDIDATES })
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates/ai-suggest` })
    expect(res.statusCode).toBe(200)
    const afterFirst = res.json().candidates
    expect(afterFirst).toHaveLength(4) // 1 manual + 3 ai
    const aiRows = afterFirst.filter((c) => c.source === 'ai')
    expect(aiRows).toHaveLength(3)
    expect(aiRows.length).toBeGreaterThanOrEqual(3)
    expect(aiRows.length).toBeLessThanOrEqual(7)
    expect(aiRows.map((c) => c.name)).toEqual(['Goa', 'Manali', 'Rishikesh'])

    queueMock({ candidates: AI_CANDIDATES })
    const res2 = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates/ai-suggest` })
    expect(res2.json().candidates).toHaveLength(7) // appended, not replaced
  })

  it('list order tiebreak survives decide() row rewrites (regression: ctid is not insertion order)', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const trip = await createTrip(db)

    // Same-second batch: ai-suggest inserts all 3 rows within the same
    // to_char() second, so created_at alone can't order them — the tiebreak
    // column must.
    queueMock({ candidates: AI_CANDIDATES })
    const suggest = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates/ai-suggest` })
    const [goa, manali] = suggest.json().candidates

    // Pin all 3 rows to the same created_at instead of relying on the batch landing
    // inside one to_char() second (that premise flaked when the insert straddled a
    // second boundary) — this makes created_at alone unable to order them, so the
    // seq tiebreak is always exercised.
    const createdAts = (await db.all(
      'SELECT created_at FROM destination_candidates WHERE trip_id = ?', [trip.id])).map((r) => r.created_at)
    expect(createdAts).toHaveLength(3)
    await db.run('UPDATE destination_candidates SET created_at = ? WHERE trip_id = ?', [createdAts[0], trip.id])

    // Exercise decide()'s transaction repeatedly. Its blanket
    // "SET decided = 0 WHERE trip_id = ?" rewrites every row's tuple (and
    // thus its ctid) on each call — a ctid-based tiebreak would have no
    // guarantee of surviving this in original insertion order.
    await authedInject(app, cookie, { method: 'POST', url: `/api/candidates/${manali.id}/decide` })
    await authedInject(app, cookie, { method: 'POST', url: `/api/candidates/${goa.id}/decide` })

    const after = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/candidates` })
    const names = after.json().candidates.map((c) => c.name)
    // Goa (decided) sorts first; Manali/Rishikesh are both decided=0 and tie
    // on created_at, so they must keep their original insertion order.
    expect(names).toEqual(['Goa', 'Manali', 'Rishikesh'])
  })

  it('decide flips trip destination/destination_mode and un-decides others', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const trip = await createTrip(db)
    const a = (await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`, payload: { name: 'Goa' } })).json().candidate
    const b = (await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`, payload: { name: 'Kerala' } })).json().candidate

    const dec1 = await authedInject(app, cookie, { method: 'POST', url: `/api/candidates/${a.id}/decide` })
    expect(dec1.statusCode).toBe(200)
    expect(dec1.json().trip.destination).toBe('Goa')
    expect(dec1.json().trip.destination_mode).toBe('decided')

    const dec2 = await authedInject(app, cookie, { method: 'POST', url: `/api/candidates/${b.id}/decide` })
    expect(dec2.json().trip.destination).toBe('Kerala')

    const list = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/candidates` })
    const rows = list.json().candidates
    expect(rows.find((c) => c.id === a.id).decided).toBe(0)
    expect(rows.find((c) => c.id === b.id).decided).toBe(1)
  })

  it('404 decide on unknown candidate', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/candidates/nope/decide' })
    expect(res.statusCode).toBe(404)
  })

  it('delete: 204 for undecided, 400 DECIDED for decided', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const trip = await createTrip(db)
    const a = (await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`, payload: { name: 'Goa' } })).json().candidate
    const b = (await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates`, payload: { name: 'Kerala' } })).json().candidate
    await authedInject(app, cookie, { method: 'POST', url: `/api/candidates/${b.id}/decide` })

    const delA = await authedInject(app, cookie, { method: 'DELETE', url: `/api/candidates/${a.id}` })
    expect(delA.statusCode).toBe(204)

    const delB = await authedInject(app, cookie, { method: 'DELETE', url: `/api/candidates/${b.id}` })
    expect(delB.statusCode).toBe(400)
    expect(delB.json().error.code).toBe('DECIDED')
  })

  it('404 delete on unknown candidate', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'DELETE', url: '/api/candidates/nope' })
    expect(res.statusCode).toBe(404)
  })

  it('503 AI_DISABLED when LLM_PROVIDER=none', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const trip = await createTrip(db)
    const prev = process.env.LLM_PROVIDER
    process.env.LLM_PROVIDER = 'none'
    try {
      const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/candidates/ai-suggest` })
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('AI_DISABLED')
    } finally {
      process.env.LLM_PROVIDER = prev
    }
  })

  it('privacy: buildDestinationPrompt contains only aggregate counts, never participant names/emails', async () => {
    const { db } = await makeTestApp()
    const trip = await createTrip(db, {
      vibe_tags: JSON.stringify(['relaxing', 'foodie']),
      origin_city: 'Chennai',
      currency: 'INR',
    })
    const p1 = await createPerson(db, { name: 'Zephyrine Quackenbush', email: 'zephyrine.quackenbush@example.com', dietary: 'veg', interests: JSON.stringify(['food', 'trekking']) })
    const p2 = await createPerson(db, { name: 'Thaddeus Winterbottom', email: 'thaddeus.winterbottom@example.com', dietary: 'veg', interests: JSON.stringify(['food']) })
    const p3 = await createPerson(db, { name: 'Bartholomew Fizzlethorpe', email: 'bartholomew.fizzlethorpe@example.com', dietary: 'non_veg', interests: JSON.stringify(['nightlife']) })
    for (const p of [p1, p2, p3]) await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?,?)', [trip.id, p.id])

    const prefSummary = await buildPrefSummary(db, trip.id)
    expect(prefSummary.total).toBe(3)
    const { system, prompt } = buildDestinationPrompt(
      { ...trip, vibe_tags: ['relaxing', 'foodie'], goals: [], windows: [] },
      prefSummary.total,
      prefSummary,
    )
    const full = `${system}\n${prompt}`
    for (const p of [p1, p2, p3]) {
      expect(full).not.toContain(p.name)
      expect(full).not.toContain(p.email)
    }
    expect(full).toContain('2 of 3')
  })
})
