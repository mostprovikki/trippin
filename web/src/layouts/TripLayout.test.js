import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripLayout from './TripLayout.vue'
import { useTripsStore } from '../stores/trips.js'
import { useReadinessStore } from '../stores/readiness.js'

async function mountLayout({ fetchTrip } = {}) {
  const Stub = { template: '<div class="child-stub">child</div>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'trips', component: { template: '<div/>' } },
      {
        path: '/trips/:id',
        component: TripLayout,
        children: [
          { path: '', name: 'trip-overview', component: Stub },
          { path: 'dates', name: 'trip-dates', component: Stub },
          { path: 'destination', name: 'trip-destination', component: Stub },
          { path: 'goals', name: 'trip-goals', component: Stub },
          { path: 'people', name: 'trip-people', component: Stub },
          { path: 'budget', name: 'trip-budget', component: Stub },
          { path: 'itinerary', name: 'trip-itinerary', component: Stub },
          { path: 'checklists', name: 'trip-checklists', component: Stub },
          { path: 'readiness', name: 'trip-readiness', component: Stub },
          { path: 'settings', name: 'trip-settings', component: Stub }
        ]
      }
    ]
  })
  await router.push('/trips/t1/budget')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.fetchTrip = fetchTrip || vi.fn().mockImplementation(async () => {
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
  })
  const readiness = useReadinessStore()
  readiness.fetch = vi.fn().mockImplementation(async () => {
    readiness.data = {
      decisions: { dates_confirmed: 0, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
      participants: [{ profile_confirmed: 0 }],
      checklists: { total_items: 0, done_items: 0, overdue: [] }
    }
  })
  // Mount via a host RouterView: mounting TripLayout directly would make its
  // own inner RouterView resolve depth 0 = TripLayout again (nested shell).
  const Host = { template: '<RouterView />' }
  const wrapper = mountWithBase(Host, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips, readiness, router }
}

describe('TripLayout', () => {
  it('renders sidebar with all 10 sections, trip name, and the active child', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.findAll('.trip-nav-item')).toHaveLength(10)
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.find('.child-stub').exists()).toBe(true)
  })

  it('marks only the current section active', async () => {
    const { wrapper } = await mountLayout()
    const active = wrapper.findAll('.trip-nav-active')
    expect(active).toHaveLength(1)
    expect(active[0].text()).toContain('Budget')
  })

  it('shows hint badge for unconfirmed profiles', async () => {
    const { wrapper } = await mountLayout()
    const peopleItem = wrapper.findAll('.trip-nav-item').find((n) => n.text().includes('People'))
    expect(peopleItem.text()).toContain('1')
  })

  it('shows not-found panel when the trip fails to load', async () => {
    const { wrapper } = await mountLayout({ fetchTrip: vi.fn().mockRejectedValue(new Error('nope')) })
    expect(wrapper.text()).toContain('Trip not found')
    expect(wrapper.find('.child-stub').exists()).toBe(false)
  })
})
