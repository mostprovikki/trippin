import { describe, it, expect } from 'vitest'
import { missingRows, overviewPhase, emptyDays, openChecklistItems } from './overview.js'

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

describe('overviewPhase (tripper.md §2)', () => {
  const t = (status, start_date = '2026-11-06', end_date = '2026-11-15') => ({ status, start_date, end_date })
  it('active and today inside the dates → during', () => {
    expect(overviewPhase(t('active'), '2026-11-06')).toBe('during')
    expect(overviewPhase(t('active'), '2026-11-15')).toBe('during')
  })
  it('active but today outside the dates → before (Review Focus 4: no empty during page)', () => {
    expect(overviewPhase(t('active'), '2026-11-05')).toBe('before')
    expect(overviewPhase(t('active', null, null), '2026-11-05')).toBe('before')
  })
  it('archived → after; idea/planning/confirmed → before', () => {
    expect(overviewPhase(t('archived'), '2026-11-10')).toBe('after')
    for (const s of ['idea', 'planning', 'confirmed']) expect(overviewPhase(t(s), '2026-11-10')).toBe('before')
  })
  it('no trip → before', () => { expect(overviewPhase(null, '2026-11-10')).toBe('before') })
})

describe('emptyDays', () => {
  const trip = { start_date: '2026-11-06', end_date: '2026-11-09' }
  it('counts trip days with at least one item; lists the rest in order', () => {
    const days = [
      { day_date: '2026-11-06', items: [{ id: 1 }] },
      { day_date: '2026-11-07', items: [] },
      { day_date: '2026-11-09', items: [{ id: 2 }] }
    ]
    expect(emptyDays(trip, days)).toEqual({ planned: 2, total: 4, empty: ['2026-11-07', '2026-11-08'] })
  })
  it('no dates → total 0', () => {
    expect(emptyDays({ start_date: null, end_date: null }, [])).toEqual({ planned: 0, total: 0, empty: [] })
  })
  it('itinerary days outside the trip dates do not count', () => {
    expect(emptyDays(trip, [{ day_date: '2026-11-20', items: [{ id: 1 }] }]).planned).toBe(0)
  })
})

describe('openChecklistItems', () => {
  const lists = [
    { kind: 'packing', items: [
      { id: 'p1', title: 'Sunscreen', assignee_person_id: null, assignee_name: null, done: 0 },
      { id: 'p2', title: 'Hat', assignee_person_id: 'a', assignee_name: 'Asha', done: 1 }
    ] },
    { kind: 'tasks', items: [
      { id: 't1', title: 'Book bus', assignee_person_id: 'a', assignee_name: 'Asha', done: 0 },
      { id: 't2', title: 'Visa photos', assignee_person_id: null, assignee_name: null, done: 0 }
    ] }
  ]
  it('open items only, unassigned tasks first; an unassigned packing item is for everyone', () => {
    const out = openChecklistItems(lists)
    expect(out.map((i) => [i.id, i.who])).toEqual([['t2', 'Unassigned'], ['p1', 'Everyone'], ['t1', 'Asha']])
    expect(out[0].unassigned).toBe(true)
    expect(out[1].unassigned).toBe(false)
  })
  it('no lists → []', () => { expect(openChecklistItems(undefined)).toEqual([]) })
})
