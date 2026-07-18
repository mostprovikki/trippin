import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

describe('readiness', () => {
  it('returns full readiness shape', async () => {
    const { app, db } = await makeTestApp()
    const { cookie } = loginOrganizer(app, db)
    const t = createTrip(db, {
      date_mode: 'confirmed', start_date: '2026-10-02', end_date: '2026-10-06',
      destination_mode: 'decided', destination: 'Goa',
    })

    const asha = createPerson(db, { name: 'Asha' })
    const ravi = createPerson(db, { name: 'Ravi' })
    const priya = createPerson(db, { name: 'Priya' })

    db.prepare('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,1)').run(t.id, asha.id)
    db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, ravi.id)
    db.prepare('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,1)').run(t.id, priya.id)

    const insDoc = db.prepare(`INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,'x','x','application/pdf',1)`)
    insDoc.run('d1', asha.id, 'passport', '2030-01-01')   // healthy, beyond horizon
    insDoc.run('d2', priya.id, 'visa', '2026-09-01')      // expired, before trip end

    db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)')
      .run('l1', t.id, asha.id, 'hash1')
    db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash,revoked_at) VALUES (?,?,?,?,datetime())')
      .run('l2', t.id, priya.id, 'hash2')

    db.prepare('INSERT INTO budget_lines (id,trip_id,category,estimate) VALUES (?,?,?,?)')
      .run(randomUUID(), t.id, 'stay', 12000)

    for (let i = 0; i < 4; i++) {
      db.prepare('INSERT INTO itinerary_days (id,trip_id,day_date,position) VALUES (?,?,?,?)')
        .run(randomUUID(), t.id, `2026-10-0${2 + i}`, i)
    }

    const checklistId = randomUUID()
    db.prepare('INSERT INTO checklists (id,trip_id,kind,name) VALUES (?,?,?,?)').run(checklistId, t.id, 'tasks', 'Trip tasks')
    const insItem = db.prepare(`INSERT INTO checklist_items (id,checklist_id,title,assignee_person_id,due_date,done,position)
      VALUES (?,?,?,?,?,?,?)`)
    insItem.run(randomUUID(), checklistId, 'Book bus', asha.id, '2020-01-01', 0, 0)   // overdue
    insItem.run(randomUUID(), checklistId, 'Pack bags', asha.id, null, 1, 1)          // done
    insItem.run(randomUUID(), checklistId, 'Buy snacks', null, '2030-01-01', 0, 2)    // future

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

  it('404s for unknown trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'GET', url: '/api/trips/nope/readiness' })
    expect(res.statusCode).toBe(404)
  })
})
