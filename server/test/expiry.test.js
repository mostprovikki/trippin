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

// trip-planner-0yh (3): with no trip end date the server compares against the
// latest date-window end, else today — and says which, so the copy can name it.
describe('expiryWarnings compared_to', () => {
  async function setup(fields) {
    const { db } = await makeTestApp()
    const t = await createTrip(db, fields)
    const p = await createPerson(db, { name: 'Asha' })
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])
    await db.run(`INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
       VALUES ('d1',?,'passport','2020-01-01','x','x','application/pdf',1)`, [p.id])
    return { db, t }
  }
  it('trip end date → trip_end', async () => {
    const { db, t } = await setup({ end_date: '2026-10-06' })
    expect((await expiryWarnings(db, t.id))[0]).toMatchObject({ compared_to: 'trip_end', compared_date: '2026-10-06' })
  })
  it('no end date, date windows → window_end', async () => {
    const { db, t } = await setup({})
    await db.run("INSERT INTO trip_date_windows (id,trip_id,start_date,end_date) VALUES ('w1',?,'2026-11-01','2026-11-09')", [t.id])
    expect((await expiryWarnings(db, t.id))[0]).toMatchObject({ compared_to: 'window_end', compared_date: '2026-11-09' })
  })
  it('no end date, no windows → today', async () => {
    const { db, t } = await setup({})
    expect((await expiryWarnings(db, t.id))[0]).toMatchObject({ compared_to: 'today' })
  })
})
