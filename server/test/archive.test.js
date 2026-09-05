import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson, createOrganizer } from './helpers.js'

async function seedParticipantLink(app, db, tripId, personId) {
  await db.run('INSERT INTO participant_links (id, trip_id, person_id, token_hash) VALUES (?,?,?,?)',
    [randomUUID(), tripId, personId, app.hashToken(randomUUID())])
}

describe('archive routes', () => {
  let app, db, cookie
  beforeEach(async () => {
    ;({ app, db } = await makeTestApp())
    ;({ cookie } = await loginOrganizer(app, db))
  })

  it('archives a trip: builds snapshot, sets status/archived_at, revokes links', async () => {
    const trip = await createTrip(db, { name: 'Goa Trip', vibe_tags: JSON.stringify(['beach']), status: 'confirmed' })
    const person = await createPerson(db, { name: 'Alice' })
    await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [trip.id, person.id])
    await seedParticipantLink(app, db, trip.id, person.id)
    await db.run('INSERT INTO budget_lines (id, trip_id, category, estimate) VALUES (?, ?, ?, ?)',
      [randomUUID(), trip.id, 'stay', 1000])

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

    const updated = await db.get('SELECT status, archived_at FROM trips WHERE id = ?', [trip.id])
    expect(updated.status).toBe('archived')
    expect(updated.archived_at).toBeTruthy()

    const link = await db.get('SELECT revoked_at FROM participant_links WHERE trip_id = ?', [trip.id])
    expect(link.revoked_at).toBeTruthy()
  })

  it('archives a trip with a full itinerary and checklists: snapshot preserves day/item order and content', async () => {
    const trip = await createTrip(db, { name: 'Content Trip', status: 'confirmed' })

    // 3 days x 2 items — day and item order both come from an explicit position column,
    // so the snapshot must reproduce it regardless of query concurrency/timing.
    const dayIds = []
    for (let d = 0; d < 3; d++) {
      const id = randomUUID()
      dayIds.push(id)
      await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?, ?, ?, ?)',
        [id, trip.id, `2026-02-0${d + 1}`, d])
      for (let i = 0; i < 2; i++) {
        await db.run(
          `INSERT INTO itinerary_items (id, day_id, position, title, category)
           VALUES (?, ?, ?, ?, 'activity')`,
          [randomUUID(), id, i, `Day${d} Item${i}`]
        )
      }
    }

    // 3 checklists x 2 items. The archive snapshot is a write-once immutable blob, so
    // its checklist order is frozen forever and cannot be re-derived — checklistsSnapshot
    // therefore ORDER BYs, and this asserts the exact order, not a name-keyed match.
    const checklistNames = ['Packing A', 'Packing B', 'Tasks C']
    for (const name of checklistNames) {
      const checklistId = randomUUID()
      await db.run('INSERT INTO checklists (id, trip_id, is_template, kind, name, organizer_id) VALUES (?, ?, 0, ?, ?, ?)',
        [checklistId, trip.id, name === 'Tasks C' ? 'tasks' : 'packing', name, trip.organizer_id])
      for (let i = 0; i < 2; i++) {
        await db.run(
          'INSERT INTO checklist_items (id, checklist_id, title, done, position) VALUES (?, ?, ?, 0, ?)',
          [randomUUID(), checklistId, `${name} item${i}`, i]
        )
      }
    }

    // This handler builds its whole snapshot inside db.tx(). db.tx() now rejects any
    // reentrant query on its pinned client (see src/db.js `pinned`), so reintroducing a
    // Promise.all of db calls anywhere under this route turns this 200 into a 500 —
    // no process-level warning sniffing required.
    const res = await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {}
    })
    expect(res.statusCode).toBe(200)
    const { snapshot } = res.json().archive

    expect(snapshot.itinerary).toHaveLength(3)
    snapshot.itinerary.forEach((day, d) => {
      expect(day.day_date).toBe(`2026-02-0${d + 1}`)
      expect(day.items.map((it) => it.title)).toEqual([`Day${d} Item0`, `Day${d} Item1`])
    })

    expect(snapshot.checklists.map((c) => c.name)).toEqual(checklistNames)
    snapshot.checklists.forEach((c) => {
      expect(c.items.map((it) => it.title)).toEqual([`${c.name} item0`, `${c.name} item1`])
    })
  })

  // The gate the test above relies on, asserted directly. This used to be a
  // process.on('warning') sniff for pg's "already executing a query" deprecation, which
  // util.deprecate emits once per process no matter how many times it fires — so it only
  // ever worked by accident of test ordering and per-file process isolation, and pg v9
  // removes the warning entirely. The guard now lives in db.tx itself.
  it('db.tx rejects concurrent queries on its pinned client', async () => {
    await expect(db.tx(async () => {
      await Promise.all([
        db.get('SELECT 1 AS a'),
        db.get('SELECT 2 AS b'),
      ])
    })).rejects.toThrow(/concurrent query on the transaction client/)

    // ...and the same statements awaited one at a time are still fine.
    await expect(db.tx(async () => {
      await db.get('SELECT 1 AS a')
      await db.get('SELECT 2 AS b')
      return 'ok'
    })).resolves.toBe('ok')
  })

  it('409 ALREADY_ARCHIVED on re-archive', async () => {
    const trip = await createTrip(db, { status: 'confirmed' })
    const first = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
    expect(first.statusCode).toBe(200)
    const second = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('ALREADY_ARCHIVED')
  })

  it('GET archive 404 NOT_ARCHIVED when no archive exists', async () => {
    const trip = await createTrip(db)
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/archive` })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_ARCHIVED')
  })

  it('GET archive returns snapshot + notes + photo_links + actuals', async () => {
    const trip = await createTrip(db, { status: 'confirmed' })
    await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: { notes: 'n', photo_links: [] } })
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/archive` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.archive.notes).toBe('n')
    expect(body.archive.archived_at).toBeTruthy()
    expect(body.actuals).toEqual([])
  })

  it('PUT archive updates notes/photo_links only', async () => {
    const trip = await createTrip(db, { status: 'confirmed' })
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
    const trip = await createTrip(db, { status: 'confirmed' })
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
    const trip = await createTrip(db, {
      name: 'Original', status: 'confirmed', vibe_tags: JSON.stringify(['chill']),
      origin_city: 'Chennai', currency: 'INR', destination: 'Goa',
      start_date: '2026-01-01', end_date: '2026-01-05'
    })
    const person = await createPerson(db, { name: 'Bob' })
    await db.run('INSERT INTO trip_participants (trip_id, person_id, profile_confirmed) VALUES (?, ?, 1)', [trip.id, person.id])
    await db.run('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), trip.id, 'See waterfalls', '2026-01-02', 'Dudhsagar', 'bring shoes'])
    await db.run('INSERT INTO budget_lines (id, trip_id, category, estimate, basis) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), trip.id, 'stay', 5000, '4n'])
    const checklistId = randomUUID()
    await db.run('INSERT INTO checklists (id, trip_id, is_template, kind, name, organizer_id) VALUES (?, ?, 0, ?, ?, ?)',
      [checklistId, trip.id, 'packing', 'Packing', trip.organizer_id])
    await db.run('INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position) VALUES (?, ?, ?, ?, ?, 1, 0)',
      [randomUUID(), checklistId, 'Pack sunscreen', person.id, '2025-12-31'])

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

    const clonedBudget = await db.all('SELECT * FROM budget_lines WHERE trip_id = ?', [cloned.id])
    expect(clonedBudget.some((l) => l.category === 'stay' && l.estimate === 5000)).toBe(true)

    const clonedChecklists = await db.all('SELECT * FROM checklists WHERE trip_id = ?', [cloned.id])
    expect(clonedChecklists.length).toBe(1)
    const clonedItems = await db.all('SELECT * FROM checklist_items WHERE checklist_id = ?', [clonedChecklists[0].id])
    expect(clonedItems.length).toBe(1)
    expect(clonedItems[0].done).toBe(0)
    expect(clonedItems[0].assignee_person_id).toBeFalsy()
    expect(clonedItems[0].due_date).toBeFalsy()

    const originalStillThere = await db.get('SELECT * FROM trips WHERE id = ?', [trip.id])
    expect(originalStillThere.name).toBe('Original')
  })

  describe('unarchive', () => {
    it('flips status back to active, keeps archived_at cleared, keeps the archives row, keeps links revoked', async () => {
      const trip = await createTrip(db, { status: 'confirmed' })
      const person = await createPerson(db, { name: 'Alice' })
      await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [trip.id, person.id])
      await seedParticipantLink(app, db, trip.id, person.id)
      await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })

      const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
      expect(res.statusCode).toBe(200)
      expect(res.json().trip.status).toBe('active')
      expect(res.json().trip.archived_at).toBeFalsy()

      const archiveRow = await db.get('SELECT trip_id FROM archives WHERE trip_id = ?', [trip.id])
      expect(archiveRow).toBeTruthy()

      const link = await db.get('SELECT revoked_at FROM participant_links WHERE trip_id = ?', [trip.id])
      expect(link.revoked_at).toBeTruthy()
    })

    it('400 NOT_ARCHIVED when the trip is not archived', async () => {
      const trip = await createTrip(db, { status: 'confirmed' })
      const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('NOT_ARCHIVED')
    })

    it('404 for another organizer\'s trip', async () => {
      const other = await createOrganizer(db, { email: 'other2@x.dev' })
      const trip = await createTrip(db, { organizer_id: other.id, status: 'archived' })
      const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
      expect(res.statusCode).toBe(404)
    })

    it('allows re-archiving a trip after it was unarchived, replacing the old snapshot row', async () => {
      const trip = await createTrip(db, { status: 'confirmed' })
      await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
      await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })

      const before = await db.get('SELECT archived_at FROM archives WHERE trip_id = ?', [trip.id])
      await new Promise((r) => setTimeout(r, 1100)) // archived_at has 1-second text resolution
      const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
      expect(res.statusCode).toBe(200)

      const after = await db.get('SELECT archived_at FROM archives WHERE trip_id = ?', [trip.id])
      expect(after.archived_at).not.toBe(before.archived_at)
    })

    it('preserves notes/photo_links on a bodyless re-archive after unarchive', async () => {
      const trip = await createTrip(db, { status: 'confirmed' })
      await authedInject(app, cookie, {
        method: 'POST', url: `/api/trips/${trip.id}/archive`,
        payload: { notes: 'saved notes', photo_links: ['http://x.com/1.jpg'] }
      })
      await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })

      const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
      expect(res.statusCode).toBe(200)
      expect(res.json().archive.notes).toBe('saved notes')
      expect(res.json().archive.photo_links).toEqual(['http://x.com/1.jpg'])
    })
  })
})
