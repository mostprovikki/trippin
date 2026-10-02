import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

describe('readiness missing_fields', () => {
  it('lists absent required profile fields per participant', async () => {
    const { app, db } = await makeTestApp()
    const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { start_date: '2027-01-10', end_date: '2027-01-15' })
    const full = await createPerson(db, { name: 'Full', phone: '1', emergency_contact: 'x', dietary: 'veg' })
    // a blank (whitespace) phone is still missing
    const bare = await createPerson(db, { name: 'Bare', phone: '  ' })
    for (const p of [full, bare]) await db.run('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,1)', [t.id, p.id])
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/readiness` })
    const byName = Object.fromEntries(res.json().participants.map((p) => [p.name, p]))
    expect(byName.Full.missing_fields).toEqual([])
    expect(byName.Bare.missing_fields).toEqual(['phone', 'emergency_contact', 'dietary'])
    expect(byName.Bare.missing_docs).toEqual([])
  })
})

// trip-planner-cpp: tripper.md §2 Trips list "pick the trip that needs me".
// The list's missing_count must be the Overview's "N of M people" number —
// the same per-person rule as web/src/utils/overview.js missingRows: any
// expiry warning, missing required doc, missing required field, or unconfirmed.
describe('GET /trips missing_count', () => {
  it('counts the people the Overview lists as missing, per trip', async () => {
    const { app, db } = await makeTestApp()
    const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { start_date: '2027-01-10', end_date: '2027-01-15', required_doc_types: '["passport"]' })
    const done = { phone: '1', emergency_contact: 'x', dietary: 'veg' }
    const ok = await createPerson(db, { name: 'Ok', ...done })
    const noField = await createPerson(db, { name: 'NoField', phone: '1', emergency_contact: 'x' })
    const unconfirmed = await createPerson(db, { name: 'Unconfirmed', ...done })
    const expiring = await createPerson(db, { name: 'Expiring', ...done })
    const noDoc = await createPerson(db, { name: 'NoDoc', ...done })
    const join = (p, confirmed = 1) => db.run('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,?)', [t.id, p.id, confirmed])
    await join(ok); await join(noField); await join(unconfirmed, 0); await join(expiring); await join(noDoc)
    const doc = (id, personId, expiry) => db.run(
      `INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
       VALUES (?,?,'passport',?,'x','x','application/pdf',1)`, [id, personId, expiry])
    await doc('m1', ok.id, '2035-01-01'); await doc('m2', noField.id, '2035-01-01')
    await doc('m3', unconfirmed.id, '2035-01-01'); await doc('m4', expiring.id, '2027-03-01')
    const empty = await createTrip(db, { name: 'Nobody' })

    const list = (await authedInject(app, cookie, { method: 'GET', url: '/api/trips' })).json().trips
    const byId = Object.fromEntries(list.map((x) => [x.id, x]))
    expect(byId[t.id]).toMatchObject({ participant_count: 5, missing_count: 4 })
    expect(byId[empty.id]).toMatchObject({ participant_count: 0, missing_count: 0 })

    // same number the Overview derives from readiness
    const ready = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/readiness` })).json().participants
    const overviewMissing = ready.filter((p) => p.doc_warnings.length || p.missing_docs.length || p.missing_fields.length || !p.profile_confirmed)
    expect(overviewMissing.map((p) => p.name).sort()).toEqual(['Expiring', 'NoDoc', 'NoField', 'Unconfirmed'])
    expect(byId[t.id].missing_count).toBe(overviewMissing.length)
  })
})
