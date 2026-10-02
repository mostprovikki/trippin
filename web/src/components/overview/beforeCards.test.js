import { describe, it, expect, vi, afterEach } from 'vitest'
import { mountWithBase } from '../../test-utils.js'
import { cardRouter } from './cardTestRouter.js'
import TripLine from './TripLine.vue'
import ItineraryCard from './ItineraryCard.vue'
import BudgetCard from './BudgetCard.vue'
import ChecklistsCard from './ChecklistsCard.vue'

const mount = async (C, props) => mountWithBase(C, { props, global: { plugins: [await cardRouter()] } })
afterEach(() => vi.useRealTimers())

describe('TripLine (tripper.md §2, §5: no buttons, §6 days to go)', () => {
  it('destination · dates · people · countdown, no buttons', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 5))
    const w = await mount(TripLine, { trip: { id: 't1', status: 'confirmed', destination: 'Hoi An', start_date: '2026-11-06', end_date: '2026-11-15', participants: [{}, {}, {}] } })
    expect(w.text().replace(/\s*·\s*/g, ' · ').trim()).toBe('Hoi An · Fri 6 Nov – Sun 15 Nov · 3 people · 32 days to go')
    expect(w.findAll('button')).toHaveLength(0)
  })
  it('missing destination and dates link to where they are decided (two clicks, §4)', async () => {
    const w = await mount(TripLine, { trip: { id: 't1', status: 'idea', participants: [{}] } })
    const links = w.findAll('a')
    expect(links.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Destination TBD', '/trips/t1/destination'], ['Dates TBD', '/trips/t1/dates']
    ])
    expect(w.text()).toContain('1 person')
  })
})

describe('ItineraryCard', () => {
  const trip = { id: 't1', start_date: '2026-11-06', end_date: '2026-11-13' }
  it('N of M days planned, only empty days listed, capped at 5 with a remainder', async () => {
    const w = await mount(ItineraryCard, { trip, days: [{ day_date: '2026-11-06', items: [{ id: 1 }] }] })
    expect(w.find('h2').text()).toBe('Itinerary · 1 of 8 days planned')
    const rows = w.findAll('li')
    expect(rows).toHaveLength(5)
    expect(rows[0].text()).toBe('Sat 7 Nov — nothing planned')
    expect(w.text()).toContain('and 2 more')
    expect(w.find('a').attributes('href')).toBe('/trips/t1/itinerary')
  })
  it('every day planned: says so', async () => {
    const days = ['2026-11-06', '2026-11-07'].map((day_date) => ({ day_date, items: [{ id: day_date }] }))
    const w = await mount(ItineraryCard, { trip: { id: 't1', start_date: '2026-11-06', end_date: '2026-11-07' }, days })
    expect(w.find('h2').text()).toBe('Itinerary · 2 of 2 days planned')
    expect(w.text()).toContain('Every day has a plan.')
  })
  it('no dates: points to Dates', async () => {
    const w = await mount(ItineraryCard, { trip: { id: 't1' }, days: [] })
    expect(w.find('h2').text()).toBe('Itinerary')
    const a = w.findAll('a').find((x) => x.text() === 'Set the dates')
    expect(a.attributes('href')).toBe('/trips/t1/dates')
  })
})

describe('BudgetCard (§6 per-person cost; owner D5: estimate only)', () => {
  it('per-person estimate, rounded, with the people count', async () => {
    const w = await mount(BudgetCard, { equalShare: 161716.67, participantCount: 6, currency: 'INR' })
    expect(w.find('h2').text()).toBe('Budget · per person')
    expect(w.find('.budget-hero').text()).toBe('₹161,717')
    expect(w.text()).toContain('estimate · 6 people')
    expect(w.find('a').attributes('href')).toBe('/trips/t1/budget')
  })
  it('with custom amounts, says the share is for the others (smoke test 2026-10-02: said "6 people")', async () => {
    const w = await mount(BudgetCard, { equalShare: 174325, participantCount: 6, overrideCount: 2, currency: 'INR' })
    expect(w.find('.budget-hero').text()).toBe('₹174,325')
    expect(w.text()).toContain('estimate · each of 4 people · 2 set their own amount')
    expect(w.text()).not.toContain('6 people')
  })
  // trip-planner-ztt: the §2 mockup's "₹41,200 booked · ₹27,200 estimated"
  it('splits the per-person number into booked and estimated once anything is booked', async () => {
    const w = await mount(BudgetCard, { equalShare: 68400, equalShareBooked: 41200, participantCount: 6, currency: 'INR' })
    expect(w.find('.budget-hero').text()).toBe('₹68,400')
    expect(w.find('[data-test="budget-split"]').text()).toBe('₹41,200 booked · ₹27,200 estimated')
    const none = await mount(BudgetCard, { equalShare: 68400, participantCount: 6, currency: 'INR' })
    expect(none.find('[data-test="budget-split"]').exists()).toBe(false)
  })
  it('no estimate yet', async () => {
    const w = await mount(BudgetCard, { equalShare: 0, participantCount: 0, currency: 'INR' })
    expect(w.text()).toContain('No estimate yet')
    expect(w.find('.budget-hero').exists()).toBe(false)
  })
})

describe('ChecklistsCard', () => {
  const lists = [
    { kind: 'tasks', items: [
      { id: 't1', title: 'Book bus', assignee_person_id: 'a', assignee_name: 'Asha', done: 0 },
      ...[2, 3, 4, 5, 6].map((n) => ({ id: `u${n}`, title: `Task ${n}`, assignee_person_id: null, done: 0 })),
      { id: 'd', title: 'Done one', assignee_person_id: null, done: 1 }
    ] }
  ]
  it('N open, unassigned first, capped at 5, link to all', async () => {
    const w = await mount(ChecklistsCard, { checklists: lists })
    expect(w.find('h2').text()).toBe('Checklists · 6 open')
    const rows = w.findAll('li')
    expect(rows).toHaveLength(5)
    expect(rows[0].text()).toContain('Task 2')
    expect(rows[0].find('.p-tag').text()).toBe('Unassigned')
    const all = w.findAll('a').at(-1)
    expect(all.text()).toBe('All 6 open items')
    expect(all.attributes('href')).toBe('/trips/t1/checklists')
    expect(w.text()).not.toContain('Done one')
  })
  it('nothing open', async () => {
    const w = await mount(ChecklistsCard, { checklists: [] })
    expect(w.find('h2').text()).toBe('Checklists · 0 open')
    expect(w.text()).toContain('Nothing open.')
  })
})
