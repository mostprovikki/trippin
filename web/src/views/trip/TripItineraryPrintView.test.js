import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { mountWithBase } from '../../test-utils.js'
import TripItineraryPrintView from './TripItineraryPrintView.vue'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: TripItineraryPrintView }]
  })
  await router.push('/trips/t1/itinerary/print')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useItineraryStore()
  const trips = useTripsStore()
  store.fetchItinerary = vi.fn().mockImplementation(async () => {
    store.days = [{ id: 'd1', day_date: '2026-03-02', items: [
      { id: 'i1', title: 'Beach', time_range: '18:00–21:00', location: 'Baga', notes: 'bring towel' }
    ] }]
  })
  trips.current = { id: 't1', name: 'Goa 2026', start_date: '2026-03-02', end_date: '2026-03-02' }
  trips.fetchTrip = vi.fn().mockResolvedValue(trips.current)
  const wrapper = mountWithBase(TripItineraryPrintView, { pinia, global: { plugins: [router] } })
  return { wrapper, store }
}

describe('TripItineraryPrintView', () => {
  it('renders the trip name, day headings and item rows from the store', async () => {
    const { wrapper } = await mountView()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.text()).toMatch(/Monday.*March.*2.*2026/)
    expect(wrapper.text()).toContain('Beach')
    expect(wrapper.text()).toContain('Baga')
    expect(wrapper.text()).toContain('bring towel')
  })
})
