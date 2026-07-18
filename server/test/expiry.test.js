import { describe, it, expect } from 'vitest'
import { makeTestApp, createPerson, createTrip } from './helpers.js'
import { expiryWarnings } from '../src/lib/expiry.js'

describe('expiryWarnings', () => {
  it('flags expired and <6mo-after-trip docs, ignores healthy ones', async () => {
    const { db } = await makeTestApp()
    const t = createTrip(db, { end_date: '2026-10-06', date_mode: 'confirmed', start_date: '2026-10-02' })
    const p = createPerson(db, { name: 'Asha' })
    db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p.id)
    const ins = db.prepare(`INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,'x','x','application/pdf',1)`)
    ins.run('d1', p.id, 'passport', '2026-09-01')   // expired before trip end
    ins.run('d2', p.id, 'visa', '2027-01-01')       // within 6 months after
    ins.run('d3', p.id, 'national_id', '2030-01-01') // fine
    const w = expiryWarnings(db, t.id)
    expect(w.map(x => [x.document_id, x.level])).toEqual([['d1', 'expired'], ['d2', 'warning']])
  })
})
