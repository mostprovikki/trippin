import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripDetailView from './TripDetailView.vue'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip', component: TripDetailView },
      { path: '/trips/:id/budget', name: 'trip-budget', component: { template: '<div/>' } },
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: { template: '<div/>' } },
      { path: '/trips/:id/checklists', name: 'trip-checklists', component: { template: '<div/>' } },
      { path: '/trips/:id/readiness', name: 'trip-readiness', component: { template: '<div/>' } },
      { path: '/trips/:id/archive', name: 'trip-archive', component: { template: '<div/>' } }
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTripsStore()
  const people = usePeopleStore()
  people.fetchPeople = vi.fn().mockResolvedValue()
  store.fetchCandidates = vi.fn().mockResolvedValue()
  store.fetchLinks = vi.fn().mockResolvedValue()
  store.fetchTrip = vi.fn().mockImplementation(async () => {
    store.current = { id: 't1', name: 'Goa 2026', status: 'planning', vibe_tags: [], participants: [], windows: [], goals: [] }
  })
  const wrapper = mountWithBase(TripDetailView, { pinia, global: { plugins: [router] } })
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear() })

describe('TripDetailView', () => {
  it('shows trip name + status in header after load', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('h1').text()).toContain('Goa 2026')
    expect(wrapper.text()).toContain('planning')
  })

  it('restores unsaved basics edits after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:basics', JSON.stringify({ name: 'Edited name', description: '', origin_city: '', vibe_tags: '' }))
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('#td-name').element.value).toBe('Edited name')
  })
})
