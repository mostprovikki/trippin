import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripsListView from './TripsListView.vue'
import { useTripsStore } from '../stores/trips.js'

describe('TripsListView', () => {
  it('renders trip cards grouped by status, linking to trip-overview', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'trips', component: TripsListView },
        { path: '/trips/new', name: 'trip-new', component: { template: '<div/>' } },
        { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } }
      ]
    })
    await router.push('/')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.fetchTrips = vi.fn().mockImplementation(async () => {
      store.trips = [
        { id: 't1', name: 'Goa 2026', status: 'planning', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', participant_count: 3 },
        { id: 't2', name: 'Alps idea', status: 'idea', participant_count: 0 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.trip-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].attributes('href')).toBe('/trips/t2') // idea group first
    expect(wrapper.text()).toContain('Destination TBD')
  })
})
