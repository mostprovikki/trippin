import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createPerson } from './helpers.js'

async function mkTrip(app, cookie, extra = {}) {
  return (await authedInject(app, cookie, { method: 'POST', url: '/api/trips',
    payload: { name: 'Goa', vibe_tags: ['chill','beach'], origin_city: 'Chennai', ...extra } })).json().trip
}

describe('trips', () => {
  it('creates trip with defaults idea/broad/open and participant_ids', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db)
    const t = await mkTrip(app, cookie, { participant_ids: [p.id] })
    expect(t).toMatchObject({ status: 'idea', date_mode: 'broad', destination_mode: 'open', vibe_tags: ['chill','beach'] })
    expect(t.participants).toEqual([{ person_id: p.id, name: p.name, profile_confirmed: 0 }])
    expect(t.windows).toEqual([])
    expect(t.goals).toEqual([])
  })

  it('POST /api/trips returns 201', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/trips', payload: { name: 'Goa' } })
    expect(res.statusCode).toBe(201)
  })

  it('GET /api/trips lists summaries, supports status filter', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db)
    await mkTrip(app, cookie, { name: 'Goa', participant_ids: [p.id] })
    await mkTrip(app, cookie, { name: 'Manali' })
    const all = await authedInject(app, cookie, { method: 'GET', url: '/api/trips' })
    expect(all.json().trips).toHaveLength(2)
    const summary = all.json().trips.find(t => t.name === 'Goa')
    expect(summary).toMatchObject({ name: 'Goa', status: 'idea', participant_count: 1 })

    const filtered = await authedInject(app, cookie, { method: 'GET', url: '/api/trips?status=idea' })
    expect(filtered.json().trips).toHaveLength(2)
    const none = await authedInject(app, cookie, { method: 'GET', url: '/api/trips?status=active' })
    expect(none.json().trips).toHaveLength(0)
  })

  it('GET /api/trips/:id returns trip or 404', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().trip.id).toBe(t.id)

    const missing = await authedInject(app, cookie, { method: 'GET', url: '/api/trips/does-not-exist' })
    expect(missing.statusCode).toBe(404)
  })

  it('PUT /api/trips/:id partial update', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const res = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`,
      payload: { description: 'Beach trip', origin_city: 'Chennai' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().trip).toMatchObject({ description: 'Beach trip', origin_city: 'Chennai', name: 'Goa' })

    const missing = await authedInject(app, cookie, { method: 'PUT', url: '/api/trips/does-not-exist', payload: { name: 'x' } })
    expect(missing.statusCode).toBe(404)
  })

  it('windows replace-all; goals CRUD with fixed_date hard constraint stored', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const w = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/windows`,
      payload: { windows: [{ start_date: '2026-10-02', end_date: '2026-10-06' }, { start_date: '2026-10-16', end_date: '2026-10-20', note: 'after payday' }] } })
    expect(w.json().windows).toHaveLength(2)

    // replace-all: calling again with fewer windows drops the old ones
    const w2 = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/windows`,
      payload: { windows: [{ start_date: '2026-11-01', end_date: '2026-11-05' }] } })
    expect(w2.json().windows).toHaveLength(1)
    expect(w2.json().windows[0]).toMatchObject({ start_date: '2026-11-01', end_date: '2026-11-05' })

    const g = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/goals`,
      payload: { title: 'Sunburn concert', fixed_date: '2026-10-04', fixed_place: 'Vagator' } })
    expect(g.statusCode).toBe(201)
    const goalId = g.json().id
    expect(g.json()).toMatchObject({ title: 'Sunburn concert', fixed_date: '2026-10-04', fixed_place: 'Vagator' })

    const upd = await authedInject(app, cookie, { method: 'PUT', url: `/api/goals/${goalId}`, payload: { title: 'Sunburn Festival' } })
    expect(upd.statusCode).toBe(200)

    const afterUpdate = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(afterUpdate.json().trip.goals.find(gl => gl.id === goalId).title).toBe('Sunburn Festival')

    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/goals/${goalId}` })
    expect(del.statusCode).toBe(204)

    const afterDelete = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(afterDelete.json().trip.goals).toHaveLength(0)
  })

  it('participants: add returns trip, 409 on duplicate, delete removes', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const p = createPerson(db)
    const add = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants`, payload: { person_id: p.id } })
    expect(add.statusCode).toBe(201)
    expect(add.json().trip.participants).toEqual([{ person_id: p.id, name: p.name, profile_confirmed: 0 }])

    const dup = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants`, payload: { person_id: p.id } })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('ALREADY_MEMBER')

    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/trips/${t.id}/participants/${p.id}` })
    expect(del.statusCode).toBe(204)

    const after = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(after.json().trip.participants).toHaveLength(0)
  })

  it('lifecycle: idea→planning ok; planning→confirmed blocked until dates+destination ready; archived rejected here', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const s = (status) => authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/status`, payload: { status } })
    expect((await s('planning')).statusCode).toBe(200)
    const notReady = await s('confirmed')
    expect(notReady.statusCode).toBe(400); expect(notReady.json().error.code).toBe('NOT_READY')
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`,
      payload: { date_mode: 'confirmed', start_date: '2026-10-02', end_date: '2026-10-06', destination_mode: 'decided', destination: 'Goa' } })
    expect((await s('confirmed')).statusCode).toBe(200)
    expect((await s('idea')).statusCode).toBe(400)
    expect((await s('idea')).json().error.code).toBe('BAD_TRANSITION')
    expect((await s('archived')).statusCode).toBe(400)
    expect((await s('archived')).json().error.code).toBe('USE_ARCHIVE_ENDPOINT')
  })

  it('status 404 on missing trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/trips/does-not-exist/status', payload: { status: 'planning' } })
    expect(res.statusCode).toBe(404)
  })

  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/trips' })
    expect(res.statusCode).toBe(401)
  })
})
