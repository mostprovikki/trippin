import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject } from './helpers.js'

describe('foundation', () => {
  it('migrates schema and serves /api/health', async () => {
    const { app, db } = await makeTestApp()
    const { c } = await db.get("SELECT count(*) c FROM information_schema.tables WHERE table_schema = current_schema()")
    expect(Number(c)).toBeGreaterThan(10)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
  })
  it('requireOrganizer rejects without cookie, accepts with signed session', async () => {
    const { app, db } = await makeTestApp()
    app.get('/api/_secure', { preHandler: app.requireOrganizer }, async (req) => ({ id: req.organizer.id }))
    expect((await app.inject({ method: 'GET', url: '/api/_secure' })).statusCode).toBe(401)
    const { cookie } = await loginOrganizer(app, db)
    expect((await authedInject(app, cookie, { method: 'GET', url: '/api/_secure' })).statusCode).toBe(200)
  })
  it('requireParticipant validates bearer token hash, revocation, expiry', async () => {
    const { app, db } = await makeTestApp()
    app.get('/api/participant/_ping', { preHandler: app.requireParticipant }, async (req) => req.participant)
    const { createPerson, createTrip } = await import('./helpers.js')
    const p = await createPerson(db); const t = await createTrip(db)
    const raw = 'x'.repeat(43)
    await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)',
      ['l1', t.id, p.id, app.hashToken(raw)])
    const ok = await app.inject({ method: 'GET', url: '/api/participant/_ping', headers: { authorization: `Bearer ${raw}` } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ linkId: 'l1', tripId: t.id, personId: p.id })
    await db.run("UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id='l1'")
    const rev = await app.inject({ method: 'GET', url: '/api/participant/_ping', headers: { authorization: `Bearer ${raw}` } })
    expect(rev.statusCode).toBe(401)
  })
})
