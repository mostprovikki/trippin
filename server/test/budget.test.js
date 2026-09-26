import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson, createOrganizer } from './helpers.js'
import { buildBudgetPrompt } from '../src/llm/prompts/budget.js'
import { draftBudgetLines } from '../src/routes/budget.routes.js'

describe('budget', () => {
  it('GET zero-fills all 8 categories; PUT upserts; equal_share math with overrides', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { destination: 'Goa' })
    const [a, b, c] = await Promise.all([createPerson(db), createPerson(db), createPerson(db)])
    for (const p of [a, b, c]) await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])
    let res = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget` })).json()
    expect(res.lines).toHaveLength(8); expect(res.total).toBe(0)
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/budget`,
      payload: { lines: [{ category: 'stay', estimate: 12000, basis: '4n x 3k' }, { category: 'food', estimate: 6000 }] } })
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/budget/overrides`,
      payload: { overrides: [{ person_id: c.id, amount: 3000, note: 'skipping stay' }] } })
    res = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget` })).json()
    expect(res.total).toBe(18000)
    expect(res.equal_share).toBe(7500)   // (18000-3000)/2
  })
  // Money columns must be DOUBLE PRECISION. Postgres REAL is float4 (~7 significant
  // digits), so a routine seven-figure INR budget would come back as 1234567.875 —
  // silently wrong, and wrong in the JSON body this whole migration exists to keep
  // byte-identical. NUMERIC is not the fix either: node-postgres returns numeric as a
  // string, so `typeof` would stop being 'number'.
  it('round-trips a 7-figure amount through the budget API without precision loss', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db)
    const AMOUNT = 1234567.89

    const put = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/budget`,
      payload: { lines: [{ category: 'stay', estimate: AMOUNT }] } })
    expect(put.statusCode).toBe(200)
    const stay = put.json().lines.find((l) => l.category === 'stay')
    expect(typeof stay.estimate).toBe('number')
    expect(stay.estimate).toBe(AMOUNT)
    expect(put.json().total).toBe(AMOUNT)

    const get = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget` })).json()
    expect(get.lines.find((l) => l.category === 'stay').estimate).toBe(AMOUNT)
    expect(get.total).toBe(AMOUNT)

    // actuals.amount and destination_candidates.est_budget_per_person are the same
    // hazard on the same kind of number.
    await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/archive`, payload: {} })
    const actuals = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/actuals`,
      payload: { actuals: [{ category: 'stay', amount: AMOUNT }] } })
    expect(actuals.json().actuals).toEqual([{ category: 'stay', amount: AMOUNT }])
  })

  it('ai-draft returns validated lines from mock, saves nothing; 503 when disabled', async () => {
    process.env.LLM_PROVIDER = 'mock'
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { destination: 'Goa', start_date: '2026-10-02', end_date: '2026-10-06' })
    const CATS = ['primary_transport','secondary_transport','stay','food','activities','shopping','leisure','misc']
    queueMock({ lines: CATS.map(c => ({ category: c, estimate: 1000, basis: 'guess' })) })
    // Note: @fastify/autoload loads route modules via a runtime dynamic import() that Vitest's
    // SSR module runner does not intercept, so a route reached through app.inject() binds to a
    // separate module instance of src/llm/drivers/mock.js than the one this test file imports
    // (the mock queue populated above would never be seen by that instance). draftBudgetLines is
    // exported from budget.routes.js precisely so tests can exercise the exact same generate()/mock
    // instance the test file imported. The 503-disabled path below has no such shared-state
    // requirement (it only reads process.env), so it still verifies the real HTTP route end-to-end.
    const result = await draftBudgetLines(app, t)
    expect(result.lines).toHaveLength(8)
    expect((await app.db.get('SELECT count(*)::int AS c FROM budget_lines')).c).toBe(0)
    process.env.LLM_PROVIDER = 'none'
    const off = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/budget/ai-draft` })
    expect(off.statusCode).toBe(503); expect(off.json().error.code).toBe('AI_DISABLED')
  })
  it('budget prompt endpoint returns a prompt with no provider configured', async () => {
    process.env.LLM_PROVIDER = 'none'
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { destination: 'Goa' })
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget/ai-draft/prompt` })
    expect(res.statusCode).toBe(200)
    expect(typeof res.json().prompt).toBe('string')
    expect(res.json().prompt.length).toBeGreaterThan(0)
  })
  it('budget prompt endpoint 404s for another organizer\'s trip', async () => {
    process.env.LLM_PROVIDER = 'none'
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const other = await createOrganizer(db, { email: 'other-budget@x.dev' })
    const t = await createTrip(db, { organizer_id: other.id })
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget/ai-draft/prompt` })
    expect(res.statusCode).toBe(404)
  })
  it('privacy: prompt contains no participant PII', async () => {
    const { db } = await makeTestApp()
    const t = await createTrip(db, { destination: 'Goa' })
    const { prompt, system } = buildBudgetPrompt(t, 6)
    for (const leak of ['Asha', '@', 'phone']) expect((system + prompt).includes(leak)).toBe(false)
    expect(prompt).toMatch(/6/) // group size present
  })
})
