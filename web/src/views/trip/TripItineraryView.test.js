import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripItineraryView from './TripItineraryView.vue'
import DayCard from '../../components/DayCard.vue'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: TripItineraryView },
      { path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: { template: '<div />' } }
    ]
  })
  await router.push('/trips/t1/itinerary')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useItineraryStore()
  const trips = useTripsStore()
  store.fetchItinerary = vi.fn().mockImplementation(async () => { store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }] })
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
  const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear() })

describe('TripItineraryView', () => {
  it('restores an unapplied AI draft from storage after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:itinerary-ai', JSON.stringify({
      ai: [{ day_date: '2026-08-01', items: [{ title: 'Beach walk' }] }]
    }))
    const { wrapper, store } = await mountView()
    await flushPromises()
    // remount happens fresh in this test: the view must have pushed the stored draft into the store
    expect(store.draft).toEqual([{ day_date: '2026-08-01', items: [{ title: 'Beach walk' }] }])
    expect(wrapper.text()).toContain('Beach walk')
  })

  it('threads the trip currency down to DayCard for est_cost display', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: TripItineraryView },
      { path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: { template: '<div />' } }
    ]
    })
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [{ id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Boat trip', category: 'activity', est_cost: 500000 }] }]
    })
    trips.current = { id: 't1', name: 'Vietnam 2026', status: 'planning', currency: 'VND' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('₫500,000')
  })

  it('marks today\'s DayCard as isToday when trip is active and today is in range', async () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 1)) // Aug 1, 2026 local — matches store.days[0].day_date
    const { wrapper, store } = await mountView()
    // mountView() hard-codes trips.current.status = 'planning' — override for this test
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'active', start_date: '2026-08-01', end_date: '2026-08-05' }
    store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }]
    await flushPromises()
    await wrapper.vm.$nextTick()
    const dayCard = wrapper.findComponent(DayCard)
    expect(dayCard.props('isToday')).toBe(true)
    vi.useRealTimers()
  })

  it('leaves isToday false for every day when trip is not active', async () => {
    const { wrapper } = await mountView() // default status: 'planning'
    await flushPromises()
    const dayCard = wrapper.findComponent(DayCard)
    expect(dayCard.props('isToday')).toBe(false)
  })

  it('scrolls the today card into view exactly once when the trip loads as active', async () => {
    // Sets trips.current to 'active' BEFORE mount (unlike the isToday test above,
    // which overrides it post-mount) so this exercises the real race: store.days
    // and loading both flip inside load()'s single synchronous `finally` block,
    // and the today DayCard mounts for the first time in that same pass.
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 1)) // Aug 1, 2026 local
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: TripItineraryView },
      { path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: { template: '<div />' } }
    ]
    })
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }]
    })
    trips.current = { id: 't1', name: 'Goa 2026', status: 'active', start_date: '2026-08-01', end_date: '2026-08-05' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    const dayCard = wrapper.findComponent(DayCard)
    expect(scrollSpy.mock.instances[0]).toBe(dayCard.element)
    scrollSpy.mockRestore()
    vi.useRealTimers()
  })
})
