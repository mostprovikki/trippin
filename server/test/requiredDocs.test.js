import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

async function insDoc(db, personId, docType) {
  await db.run(
    `INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
     VALUES (?,?,?,NULL,'x','x','application/pdf',1)`, [`d-${personId}-${docType}`, personId, docType])
}

describe('trip required_doc_types → readiness missing_docs', () => {
  it('saves the list and reports each participant missing a required type', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { start_date: '2027-01-10', end_date: '2027-01-15' })
    const priya = await createPerson(db, { name: 'Priya' })
    const ravi = await createPerson(db, { name: 'Ravi' })
    for (const p of [priya, ravi]) await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])
    await insDoc(db, ravi.id, 'visa'); await insDoc(db, ravi.id, 'passport'); await insDoc(db, priya.id, 'passport')
    const put = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`, payload: { required_doc_types: ['passport', 'visa'] } })
    expect(put.statusCode).toBe(200)
    expect(put.json().trip.required_doc_types).toEqual(['passport', 'visa'])
    const r = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/readiness` })
    const by = Object.fromEntries(r.json().participants.map((p) => [p.name, p.missing_docs]))
    expect(by).toEqual({ Priya: ['visa'], Ravi: [] })
  })
  it('defaults to none required', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db)
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(res.json().trip.required_doc_types).toEqual([])
  })
  it('rejects an unknown type with 400 and writes nothing (validate before write)', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { name: 'Before' })
    const res = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`, payload: { name: 'After', required_doc_types: ['passport', 'ticket'] } })
    expect(res.statusCode).toBe(400)
    const row = await db.get('SELECT name, required_doc_types FROM trips WHERE id = ?', [t.id])
    expect(row).toEqual({ name: 'Before', required_doc_types: '[]' })
  })
  it('rejects a non-array', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db)
    const res = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`, payload: { required_doc_types: 'visa' } })
    expect(res.statusCode).toBe(400)
  })
})
