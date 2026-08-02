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
  // expires_at used to be written as ISO-8601 (`2026-08-09T12:00:00.000Z`), violating
  // this branch's TEXT-timestamp invariant, and its two consumers compared it in two
  // different formats. Gate the stored format itself, then both directions of the
  // same-date case that the format mismatch hid — see readiness.test.js for the other
  // consumer.
  const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

  it('stores expires_at in the YYYY-MM-DD HH24:MI:SS UTC format the rest of the schema uses', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db); const t = await createTrip(db); await join(db, t, p)
    await authedInject(app, cookie,
      { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: { expires_in_days: 7 } })
    const row = await db.get('SELECT expires_at FROM participant_links LIMIT 1')
    expect(row.expires_at).toMatch(TS_RE)
    // and it must sort correctly against the same expression every consumer compares to
    const { later } = await db.get(
      `SELECT (? > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) AS later`, [row.expires_at])
    expect(later).toBe(true)
  })

  it('auth accepts a link expiring later today and rejects one that expired earlier today', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db)
    const alive = await createPerson(db); const dead = await createPerson(db)
    await join(db, t, alive); await join(db, t, dead)

    const mk = async (person, days) => (await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${t.id}/participants/${person.id}/link`,
      payload: { expires_in_days: days },
    })).json().token
    const aliveToken = await mk(alive, 0.01)  // ~14 min from now, same UTC date
    const deadToken = await mk(dead, -0.01)   // ~14 min ago, same UTC date

    const me = (tok) => app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${tok}` } })
    expect((await me(aliveToken)).statusCode).toBe(200)
    const rejected = await me(deadToken)
    expect(rejected.statusCode).toBe(401)
    expect(rejected.json().error.code).toBe('INVALID_TOKEN')
  })

  it('404 when person not on trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db); const t = await createTrip(db)
    expect((await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })).statusCode).toBe(404)
  })
})
