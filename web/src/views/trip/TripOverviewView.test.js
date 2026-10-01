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
import { useChecklistsStore } from '../../stores/checklists.js'
import { useOverviewStore } from '../../stores/overview.js'

const copySpy = vi.fn()
vi.mock('../../composables/useCopyLink.js', () => ({ useCopyLink: () => ({ copy: copySpy }) }))

const SECTIONS = ['trip-dates', 'trip-destination', 'trip-budget', 'trip-itinerary', 'trip-people', 'trip-checklists', 'trip-settings']
const FRESH_READINESS = { decisions: {}, participants: [], checklists: { total_items: 0, done_items: 0, overdue: [] } }
const ok = { profile_confirmed: 1, missing_fields: [], missing_docs: [], doc_warnings: [] }

// Every store fetch is stubbed; each stub tags its store with the trip id the
// way the real action does, so the view's "is this data mine" guard is live.
async function mountView({ readiness = FRESH_READINESS, trip, itineraryDays, checklists, seen, budget: budgetState } = {}) {
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
  useTripsStore().current = trip || { id: 't1', name: 'Goa 2026', status: 'planning', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', participants: [{ person_id: 'p1', name: 'Asha' }] }
  const r = useReadinessStore()
  r.data = readiness
  r.lastTripId = 't1'
  r.fetch = vi.fn().mockResolvedValue()
  const budget = useBudgetStore()
  Object.assign(budget, budgetState || {})
  budget.fetchBudget = vi.fn().mockResolvedValue()
  const itinerary = useItineraryStore()
  itinerary.fetchItinerary = vi.fn().mockImplementation(async (id) => { itinerary.days = itineraryDays || []; itinerary.lastTripId = id })
  const lists = useChecklistsStore()
  lists.fetchForTrip = vi.fn().mockImplementation(async (id) => { lists.checklists = checklists || []; lists.lastTripId = id })
  const overview = useOverviewStore()
  overview.fetchSeen = vi.fn().mockImplementation(async (id) => { Object.assign(overview, { since: null, events: [], ...seen, lastTripId: id }) })
  const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, itinerary, overview, lists }
}

