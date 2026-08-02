import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

describe('readiness', () => {
  it('returns full readiness shape', async () => {
    const { app, db } = await makeTestApp()
    const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, {
      date_mode: 'confirmed', start_date: '2026-10-02', end_date: '2026-10-06',
      destination_mode: 'decided', destination: 'Goa',
    })

    const asha = await createPerson(db, { name: 'Asha' })
    const ravi = await createPerson(db, { name: 'Ravi' })
    const priya = await createPerson(db, { name: 'Priya' })

    await db.run('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,1)', [t.id, asha.id])
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, ravi.id])
    await db.run('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,1)', [t.id, priya.id])

    const insDoc = async (id, personId, docType, expiryDate) => db.run(
      `INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
       VALUES (?,?,?,?,'x','x','application/pdf',1)`,
      [id, personId, docType, expiryDate]
    )
    await insDoc('d1', asha.id, 'passport', '2030-01-01')   // healthy, beyond horizon
    await insDoc('d2', priya.id, 'visa', '2026-09-01')      // expired, before trip end

    await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)',
      ['l1', t.id, asha.id, 'hash1'])
    await db.run(
      `INSERT INTO participant_links (id,trip_id,person_id,token_hash,revoked_at)
       VALUES (?,?,?,?,to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))`,
      ['l2', t.id, priya.id, 'hash2']
    )

    await db.run('INSERT INTO budget_lines (id,trip_id,category,estimate) VALUES (?,?,?,?)',
      [randomUUID(), t.id, 'stay', 12000])

    for (let i = 0; i < 4; i++) {
      await db.run('INSERT INTO itinerary_days (id,trip_id,day_date,position) VALUES (?,?,?,?)',
        [randomUUID(), t.id, `2026-10-0${2 + i}`, i])
    }

    const checklistId = randomUUID()
    await db.run('INSERT INTO checklists (id,trip_id,kind,name,organizer_id) VALUES (?,?,?,?,?)',
      [checklistId, t.id, 'tasks', 'Trip tasks', t.organizer_id])
    const insItem = async (id, title, assigneeId, dueDate, done, position) => db.run(
      `INSERT INTO checklist_items (id,checklist_id,title,assignee_person_id,due_date,done,position)
       VALUES (?,?,?,?,?,?,?)`,
      [id, checklistId, title, assigneeId, dueDate, done, position]
    )
    await insItem(randomUUID(), 'Book bus', asha.id, '2020-01-01', 0, 0)   // overdue
    await insItem(randomUUID(), 'Pack bags', asha.id, null, 1, 1)          // done
    await insItem(randomUUID(), 'Buy snacks', null, '2030-01-01', 0, 2)    // future

    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/readiness` })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.participants).toHaveLength(3)
    const byName = Object.fromEntries(body.participants.map((p) => [p.name, p]))

    expect(byName.Asha.profile_confirmed).toBe(1)
    expect(byName.Asha.docs_count).toBe(1)
    expect(byName.Asha.doc_warnings).toEqual([])
    expect(byName.Asha.has_active_link).toBe(true)

    expect(byName.Ravi.profile_confirmed).toBe(0)
    expect(byName.Ravi.docs_count).toBe(0)
    expect(byName.Ravi.doc_warnings).toEqual([])
    expect(byName.Ravi.has_active_link).toBe(false)

    expect(byName.Priya.docs_count).toBe(1)
    expect(byName.Priya.doc_warnings).toEqual([{ doc_type: 'visa', expiry_date: '2026-09-01', level: 'expired' }])
    expect(byName.Priya.has_active_link).toBe(false)

    expect(body.decisions).toEqual({
      dates_confirmed: true, destination_decided: true, budget_drafted: true, itinerary_days: 4,
    })

    expect(body.checklists.total_items).toBe(3)
    expect(body.checklists.done_items).toBe(1)
    expect(body.checklists.overdue).toEqual([{ title: 'Book bus', due_date: '2020-01-01', assignee_name: 'Asha' }])
  })

  // The readiness view compares expires_at against
  // to_char(now() ..., 'YYYY-MM-DD HH24:MI:SS'). While links.routes.js wrote ISO-8601,
  // 'T' (0x54) sorted above ' ' (0x20), so on its own expiry date a dead link still read
  // as active here for up to ~24h. A probe using dates that differ before index 10 can
  // never see that — hence the same-date pair below.
  it('has_active_link: true for a link expiring later today, false for one that expired earlier today', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db)
    const alive = await createPerson(db, { name: 'Alive' })
    const dead = await createPerson(db, { name: 'Dead' })
    for (const p of [alive, dead])
      await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])

    // Created through the real route, so the stored value is whatever the app writes.
    const mk = (person, days) => authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${t.id}/participants/${person.id}/link`,
      payload: { expires_in_days: days },
    })
    await mk(alive, 0.01)   // ~14 min from now, same UTC date
    await mk(dead, -0.01)   // ~14 min ago, same UTC date

    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/readiness` })
    expect(res.statusCode).toBe(200)
    const byName = Object.fromEntries(res.json().participants.map((p) => [p.name, p]))
    expect(byName.Alive.has_active_link).toBe(true)
    expect(byName.Dead.has_active_link).toBe(false)
  })

  it('404s for unknown trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'GET', url: '/api/trips/nope/readiness' })
    expect(res.statusCode).toBe(404)
  })
})
