import { describe, it, expect } from 'vitest'
import { makeTestApp, createPerson, createTrip } from './helpers.js'

function seedLink(app, db, t, p, { expiresAt = null } = {}) {
  const raw = 'y'.repeat(43)
  db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash,expires_at) VALUES (?,?,?,?,?)')
    .run('lk1', t.id, p.id, app.hashToken(raw), expiresAt)
  db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p.id)
  return raw
}

describe('participant self-service', () => {
  it('GET /participant/me returns participant-safe trip subset + own person, no participants key', async () => {
    const { app, db } = await makeTestApp()
    const p = createPerson(db, { dietary: 'veg' })
    const t = createTrip(db, { description: 'A fun trip', destination: 'Goa' })
    db.prepare('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place) VALUES (?,?,?,?,?)')
      .run('g1', t.id, 'Beach day', '2026-01-01', 'Baga Beach')
    const raw = seedLink(app, db, t, p)
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.trip).not.toHaveProperty('participants')
    expect(body.trip).toMatchObject({ id: t.id, name: t.name, destination: 'Goa' })
    expect(body.trip.goals).toEqual([{ title: 'Beach day', fixed_date: '2026-01-01', fixed_place: 'Baga Beach' }])
    expect(body.person.id).toBe(p.id)
    expect(body.profile_confirmed).toBe(0)
  })

  it('PUT /participant/profile updates person and sets profile_confirmed=1', async () => {
    const { app, db } = await makeTestApp()
    const p = createPerson(db)
    const t = createTrip(db)
    const raw = seedLink(app, db, t, p)
    const res = await app.inject({
      method: 'PUT', url: '/api/participant/profile',
      headers: { authorization: `Bearer ${raw}` },
      payload: { dietary: 'vegan', interests: ['food'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().person).toMatchObject({ dietary: 'vegan', interests: ['food'] })
    const row = db.prepare('SELECT profile_confirmed FROM trip_participants WHERE trip_id = ? AND person_id = ?').get(t.id, p.id)
    expect(row.profile_confirmed).toBe(1)
  })

  it('expired link returns 401', async () => {
    const { app, db } = await makeTestApp()
    const p = createPerson(db)
    const t = createTrip(db)
    const raw = seedLink(app, db, t, p, { expiresAt: '2000-01-01T00:00:00.000Z' })
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.statusCode).toBe(401)
  })
})
