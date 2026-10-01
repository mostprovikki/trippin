import { describe, it, expect } from 'vitest'
import { TRIP_TABS, TRIP_DETAILS, TRIP_SECTIONS, sectionHints } from './tripNav.js'

const READY = {
  decisions: { dates_confirmed: 1, destination_decided: 1, budget_drafted: 1, itinerary_days: 3 },
  participants: [{ person_id: 'a', name: 'A', profile_confirmed: 1 }, { person_id: 'b', name: 'B', profile_confirmed: 1 }],
  checklists: { total_items: 4, done_items: 4, overdue: [] }
}
const FRESH = {
  decisions: { dates_confirmed: 0, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
  participants: [],
  checklists: { total_items: 0, done_items: 0, overdue: [] }
}
const MID = {
  decisions: { dates_confirmed: 1, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
  participants: [{ person_id: 'a', name: 'A', profile_confirmed: 1 }, { person_id: 'b', name: 'B', profile_confirmed: 0 }, { person_id: 'c', name: 'C', profile_confirmed: 1, doc_warnings: [{ doc_type: 'passport', level: 'warning', expiry_date: '2027-01-01' }] }],
  checklists: { total_items: 4, done_items: 1, overdue: [{ title: 'Book flights' }] }
}

describe('trip nav registry', () => {
  it('TRIP_SECTIONS (AppNav breadcrumb lookup) is every tab plus every Details page', () => {
    expect(TRIP_SECTIONS).toEqual([...TRIP_TABS, ...TRIP_DETAILS])
  })
  it('has the five top tabs in design-doc order (docs/design/tripper.md §5)', () => {
    expect(TRIP_TABS.map((s) => s.label)).toEqual(['Overview', 'Itinerary', 'Budget', 'Checklists', 'People'])
  })
  it('puts Dates, Destination, Settings behind Details; no Goals or Readiness entry anywhere', () => {
    expect(TRIP_DETAILS.map((s) => s.name)).toEqual(['trip-dates', 'trip-destination', 'trip-settings'])
    const all = [...TRIP_TABS, ...TRIP_DETAILS].map((s) => s.name)
    expect(all).not.toContain('trip-goals')
    expect(all).not.toContain('trip-readiness')
    for (const s of [...TRIP_TABS, ...TRIP_DETAILS]) {
      expect(s.label).toBeTruthy()
      expect(s.icon).toMatch(/^pi pi-/)
    }
  })
})

// tripper.md §6 "one number, one place": the People and Checklists badges show
// the same numbers as the Overview's Who's missing what (N people missing) and
// Checklists card (N open), not a second, different count.
describe('sectionHints', () => {
  it('returns {} without data', () => {
    expect(sectionHints(null)).toEqual({})
  })
  it('People = people missing anything (§6 Missing incl. an expiring doc); Checklists = open items', () => {
    const h = sectionHints(MID)
    expect(h['trip-dates']).toEqual({ ok: true })
    expect(h['trip-destination']).toEqual({ ok: false })
    expect(h['trip-people']).toEqual({ count: 2, label: '2 people missing details or documents' })
    expect(h['trip-checklists']).toEqual({ count: 3, label: '3 open checklist items' })
  })
  it('singular labels', () => {
    const h = sectionHints({ decisions: {}, participants: [{ person_id: 'x', name: 'X', profile_confirmed: 0 }], checklists: { total_items: 1, done_items: 0 } })
    expect(h['trip-people']).toEqual({ count: 1, label: '1 person missing details or documents' })
    expect(h['trip-checklists']).toEqual({ count: 1, label: '1 open checklist item' })
  })
  it('hides zero counts', () => {
    const h = sectionHints(READY)
    expect(h['trip-people']).toBeUndefined()
    expect(h['trip-checklists']).toBeUndefined()
  })
})
