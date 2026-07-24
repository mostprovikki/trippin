import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripDatesView from './TripDatesView.vue'
import { useTripsStore } from '../../stores/trips.js'

describe('TripDatesView', () => {
  it('renders section header and passes windows to editor', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/dates', name: 'trip-dates', component: TripDatesView }]
    })
    await router.push('/trips/t1/dates')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.current = { id: 't1', name: 'Goa 2026', windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }] }
    store.saveWindows = vi.fn().mockResolvedValue([])
    const wrapper = mountWithBase(TripDatesView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Dates')
    expect(wrapper.findComponent({ name: 'DateWindowsEditor' }).props('windows')).toHaveLength(1)
  })
})
