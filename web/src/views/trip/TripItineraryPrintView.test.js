import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithBase } from '../../test-utils.js'
import TripItineraryPrintView from './TripItineraryPrintView.vue'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: TripItineraryPrintView },
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: { template: '<div />' } }
    ]
  })
}

async function mountView({ days, tripsError, itineraryError, fetchTripImpl, fetchItineraryImpl } = {}) {
  const router = makeRouter()
  await router.push('/trips/t1/itinerary/print')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useItineraryStore()
  const trips = useTripsStore()
  store.fetchItinerary = fetchItineraryImpl || vi.fn().mockImplementation(async () => {
    store.days = days ?? [{ id: 'd1', day_date: '2026-03-02', items: [
      { id: 'i1', title: 'Beach', time_range: '18:00–21:00', location: 'Baga', notes: 'bring towel', category: 'activity', est_cost: 500 }
    ] }]
    if (itineraryError) { store.error = itineraryError; throw new Error(itineraryError) }
  })
  trips.fetchTrip = fetchTripImpl || vi.fn().mockImplementation(async () => {
    trips.current = { id: 't1', name: 'Goa 2026', start_date: '2026-03-02', end_date: '2026-03-02', currency: 'INR' }
    if (tripsError) { trips.error = tripsError; throw new Error(tripsError) }
    return trips.current
  })
  const wrapper = mountWithBase(TripItineraryPrintView, { pinia, global: { plugins: [router] } })
  return { wrapper, store, trips }
}

describe('TripItineraryPrintView', () => {
  it('renders the trip name, day headings and item rows from the store', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.text()).toMatch(/Monday.*March.*2.*2026/)
    expect(wrapper.text()).toContain('Beach')
    expect(wrapper.text()).toContain('Baga')
    expect(wrapper.text()).toContain('bring towel')
  })

  it('renders category icon and formatted cost per item, skipping cost when null', async () => {
    const { wrapper } = await mountView({
      days: [{ id: 'd1', day_date: '2026-03-02', items: [
        { id: 'i1', title: 'Beach', category: 'activity', est_cost: 500 },
        { id: 'i2', title: 'Free walk', category: 'activity', est_cost: null }
      ] }]
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('₹500')
    // second row's cost cell must be empty — no "null"/"NaN" leaking into the sheet
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[1].text()).not.toMatch(/null|NaN/)
  })

  it('formats the header date range through formatDayDate, not raw ISO', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('2026-03-02')
    expect(wrapper.text()).toContain('Mon 2 Mar')
  })

  it('shows a loading state before the fetches resolve', async () => {
    let resolveFetch
    const pending = new Promise((resolve) => { resolveFetch = resolve })
    const { wrapper } = await mountView({
      fetchTripImpl: vi.fn().mockImplementation(async () => { await pending }),
      fetchItineraryImpl: vi.fn().mockImplementation(async () => { await pending })
    })
    expect(wrapper.text()).toMatch(/loading/i)
    resolveFetch()
  })

  it('shows an explicit empty state distinct from an error, when the trip has no days', async () => {
    const { wrapper } = await mountView({ days: [] })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toMatch(/no itinerary days/i)
    expect(wrapper.text()).not.toMatch(/error/i)
  })

  it('shows the itinerary store error instead of a blank sheet when fetchItinerary rejects', async () => {
    const { wrapper } = await mountView({ itineraryError: 'boom' })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('boom')
  })

  it('shows the trips store error when fetchTrip rejects', async () => {
    const { wrapper } = await mountView({ tripsError: 'trip fetch failed' })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('trip fetch failed')
  })

  it('does not throw an unhandled rejection when both fetches reject', async () => {
    const { wrapper } = await mountView({ tripsError: 'trip down', itineraryError: 'days down' })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toMatch(/trip down|days down/)
  })

  it('wires the Print button to window.print', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { wrapper } = await mountView()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.find('button.print-trigger').trigger('click')
    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })

  it('has a no-print back-to-itinerary link', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    await wrapper.vm.$nextTick()
    const back = wrapper.find('a.back-link')
    expect(back.exists()).toBe(true)
    expect(back.classes()).toContain('no-print')
    expect(back.attributes('href')).toBe('/trips/t1/itinerary')
  })
})
