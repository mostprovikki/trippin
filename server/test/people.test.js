import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip } from './helpers.js'

describe('people', () => {
  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/people' })).statusCode).toBe(401)
  })
  it('CRUD round-trip with interests array + partial update', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
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
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const bad = await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'X', dietary: 'carnivore' } })
    expect(bad.statusCode).toBe(400)
    expect((await authedInject(app, cookie, { method: 'GET', url: '/api/people/nope' })).statusCode).toBe(404)
    const p = (await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'Y' } })).json().person
    const t = await createTrip(db)
    await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?,?)', [t.id, p.id])
    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/people/${p.id}` })
    expect(del.statusCode).toBe(409); expect(del.json().error.code).toBe('TRIP_MEMBER')
  })
  it('409 with message (not 500) when deleting a person on an archived trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = (await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'Z' } })).json().person
    const t = await createTrip(db)
    await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?,?)', [t.id, p.id])
    await db.run("UPDATE trips SET status = 'archived' WHERE id = ?", [t.id])
    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/people/${p.id}` })
    expect(del.statusCode).toBe(409)
    expect(del.json().error).toMatchObject({ code: 'ARCHIVED_TRIP_MEMBER' })
    expect(del.json().error.message).toMatch(/archived trip/i)
    expect((await authedInject(app, cookie, { method: 'GET', url: `/api/people/${p.id}` })).statusCode).toBe(200)
  })
  it('deleting a person assigned a template item succeeds; item becomes unassigned', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = (await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'W' } })).json().person
    await db.run("INSERT INTO checklists (id, is_template, kind, name) VALUES ('tpl1', 1, 'tasks', 'Tpl')")
    await db.run("INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, position) VALUES ('ci1', 'tpl1', 'Visa', ?, 0)", [p.id])
    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/people/${p.id}` })
    expect(del.statusCode).toBe(204)
    expect((await db.get("SELECT assignee_person_id FROM checklist_items WHERE id = 'ci1'")).assignee_person_id).toBeNull()
  })
})