describe('TripOverviewView — before the trip (tripper.md §2)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 5)) })
  afterEach(() => { vi.useRealTimers() })
  const CONFIRMED = { id: 't1', name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-11-06', end_date: '2026-11-08', participants: [{}, {}] }

  it('trip line, then left column (Missing, Since) before right (Itinerary, Budget, Checklists)', async () => {
    const { wrapper } = await mountView({ trip: CONFIRMED })
    const html = wrapper.html()
    const order = ['trip-line', 'missing-card', 'since-card', 'itinerary-card', 'budget-card', 'checklists-card'].map((c) => html.indexOf(c))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(wrapper.find('[data-phase="before"]').exists()).toBe(true)
    expect(wrapper.find('h1').text()).toBe('Overview')
  })

  it('no button outside the rows; the old hero, stepper, stat grid and Next actions are gone (§5, §6, §7)', async () => {
    const { wrapper } = await mountView({ trip: CONFIRMED })
    expect(wrapper.find('.trip-line button').exists()).toBe(false)
    for (const gone of ['.hero', '.status-step', '.stat-card', '.actions-list']) expect(wrapper.find(gone).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Readiness')
    expect(wrapper.text()).not.toContain('Next actions')
  })

  it("puts doc-expiry pills in Who's missing what (5p9)", async () => {
    const { wrapper } = await mountView({
      trip: CONFIRMED,
      readiness: { ...FRESH_READINESS, participants: [{ ...ok, person_id: 'p1', name: 'Priya', doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-06-30' }] }] }
    })
    expect(wrapper.find('.missing-card [data-doc-level="expired"]').exists()).toBe(true)
  })

  it("each incomplete row has one Copy ⟨name⟩'s link button; no bulk copy (tripper.md §1, §5)", async () => {
    copySpy.mockClear()
    const { wrapper } = await mountView({
      trip: CONFIRMED,
      readiness: {
        ...FRESH_READINESS,
        participants: [
          { ...ok, person_id: 'a', name: 'Asha' },
          { ...ok, person_id: 'm', name: 'Meena', missing_fields: ['dietary'], has_active_link: true },
          { ...ok, person_id: 'r', name: 'Ravi', profile_confirmed: 0, has_active_link: false }
        ]
      }
    })
    const buttons = wrapper.findAll('.missing-card button')
    expect(buttons.map((b) => b.text())).toEqual(["Copy Meena's link", "Copy Ravi's link"])
    expect(wrapper.text()).not.toMatch(/copy all/i)
    await buttons[0].trigger('click')
    expect(copySpy).toHaveBeenCalledWith('t1', 'm', 'Meena', { hasActiveLink: true })
    await buttons[1].trigger('click')
    expect(copySpy).toHaveBeenLastCalledWith('t1', 'r', 'Ravi', { hasActiveLink: false })
  })

  it('records the visit once and shows the feed', async () => {
    const { wrapper, overview } = await mountView({
      trip: CONFIRMED,
      seen: { since: '2026-09-19 08:00:00', events: [{ id: 'e1', summary: 'Divya updated their details', target: 'people', created_at: '2026-09-20 08:00:00' }] }
    })
    expect(overview.fetchSeen).toHaveBeenCalledTimes(1)
    expect(overview.fetchSeen).toHaveBeenCalledWith('t1')
    expect(wrapper.find('.since-card').text()).toContain('Divya updated their details')
  })

  it('cards read the itinerary, budget and checklists for this trip', async () => {
    const { wrapper } = await mountView({
      trip: CONFIRMED,
      itineraryDays: [{ day_date: '2026-11-06', items: [{ id: 'i' }] }],
      checklists: [{ kind: 'tasks', items: [{ id: 'c', title: 'Book bus', assignee_person_id: null, done: 0 }] }],
      budget: { equal_share: 12000, participant_count: 2 }
    })
    expect(wrapper.find('.itinerary-card h2').text()).toBe('Itinerary · 1 of 3 days planned')
    expect(wrapper.find('.budget-card .budget-hero').text()).toBe('₹12,000')
    expect(wrapper.find('.checklists-card h2').text()).toBe('Checklists · 1 open')
  })

  it("ignores another trip's itinerary still in the shared store", async () => {
    const { wrapper, itinerary } = await mountView({ trip: CONFIRMED })
    itinerary.days = [{ day_date: '2026-11-06', items: [{ id: 'x' }] }]
    itinerary.lastTripId = 'other'
    await flushPromises()
    expect(wrapper.find('.itinerary-card h2').text()).toBe('Itinerary · 0 of 3 days planned')
  })
})

describe('TripOverviewView — during the trip', () => {
  const ACTIVE_IN_RANGE = { id: 't1', name: 'Goa 2026', status: 'active', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', participants: [] }
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 3)) })
  afterEach(() => { vi.useRealTimers() })

  it("renders Today with today's items; Missing, Since, Budget, Checklists hidden (§2)", async () => {
    const { wrapper, itinerary, overview, lists } = await mountView({
      trip: ACTIVE_IN_RANGE,
      itineraryDays: [{ id: 'd1', day_date: '2026-08-03', items: [{ id: 'i1', title: 'Beach walk', time_range: '09:00-11:00', location: 'Baga' }] }]
    })
    const card = wrapper.find('.today-card')
    expect(card.text()).toContain('Today —')
    expect(card.text()).toContain('Beach walk')
    expect(itinerary.fetchItinerary).toHaveBeenCalledWith('t1')
    for (const gone of ['.missing-card', '.since-card', '.budget-card', '.checklists-card', '.itinerary-card']) expect(wrapper.find(gone).exists()).toBe(false)
    expect(overview.fetchSeen).not.toHaveBeenCalled()
    expect(lists.fetchForTrip).not.toHaveBeenCalled()
  })

  it('empty state when today has no items', async () => {
    const { wrapper } = await mountView({ trip: ACTIVE_IN_RANGE, itineraryDays: [{ id: 'd1', day_date: '2026-08-03', items: [] }] })
    expect(wrapper.find('.today-card').text()).toContain('Nothing planned today — open the itinerary to add something')
  })

  it('active trip whose dates do not cover today gets the before layout, not an empty Today (Review Focus 4)', async () => {
    const { wrapper } = await mountView({ trip: { ...ACTIVE_IN_RANGE, start_date: '2026-09-01', end_date: '2026-09-05' } })
    expect(wrapper.find('.today-card').exists()).toBe(false)
    expect(wrapper.find('.missing-card').exists()).toBe(true)
  })
})

describe('TripOverviewView — after the trip', () => {
  it('archived: trip line, Itinerary and Budget only; no visit recorded', async () => {
    const { wrapper, overview } = await mountView({ trip: { id: 't1', name: 'Goa 2026', status: 'archived', start_date: '2026-08-01', end_date: '2026-08-05', participants: [] } })
    expect(wrapper.find('[data-phase="after"]').exists()).toBe(true)
    expect(wrapper.find('.itinerary-card').exists()).toBe(true)
    expect(wrapper.find('.budget-card').exists()).toBe(true)
    for (const gone of ['.missing-card', '.since-card', '.checklists-card']) expect(wrapper.find(gone).exists()).toBe(false)
    expect(overview.fetchSeen).not.toHaveBeenCalled()
  })
})
