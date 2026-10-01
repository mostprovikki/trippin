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
