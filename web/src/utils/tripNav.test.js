import { describe, it, expect } from 'vitest'
import { TRIP_SECTIONS, sectionHints, readinessPercent, nextActions } from './tripNav.js'

const READY = {
  decisions: { dates_confirmed: 1, destination_decided: 1, budget_drafted: 1, itinerary_days: 3 },
  participants: [{ profile_confirmed: 1 }, { profile_confirmed: 1 }],
  checklists: { total_items: 4, done_items: 4, overdue: [] }
}
const FRESH = {
  decisions: { dates_confirmed: 0, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
  participants: [],
  checklists: { total_items: 0, done_items: 0, overdue: [] }
}
const MID = {
  decisions: { dates_confirmed: 1, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
  participants: [{ profile_confirmed: 1 }, { profile_confirmed: 0 }, { profile_confirmed: 0 }],
  checklists: { total_items: 4, done_items: 1, overdue: [{ title: 'Book flights' }] }
}

describe('TRIP_SECTIONS', () => {
  it('has 10 sections, overview first, settings last', () => {
    expect(TRIP_SECTIONS).toHaveLength(10)
    expect(TRIP_SECTIONS[0].name).toBe('trip-overview')
    expect(TRIP_SECTIONS.at(-1).name).toBe('trip-settings')
    for (const s of TRIP_SECTIONS) {
      expect(s.label).toBeTruthy()
      expect(s.icon).toMatch(/^pi pi-/)
    }
  })
})

describe('sectionHints', () => {
  it('returns {} without data', () => {
    expect(sectionHints(null)).toEqual({})
  })
  it('flags undone decisions, counts, percent', () => {
    const h = sectionHints(MID)
    expect(h['trip-dates']).toEqual({ ok: true })
    expect(h['trip-destination']).toEqual({ ok: false })
    expect(h['trip-people']).toEqual({ count: 2 })
    expect(h['trip-checklists']).toEqual({ count: 1 })
    expect(h['trip-readiness'].text).toMatch(/%$/)
  })
  it('hides zero counts', () => {
    const h = sectionHints(READY)
    expect(h['trip-people']).toBeUndefined()
    expect(h['trip-checklists']).toBeUndefined()
  })
})

describe('readinessPercent', () => {
  it('0 without data, 100 when everything done', () => {
    expect(readinessPercent(null)).toBe(0)
    expect(readinessPercent(READY)).toBe(100)
  })
  it('fresh trip is 0 (empty participant/checklist sets do not count)', () => {
    expect(readinessPercent(FRESH)).toBe(0)
  })
  it('partial is between 0 and 100', () => {
    const p = readinessPercent(MID)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(100)
  })
})

describe('nextActions', () => {
  it('empty without data and when fully ready', () => {
    expect(nextActions(null)).toEqual([])
    expect(nextActions(READY)).toEqual([])
  })
  it('fresh trip includes the guided-setup actions incl. adding people', () => {
    expect(nextActions(FRESH)).toContainEqual({ label: 'Add participants', to: 'trip-people' })
    expect(nextActions(FRESH)).toContainEqual({ label: 'Confirm the dates', to: 'trip-dates' })
  })
  it('lists gaps with target routes', () => {
    const actions = nextActions(MID)
    expect(actions).toEqual([
      { label: 'Decide the destination', to: 'trip-destination' },
      { label: 'Draft a budget', to: 'trip-budget' },
      { label: 'Build the itinerary', to: 'trip-itinerary' },
      { label: '2 participant profiles unconfirmed', to: 'trip-people' },
      { label: '1 overdue checklist item', to: 'trip-checklists' }
    ])
  })
})
