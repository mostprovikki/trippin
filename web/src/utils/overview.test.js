import { describe, it, expect } from 'vitest'
import { missingRows } from './overview.js'

const base = { person_id: 'p', profile_confirmed: 1, doc_warnings: [], missing_fields: [], missing_docs: [] }

describe('missingRows', () => {
  it('splits complete people from rows, worst first', () => {
    const out = missingRows([
      { ...base, person_id: 'a', name: 'Asha' },
      { ...base, person_id: 'm', name: 'Meena', missing_fields: ['dietary', 'emergency_contact'] },
      { ...base, person_id: 'p', name: 'Priya', doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-06-30' }] }
    ], '2026-11-15')
    expect(out.total).toBe(3)
    expect(out.complete).toEqual(['Asha'])
    expect(out.rows.map((r) => r.name)).toEqual(['Priya', 'Meena'])
    expect(out.rows[0]).toMatchObject({ severity: 'danger', pills: [{ level: 'expired', label: 'Passport expires 30 Jun 2026' }] })
    expect(out.rows[0].reasons).toEqual(['Passport expires before the trip ends'])
    expect(out.rows[1]).toMatchObject({ severity: 'warn', pills: [], reasons: ['No dietary preference · no emergency contact'] })
  })
  it('warning reason names the 6-month rule', () => {
    const out = missingRows([{ ...base, name: 'Ravi', doc_warnings: [{ doc_type: 'passport', level: 'warning', expiry_date: '2027-01-20' }] }], '2026-11-15')
    expect(out.rows[0]).toMatchObject({ severity: 'warn', pills: [{ level: 'warning', label: 'Passport expires 20 Jan 2027' }] })
    expect(out.rows[0].reasons).toEqual(['Passport expires within 6 months of the trip end — many countries refuse entry'])
  })
  it('unconfirmed profile is a reason on its own, field gaps not repeated', () => {
    const out = missingRows([{ ...base, name: 'Arun', profile_confirmed: 0, missing_fields: ['phone'] }], '2026-11-15')
    expect(out.rows[0].reasons).toEqual(["Hasn't confirmed their details"])
  })
  it('missing docs read as not uploaded', () => {
    const out = missingRows([{ ...base, name: 'Arun', missing_docs: ['visa', 'driving_license'] }], '2026-11-15')
    expect(out.rows[0].reasons).toEqual(['Visa not uploaded', 'Driving licence not uploaded'])
  })
  it('no end date: expired copy does not claim a trip end', () => {
    const out = missingRows([{ ...base, name: 'X', doc_warnings: [{ doc_type: 'visa', level: 'expired', expiry_date: '2026-01-01' }] }], null)
    expect(out.rows[0].reasons).toEqual(['Visa expires before the trip'])
  })
  it('tolerates a participant without the new fields (older API)', () => {
    const out = missingRows([{ person_id: 'z', name: 'Zed', profile_confirmed: 1 }], null)
    expect(out.complete).toEqual(['Zed'])
  })
})
