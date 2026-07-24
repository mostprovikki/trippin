import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripPeopleView from './TripPeopleView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/people', name: 'trip-people', component: TripPeopleView }]
  })
  await router.push('/trips/t1/people')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  const people = usePeopleStore()
  trips.current = { id: 't1', name: 'Goa 2026', participants: [{ person_id: 'p1', name: 'Asha' }] }
  trips.fetchLinks = vi.fn().mockResolvedValue()
  people.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripPeopleView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips }
}

describe('TripPeopleView', () => {
  it('lists participants with actions', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('People')
    expect(wrapper.text()).toContain('Asha')
    expect(wrapper.text()).toContain('Create link')
  })
})
