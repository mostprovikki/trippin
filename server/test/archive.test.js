import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

function seedParticipantLink(app, db, tripId, personId) {
  db.prepare('INSERT INTO participant_links (id, trip_id, person_id, token_hash) VALUES (?,?,?,?)')
    .run(randomUUID(), tripId, personId, app.hashToken(randomUUID()))
}

describe('archive routes', () => {
  let app, db, cookie
  beforeEach(async () => {
    ;({ app, db } = await makeTestApp())
    ;({ cookie } = loginOrganizer(app, db))
  })

  it('archives a trip: builds snapshot, sets status/archived_at, revokes links', async () => {
    const trip = createTrip(db, { name: 'Goa Trip', vibe_tags: JSON.stringify(['beach']), status: 'confirmed' })
    const person = createPerson(db, { name: 'Alice' })
    db.prepare('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)').run(trip.id, person.id)
    seedParticipantLink(app, db, trip.id, person.id)
    db.prepare('INSERT INTO budget_lines (id, trip_id, category, estimate) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), trip.id, 'stay', 1000)

    const res = await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${trip.id}/archive`,
      payload: { notes: 'great trip', photo_links: ['http://x.com/1.jpg'] }
    })
    expect(res.statusCode).toBe(200)
    const { archive } = res.json()
    expect(archive.notes).toBe('great trip')
    expect(archive.photo_links).toEqual(['http://x.com/1.jpg'])
    expect(archive.snapshot.trip.name).toBe('Goa Trip')
    expect(archive.snapshot.budget.lines.some((l) => l.category === 'stay' && l.estimate === 1000)).toBe(true)
    expect(archive.snapshot.itinerary).toEqual([])
    expect(archive.snapshot.checklists).toEqual([])

    const updated = db.prepare('SELECT status, archived_at FROM trips WHERE id = ?').get(trip.id)
    expect(updated.status).toBe('archived')
    expect(updated.archived_at).toBeTruthy()

    const link = db.prepare('SELECT revoked_at FROM participant_links WHERE trip_id = ?').get(trip.id)
    expect(link.revoked_at).toBeTruthy()
  })

  it('409 ALREADY_ARCHIVED on re-archive', async () => {
    const trip = createTrip(db, { status: 'confirmed' })
    const first = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
    expect(first.statusCode).toBe(200)
    const second = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('ALREADY_ARCHIVED')
  })

  it('GET archive 404 NOT_ARCHIVED when no archive exists', async () => {
    const trip = createTrip(db)
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/archive` })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_ARCHIVED')
  })

  it('GET archive returns snapshot + notes + photo_links + actuals', async () => {
    const trip = createTrip(db, { status: 'confirmed' })
    await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: { notes: 'n', photo_links: [] } })
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/archive` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.archive.notes).toBe('n')
    expect(body.archive.archived_at).toBeTruthy()
    expect(body.actuals).toEqual([])
  })

  it('PUT archive updates notes/photo_links only', async () => {
    const trip = createTrip(db, { status: 'confirmed' })
    await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
    const res = await authedInject(app, cookie, {
      method: 'PUT', url: `/api/trips/${trip.id}/archive`,
      payload: { notes: 'updated', photo_links: ['http://a.com/1.jpg', 'http://a.com/2.jpg'] }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().archive.notes).toBe('updated')
    expect(res.json().archive.photo_links).toEqual(['http://a.com/1.jpg', 'http://a.com/2.jpg'])
  })

  it('PUT actuals replaces-all and validates category', async () => {
    const trip = createTrip(db, { status: 'confirmed' })
    await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })

    const bad = await authedInject(app, cookie, {
      method: 'PUT', url: `/api/trips/${trip.id}/actuals`,
      payload: { actuals: [{ category: 'not_a_category', amount: 10 }] }
    })
    expect(bad.statusCode).toBe(400)

    const ok = await authedInject(app, cookie, {
      method: 'PUT', url: `/api/trips/${trip.id}/actuals`,
      payload: { actuals: [{ category: 'stay', amount: 1200 }, { category: 'food', amount: 300 }] }
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().actuals).toEqual(expect.arrayContaining([
      { category: 'stay', amount: 1200 }, { category: 'food', amount: 300 }
    ]))

    const replace = await authedInject(app, cookie, {
      method: 'PUT', url: `/api/trips/${trip.id}/actuals`,
      payload: { actuals: [{ category: 'stay', amount: 999 }] }
    })
    expect(replace.statusCode).toBe(200)
    expect(replace.json().actuals).toEqual([{ category: 'stay', amount: 999 }])
  })

  it('clones a trip as a new idea trip, copying only allowed fields', async () => {
    const trip = createTrip(db, {
      name: 'Original', status: 'confirmed', vibe_tags: JSON.stringify(['chill']),
      origin_city: 'Chennai', currency: 'INR', destination: 'Goa',
      start_date: '2026-01-01', end_date: '2026-01-05'
    })
    const person = createPerson(db, { name: 'Bob' })
    db.prepare('INSERT INTO trip_participants (trip_id, person_id, profile_confirmed) VALUES (?, ?, 1)').run(trip.id, person.id)
    db.prepare('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), trip.id, 'See waterfalls', '2026-01-02', 'Dudhsagar', 'bring shoes')
    db.prepare('INSERT INTO budget_lines (id, trip_id, category, estimate, basis) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), trip.id, 'stay', 5000, '4n')
    const checklistId = randomUUID()
    db.prepare('INSERT INTO checklists (id, trip_id, is_template, kind, name) VALUES (?, ?, 0, ?, ?)')
      .run(checklistId, trip.id, 'packing', 'Packing')
    db.prepare('INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position) VALUES (?, ?, ?, ?, ?, 1, 0)')
      .run(randomUUID(), checklistId, 'Pack sunscreen', person.id, '2025-12-31')

    const res = await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${trip.id}/clone`, payload: { name: 'Original (Clone)' }
    })
    expect(res.statusCode).toBe(201)
    const { trip: cloned } = res.json()
    expect(cloned.name).toBe('Original (Clone)')
    expect(cloned.status).toBe('idea')
    expect(cloned.origin_city).toBe('Chennai')
    expect(cloned.currency).toBe('INR')
    expect(cloned.vibe_tags).toEqual(['chill'])
    expect(cloned.destination).toBeFalsy()
    expect(cloned.start_date).toBeFalsy()
    expect(cloned.end_date).toBeFalsy()

    expect(cloned.goals.length).toBe(1)
    expect(cloned.goals[0].title).toBe('See waterfalls')
    expect(cloned.goals[0].fixed_date).toBeFalsy()
    expect(cloned.goals[0].fixed_place).toBeFalsy()
    expect(cloned.goals[0].notes).toBe('bring shoes')

    expect(cloned.participants.length).toBe(1)
    expect(cloned.participants[0].profile_confirmed).toBe(0)

    const clonedBudget = db.prepare('SELECT * FROM budget_lines WHERE trip_id = ?').all(cloned.id)
    expect(clonedBudget.some((l) => l.category === 'stay' && l.estimate === 5000)).toBe(true)

    const clonedChecklists = db.prepare('SELECT * FROM checklists WHERE trip_id = ?').all(cloned.id)
    expect(clonedChecklists.length).toBe(1)
    const clonedItems = db.prepare('SELECT * FROM checklist_items WHERE checklist_id = ?').all(clonedChecklists[0].id)
    expect(clonedItems.length).toBe(1)
    expect(clonedItems[0].done).toBe(0)
    expect(clonedItems[0].assignee_person_id).toBeFalsy()
    expect(clonedItems[0].due_date).toBeFalsy()

    const originalStillThere = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id)
    expect(originalStillThere.name).toBe('Original')
  })
})
