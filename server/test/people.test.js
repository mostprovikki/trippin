import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip } from './helpers.js'

describe('people', () => {
  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/people' })).statusCode).toBe(401)
  })
  it('CRUD round-trip with interests array + partial update', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const created = await authedInject(app, cookie, { method: 'POST', url: '/api/people',
      payload: { name: 'Asha', dietary: 'veg', interests: ['trekking', 'food'], home_city: 'Chennai' } })
    expect(created.statusCode).toBe(201)
    const p = created.json().person
    expect(p.interests).toEqual(['trekking', 'food'])
    const upd = await authedInject(app, cookie, { method: 'PUT', url: `/api/people/${p.id}`, payload: { pace: 'relaxed' } })
    expect(upd.json().person).toMatchObject({ name: 'Asha', pace: 'relaxed', dietary: 'veg' })
    const list = await authedInject(app, cookie, { method: 'GET', url: '/api/people' })
    expect(list.json().people).toHaveLength(1)
  })
  it('rejects bad enum, 404 unknown id, 409 delete when in active trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const bad = await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'X', dietary: 'carnivore' } })
    expect(bad.statusCode).toBe(400)
    expect((await authedInject(app, cookie, { method: 'GET', url: '/api/people/nope' })).statusCode).toBe(404)
    const p = (await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'Y' } })).json().person
    const t = createTrip(db)
    db.prepare('INSERT INTO trip_participants (trip_id, person_id) VALUES (?,?)').run(t.id, p.id)
    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/people/${p.id}` })
    expect(del.statusCode).toBe(409); expect(del.json().error.code).toBe('TRIP_MEMBER')
  })
})
