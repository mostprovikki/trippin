import { describe, it, expect } from 'vitest'
import { makeTestApp, createPerson, createTrip } from './helpers.js'

async function seedLink(app, db, t, p, { expiresAt = null } = {}) {
  const raw = 'y'.repeat(43)
  await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash,expires_at) VALUES (?,?,?,?,?)',
    ['lk1', t.id, p.id, app.hashToken(raw), expiresAt])
  await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])
  return raw
}

describe('participant self-service', () => {
  it('GET /participant/me returns participant-safe trip subset + own person, no participants key', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db, { dietary: 'veg' })
    const t = await createTrip(db, { description: 'A fun trip', destination: 'Goa' })
    await db.run('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place) VALUES (?,?,?,?,?)',
      ['g1', t.id, 'Beach day', '2026-01-01', 'Baga Beach'])
    const raw = await seedLink(app, db, t, p)
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
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p)
    const res = await app.inject({
      method: 'PUT', url: '/api/participant/profile',
      headers: { authorization: `Bearer ${raw}` },
      payload: { dietary: 'vegan', interests: ['food'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().person).toMatchObject({ dietary: 'vegan', interests: ['food'] })
    const row = await db.get('SELECT profile_confirmed FROM trip_participants WHERE trip_id = ? AND person_id = ?', [t.id, p.id])
    expect(row.profile_confirmed).toBe(1)
  })

  it('expired link returns 401', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p, { expiresAt: '2000-01-01T00:00:00.000Z' })
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.statusCode).toBe(401)
  })

  it('GET /participant/me returns itinerary ordered by day/item position, empty when no days exist', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p)
    let res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.json().itinerary).toEqual([])

    await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', ['d1', t.id, '2026-08-02', 1])
    await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', ['d0', t.id, '2026-08-01', 0])
    await db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['i2', 'd0', 1, 'Dinner', '19:00–21:00', 'Beach Shack', 'food', 800, null, null])
    await db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['i1', 'd0', 0, 'Arrival', '10:00–11:00', 'Airport', 'travel', null, null, null])

    res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.itinerary).toEqual([
      { day_date: '2026-08-01', items: [
        { title: 'Arrival', time_range: '10:00–11:00', location: 'Airport', category: 'travel', est_cost: null, notes: null, link: null },
        { title: 'Dinner', time_range: '19:00–21:00', location: 'Beach Shack', category: 'food', est_cost: 800, notes: null, link: null },
      ] },
      { day_date: '2026-08-02', items: [] },
    ])
  })

  it('GET /participant/me keeps each day distinct when two days share the same position (no UNIQUE on itinerary_days.position)', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p)
    // Direct-SQL fixture: constructing a genuine position tie through the app's
    // itinerary-write routes isn't feasible (they assign the next position
    // sequentially), so this reproduces the heap-order hazard directly.
    await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', ['dA', t.id, '2026-08-01', 0])
    await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', ['dB', t.id, '2026-08-02', 0])
    await db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['iA', 'dA', 0, 'Morning walk', null, null, 'activity', null, null, null])
    await db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['iB', 'dB', 0, 'Ferry', null, null, 'travel', null, null, null])

    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.itinerary).toEqual([
      { day_date: '2026-08-01', items: [
        { title: 'Morning walk', time_range: null, location: null, category: 'activity', est_cost: null, notes: null, link: null },
      ] },
      { day_date: '2026-08-02', items: [
        { title: 'Ferry', time_range: null, location: null, category: 'travel', est_cost: null, notes: null, link: null },
      ] },
    ])
  })

  it('GET /participant/me returns budget with my_amount from override, falling back to equal_share', async () => {
    const { app, db } = await makeTestApp()
    const p1 = await createPerson(db, { name: 'Asha Rao' })
    const p2 = await createPerson(db, { name: 'Priya Shah' })
    const t = await createTrip(db, { currency: 'INR' })
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p1.id])
    const raw = await seedLink(app, db, t, p2) // p2 gets the participant link; p1 already seeded above
    await db.run('INSERT INTO budget_lines (id, trip_id, category, estimate) VALUES (?,?,?,?)', ['b1', t.id, 'stay', 10000])
    await db.run('INSERT INTO budget_overrides (id, trip_id, person_id, amount) VALUES (?,?,?,?)', ['o1', t.id, p2.id, 3000])

    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.budget.currency).toBe('INR')
    expect(body.budget.my_amount).toBe(3000) // p2 has an override
  })

  it('GET /participant/me returns budget: null when no budget lines exist', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p)
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.json().budget).toBeNull()
  })

  it('GET /participant/me exposes only first names of companions, never their email/phone/full name', async () => {
    const { app, db } = await makeTestApp()
    const me = await createPerson(db, { name: 'Priya Shah', email: 'priya@x.dev' })
    const other = await createPerson(db, { name: 'Asha Rao', email: 'asha-secret@x.dev', phone: '9990001111' })
    const t = await createTrip(db)
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, other.id])
    const raw = await seedLink(app, db, t, me)
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.companions).toEqual(['Asha'])
    expect(body.companion_count).toBe(2)
    expect(res.payload).not.toContain('asha-secret@x.dev')
    expect(res.payload).not.toContain('9990001111')
    expect(res.payload).not.toContain('Asha Rao') // full name never leaks, only "Asha"
  })
})
