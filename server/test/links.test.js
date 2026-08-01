import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createPerson, createTrip } from './helpers.js'

async function join(db, t, p) { await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id]) }

describe('participant links', () => {
  it('creates link returning raw token once, stores only hash, /p url', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db); const t = await createTrip(db); await join(db, t, p)
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })
    expect(res.statusCode).toBe(201)
    const { token, url } = res.json()
    expect(url).toBe(`/p/${token}`); expect(token.length).toBeGreaterThanOrEqual(43)
    const row = await db.get('SELECT * FROM participant_links LIMIT 1')
    expect(row.token_hash).toBe(app.hashToken(token))
    expect(JSON.stringify(await db.all('SELECT * FROM participant_links'))).not.toContain(token)
  })
  it('new link revokes previous; revoke endpoint kills access; list hides tokens', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db); const t = await createTrip(db); await join(db, t, p)
    const mk = () => authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })
    const t1 = (await mk()).json().token
    const t2 = (await mk()).json().token
    const me = (tok) => app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${tok}` } })
    expect((await me(t1)).statusCode).toBe(401)
    expect((await me(t2)).statusCode).toBe(200)
    const links = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/links` })).json().links
    expect(links.find(l => !l.revoked_at)).toBeTruthy()
    const active = links.find(l => !l.revoked_at)
    await authedInject(app, cookie, { method: 'POST', url: `/api/links/${active.id}/revoke` })
    expect((await me(t2)).statusCode).toBe(401)
  })
  it('404 when person not on trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db); const t = await createTrip(db)
    expect((await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })).statusCode).toBe(404)
  })
})
