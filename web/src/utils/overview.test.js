import { describe, it, expect } from 'vitest'
import { missingRows, overviewPhase, emptyDays, openChecklistItems, parseStartMinutes, todayTimeline, tonightStay, dueByTomorrow, mapsUrl } from './overview.js'

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

describe('parseStartMinutes (§9 gap: next-item timing from free-text time_range)', () => {
  it.each([
    ['09:30–11:00', 570], ['9:05-10', 545], ['01:40–11:25', 100], ['18:00', 1080],
    ['9am', 540], ['9.30pm', 1290], ['12am', 0], ['12:15 pm', 735], ['around 7:00', 420],
    // final review 2026-10-02: a bare start hour in a range used to lose to the end time
    ['10–11am', 600], ['9-10:30', 540], ['9–11pm', 1260], ['9 to 11am', 540], ['11-1pm', 660], ['Day 2 9am', 540]
  ])('%s → %s', (input, want) => { expect(parseStartMinutes(input)).toBe(want) })
  it.each([['morning'], [''], [null], [undefined], ['after lunch'], ['25:00'], ['9:75']])('%s → null (Review Focus 3)', (input) => {
    expect(parseStartMinutes(input)).toBe(null)
  })
})

describe('todayTimeline', () => {
  const items = [
    { id: 'c', title: 'Dinner', time_range: '19:00' },
    { id: 'u', title: 'Shopping', time_range: 'afternoon' },
    { id: 'a', title: 'Breakfast', time_range: '08:00–09:00' },
    { id: 'b', title: 'Taxi', time_range: '10:30' }
  ]
  it('sorts by start, untimed last; next = first starting at/after now; earlier = done', () => {
    const { rows, minutesToNext } = todayTimeline(items, 600) // 10:00
    expect(rows.map((r) => [r.id, r.state])).toEqual([['a', 'done'], ['b', 'next'], ['c', 'later'], ['u', 'untimed']])
    expect(minutesToNext).toBe(30)
  })
  it('after the last timed item: nothing is next, untimed never becomes next', () => {
    const { rows, minutesToNext } = todayTimeline(items, 1200)
    expect(rows.filter((r) => r.state === 'next')).toEqual([])
    expect(rows.find((r) => r.id === 'u').state).toBe('untimed')
    expect(minutesToNext).toBe(null)
  })
  it('moves on as the clock passes', () => {
    expect(todayTimeline(items, 631).rows.find((r) => r.state === 'next').id).toBe('c')
  })
})

describe('tonightStay', () => {
  const days = [
    { day_date: '2026-11-06', items: [{ id: 's1', category: 'stay', title: 'La Siesta' }] },
    { day_date: '2026-11-07', items: [{ id: 'x', category: 'food' }] },
    { day_date: '2026-11-09', items: [{ id: 's2', category: 'stay', title: 'Anantara' }] }
  ]
  it('latest stay on or before today', () => {
    expect(tonightStay(days, '2026-11-07').id).toBe('s1')
    expect(tonightStay(days, '2026-11-09').id).toBe('s2')
  })
  it('none before today → null', () => { expect(tonightStay(days, '2026-11-05')).toBe(null) })
})

describe('dueByTomorrow (§2 Before tomorrow)', () => {
  const lists = [{ kind: 'tasks', items: [
    { id: 'o', title: 'Overdue', due_date: '2026-11-01', done: 0 },
    { id: 't', title: 'Tomorrow', due_date: '2026-11-08', done: 0 },
    { id: 'l', title: 'Later', due_date: '2026-11-09', done: 0 },
    { id: 'n', title: 'No date', due_date: null, done: 0 },
    { id: 'd', title: 'Done', due_date: '2026-11-07', done: 1 }
  ] }]
  it('open items due on or before tomorrow, soonest first', () => {
    expect(dueByTomorrow(lists, '2026-11-08').map((i) => i.id)).toEqual(['o', 't'])
  })
  it('keeps items ticked this session so a tick does not pull the row away', () => {
    expect(dueByTomorrow(lists, '2026-11-08', new Set(['d'])).map((i) => i.id)).toEqual(['o', 'd', 't'])
  })
})

describe('mapsUrl (§7: link out, never embed)', () => {
  it('Google Maps search for the location', () => {
    expect(mapsUrl('27 Hang Be, Hanoi')).toBe('https://www.google.com/maps/search/?api=1&query=27%20Hang%20Be%2C%20Hanoi')
  })
  it('no location → null', () => { expect(mapsUrl('')).toBe(null) })
})
