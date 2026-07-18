import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripItineraryView from './TripItineraryView.vue'
import { useItineraryStore } from '../stores/itinerary.js'
import { useTripsStore } from '../stores/trips.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/itinerary', component: TripItineraryView },
             { path: '/trips/:id', name: 'trip', component: { template: '<div/>' } },
             { path: '/trips/:id/budget', name: 'trip-budget', component: { template: '<div/>' } },
             { path: '/trips/:id/checklists', name: 'trip-checklists', component: { template: '<div/>' } },
             { path: '/trips/:id/readiness', name: 'trip-readiness', component: { template: '<div/>' } },
             { path: '/trips/:id/archive', name: 'trip-archive', component: { template: '<div/>' } }]
  })
  await router.push('/trips/t1/itinerary')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useItineraryStore()
  const trips = useTripsStore()
  store.fetchItinerary = vi.fn().mockImplementation(async () => { store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }] })
  trips.fetchTrip = vi.fn().mockImplementation(async () => { trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' } })
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
})
