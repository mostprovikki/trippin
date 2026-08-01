import { describe, it, expect } from 'vitest'
import { makeTestApp, createPerson, createTrip } from './helpers.js'
import { expiryWarnings } from '../src/lib/expiry.js'

describe('expiryWarnings', () => {
  it('flags expired and <6mo-after-trip docs, ignores healthy ones', async () => {
    const { db } = await makeTestApp()
    const t = await createTrip(db, { end_date: '2026-10-06', date_mode: 'confirmed', start_date: '2026-10-02' })
    const p = await createPerson(db, { name: 'Asha' })
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])
    const ins = async (id, docType, expiryDate) => db.run(
      `INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
       VALUES (?,?,?,?,'x','x','application/pdf',1)`,
      [id, p.id, docType, expiryDate]
    )
    await ins('d1', 'passport', '2026-09-01')   // expired before trip end
    await ins('d2', 'visa', '2027-01-01')       // within 6 months after
    await ins('d3', 'national_id', '2030-01-01') // fine
    const w = await expiryWarnings(db, t.id)
    expect(w.map(x => [x.document_id, x.level])).toEqual([['d1', 'expired'], ['d2', 'warning']])
  })
})
