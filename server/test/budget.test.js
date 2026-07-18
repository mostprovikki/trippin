import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'
import { buildBudgetPrompt } from '../src/llm/prompts/budget.js'
import { draftBudgetLines } from '../src/routes/budget.routes.js'

describe('budget', () => {
  it('GET zero-fills all 8 categories; PUT upserts; equal_share math with overrides', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = createTrip(db, { destination: 'Goa' })
    const [a, b, c] = [createPerson(db), createPerson(db), createPerson(db)]
    for (const p of [a, b, c]) db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p.id)
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
  it('ai-draft returns validated lines from mock, saves nothing; 503 when disabled', async () => {
    process.env.LLM_PROVIDER = 'mock'
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = createTrip(db, { destination: 'Goa', start_date: '2026-10-02', end_date: '2026-10-06' })
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
    expect(app.db.prepare('SELECT count(*) c FROM budget_lines').get().c).toBe(0)
    process.env.LLM_PROVIDER = 'none'
    const off = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/budget/ai-draft` })
    expect(off.statusCode).toBe(503); expect(off.json().error.code).toBe('AI_DISABLED')
  })
  it('privacy: prompt contains no participant PII', async () => {
    const { db } = await makeTestApp()
    const t = createTrip(db, { destination: 'Goa' })
    const { prompt, system } = buildBudgetPrompt(t, 6)
    for (const leak of ['Asha', '@', 'phone']) expect((system + prompt).includes(leak)).toBe(false)
    expect(prompt).toMatch(/6/) // group size present
  })
})
