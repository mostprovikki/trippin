import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripOverviewView from './TripOverviewView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useItineraryStore } from '../../stores/itinerary.js'

const SECTIONS = ['trip-dates', 'trip-destination', 'trip-budget', 'trip-itinerary', 'trip-people', 'trip-checklists', 'trip-readiness']

async function mountView({ readiness, trip, itineraryDays } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
      ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.current = trip || { id: 't1', name: 'Goa 2026', status: 'planning', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: ['beach'], participants: [{ person_id: 'p1', name: 'Asha' }] }
  const r = useReadinessStore()
  r.data = readiness
  r.lastTripId = 't1'
  r.fetch = vi.fn().mockResolvedValue()
  const budget = useBudgetStore()
  budget.fetchBudget = vi.fn().mockResolvedValue()
  const itinerary = useItineraryStore()
  itinerary.fetchItinerary = vi.fn().mockResolvedValue()
  // lastTripId is deliberately left null (not 't1'): the view's own fetch
  // guard should still fire, and days below stand in for whatever a real
  // fetchItinerary (mocked to a no-op here) would have populated.
  if (itineraryDays) itinerary.days = itineraryDays
  const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, itinerary }
}

describe('TripOverviewView', () => {
  it('shows hero, status stepper, stat cards, and next actions', async () => {
    const { wrapper } = await mountView({
      readiness: {
        decisions: { dates_confirmed: 1, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
        participants: [{ profile_confirmed: 0 }],
        checklists: { total_items: 2, done_items: 1, overdue: [] }
      }
    })
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.findAll('.status-step')).toHaveLength(4)
    expect(wrapper.find('.status-step-current').text()).toBe('planning')
    expect(wrapper.text()).toContain('Decide the destination')
    expect(wrapper.text()).toContain('Readiness')
  })

  it('shows all-set message when nothing is pending', async () => {
    const { wrapper } = await mountView({
      readiness: {
        decisions: { dates_confirmed: 1, destination_decided: 1, budget_drafted: 1, itinerary_days: 2 },
        participants: [{ profile_confirmed: 1 }],
        checklists: { total_items: 2, done_items: 2, overdue: [] }
      }
    })
    expect(wrapper.text()).toContain('All set')
  })

  it('renders the budget stat with the trip currency (defaults to INR)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
        ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
      ]
    })
    await router.push('/trips/t1')
    await router.isReady()
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', participants: [] }
    const r = useReadinessStore()
    r.data = { decisions: {}, participants: [], checklists: { total_items: 0, done_items: 0, overdue: [] } }
    r.lastTripId = 't1'
    r.fetch = vi.fn().mockResolvedValue()
    const budget = useBudgetStore()
    budget.total = 12000
    budget.fetchBudget = vi.fn().mockResolvedValue()
    const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('₹12,000')
  })

  it('shows a countdown chip in the hero for a confirmed trip with dates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 5))
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
        ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
      ]
    })
    await router.push('/trips/t1')
    await router.isReady()
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10', participants: [] }
    const r = useReadinessStore()
    r.data = { decisions: {}, participants: [], checklists: { total_items: 0, done_items: 0, overdue: [] } }
    r.lastTripId = 't1'
    r.fetch = vi.fn().mockResolvedValue()
    const budget = useBudgetStore()
    budget.fetchBudget = vi.fn().mockResolvedValue()
    const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('32 days to go')
    vi.useRealTimers()
  })
})

describe('TripOverviewView — Today card', () => {
  const ACTIVE_IN_RANGE = {
    id: 't1', name: 'Goa 2026', status: 'active', destination: 'Goa',
    start_date: '2026-08-01', end_date: '2026-08-05', participants: []
  }
  const FRESH_READINESS = { decisions: {}, participants: [], checklists: { total_items: 0, done_items: 0, overdue: [] } }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3)) // 2026-08-03, inside ACTIVE_IN_RANGE's dates
  })
  afterEach(() => { vi.useRealTimers() })

  it('renders with a heading, today\'s items, and an itinerary link when active and today is in range', async () => {
    const { wrapper, itinerary } = await mountView({
      readiness: FRESH_READINESS,
      trip: ACTIVE_IN_RANGE,
      itineraryDays: [{ id: 'd1', day_date: '2026-08-03', items: [{ id: 'i1', title: 'Beach walk', time_range: '09:00-11:00', location: 'Baga' }] }]
    })
    const card = wrapper.find('.today-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Today —')
    expect(card.text()).toContain('Beach walk')
    expect(card.text()).toContain('Baga')
    expect(card.text()).toContain('Open itinerary')
    expect(itinerary.fetchItinerary).toHaveBeenCalledWith('t1')
  })

  it('shows the empty state when today has no items', async () => {
    const { wrapper } = await mountView({
      readiness: FRESH_READINESS,
      trip: ACTIVE_IN_RANGE,
      itineraryDays: [{ id: 'd1', day_date: '2026-08-03', items: [] }]
    })
    expect(wrapper.find('.today-card').text()).toContain('Nothing planned today — open the itinerary to add something')
  })

  it('shows the empty state when the itinerary was never initialized', async () => {
    const { wrapper } = await mountView({ readiness: FRESH_READINESS, trip: ACTIVE_IN_RANGE })
    expect(wrapper.find('.today-card').text()).toContain('Nothing planned today — open the itinerary to add something')
  })

  it('renders no card, and never fetches the itinerary, for a non-active trip', async () => {
    const { wrapper, itinerary } = await mountView({
      readiness: FRESH_READINESS,
      trip: { ...ACTIVE_IN_RANGE, status: 'planning' }
    })
    expect(wrapper.find('.today-card').exists()).toBe(false)
    expect(itinerary.fetchItinerary).not.toHaveBeenCalled()
  })

  it('renders no card, and never fetches the itinerary, when today is outside the trip dates', async () => {
    const { wrapper, itinerary } = await mountView({
      readiness: FRESH_READINESS,
      trip: { ...ACTIVE_IN_RANGE, start_date: '2026-09-01', end_date: '2026-09-05' }
    })
    expect(wrapper.find('.today-card').exists()).toBe(false)
    expect(itinerary.fetchItinerary).not.toHaveBeenCalled()
  })

  it('sits above the Next actions section', async () => {
    const { wrapper } = await mountView({
      readiness: FRESH_READINESS,
      trip: ACTIVE_IN_RANGE,
      itineraryDays: [{ id: 'd1', day_date: '2026-08-03', items: [] }]
    })
    const html = wrapper.html()
    expect(html.indexOf('today-card')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('today-card')).toBeLessThan(html.indexOf('Next actions'))
  })
})
