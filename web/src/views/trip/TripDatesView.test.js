import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripDatesView from './TripDatesView.vue'
import { useTripsStore } from '../../stores/trips.js'

async function mountView(current) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/dates', name: 'trip-dates', component: TripDatesView }]
  })
  await router.push('/trips/t1/dates')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTripsStore()
  store.current = current
  store.saveWindows = vi.fn().mockResolvedValue([])
  store.updateTrip = vi.fn().mockResolvedValue({ ...current })
  const wrapper = mountWithBase(TripDatesView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, store }
}

describe('TripDatesView', () => {
  it('renders section header and passes windows to editor', async () => {
    const { wrapper } = await mountView({
      id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }]
    })
    expect(wrapper.find('h1').text()).toBe('Dates')
    expect(wrapper.findComponent({ name: 'DateWindowsEditor' }).props('windows')).toHaveLength(1)
  })

  it('describes the actual confirm action rather than a nonexistent control', async () => {
    const { wrapper } = await mountView({ id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [] })
    expect(wrapper.text()).toContain('Use as final dates')
  })

  it('offers a date_mode control that calls trips.updateTrip on change', async () => {
    const { wrapper, store } = await mountView({ id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [] })
    await wrapper.find('#tdm-confirmed').setValue(true)
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { date_mode: 'confirmed' })
  })

  it('offers "Use as final dates" per saved window, calling updateTrip with that window\'s dates', async () => {
    const { wrapper, store } = await mountView({
      id: 't1',
      name: 'Goa 2026',
      date_mode: 'broad',
      windows: [{ start_date: '2026-08-01', end_date: '2026-08-05', note: 'Peak week' }]
    })
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Use as final dates')
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', {
      date_mode: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05'
    })
  })

  it('shows an Unconfirm action when dates are locked and reverts date_mode on click', async () => {
    const { wrapper, store } = await mountView({
      id: 't1', name: 'Goa 2026', date_mode: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05', windows: []
    })
    expect(wrapper.text()).toContain('confirmed')
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Unconfirm')
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { date_mode: 'slight' })
  })
})
