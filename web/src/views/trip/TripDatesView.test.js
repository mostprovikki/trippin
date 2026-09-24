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

  it('tells DateWindowsEditor whether dates are confirmed, so its empty-state copy matches', async () => {
    const { wrapper: locked } = await mountView({
      id: 't1', name: 'Goa 2026', date_mode: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05', windows: []
    })
    expect(locked.findComponent({ name: 'DateWindowsEditor' }).props('confirmed')).toBe(true)

    const { wrapper: unlocked } = await mountView({ id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [] })
    expect(unlocked.findComponent({ name: 'DateWindowsEditor' }).props('confirmed')).toBe(false)
  })

  it('describes the actual confirm action rather than a nonexistent control', async () => {
    const { wrapper } = await mountView({ id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [] })
    expect(wrapper.text()).toContain('Use as final dates')
  })

  it('disables the Confirmed date-mode option and shows a hint when the trip has no saved windows', async () => {
    const { wrapper } = await mountView({ id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [] })
    const radio = wrapper.find('#tdm-confirmed')
    expect(radio.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('add a date window first')
  })

  it('offers a date_mode control that calls trips.updateTrip on change for non-confirmed modes', async () => {
    const { wrapper, store } = await mountView({ id: 't1', name: 'Goa 2026', date_mode: 'broad', windows: [] })
    await wrapper.find('#tdm-slight').setValue(true)
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { date_mode: 'slight' })
  })

  it('selecting Confirmed with saved windows locks the first window\'s dates when current dates match no window', async () => {
    const { wrapper, store } = await mountView({
      id: 't1',
      name: 'Goa 2026',
      date_mode: 'slight',
      start_date: '2020-01-01',
      end_date: '2020-01-02',
      windows: [
        { start_date: '2026-08-01', end_date: '2026-08-05' },
        { start_date: '2026-09-01', end_date: '2026-09-05' }
      ]
    })
    const radio = wrapper.find('#tdm-confirmed')
    expect(radio.attributes('disabled')).toBeUndefined()
    await radio.setValue(true)
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', {
      date_mode: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05'
    })
  })

  it('selecting Confirmed passes dates through unchanged when they already match a saved window', async () => {
    const { wrapper, store } = await mountView({
      id: 't1',
      name: 'Goa 2026',
      date_mode: 'slight',
      start_date: '2026-09-01',
      end_date: '2026-09-05',
      windows: [
        { start_date: '2026-08-01', end_date: '2026-08-05' },
        { start_date: '2026-09-01', end_date: '2026-09-05' }
      ]
    })
    await wrapper.find('#tdm-confirmed').setValue(true)
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', {
      date_mode: 'confirmed', start_date: '2026-09-01', end_date: '2026-09-05'
    })
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

  it('Unconfirm on a zero-window trip seeds a window from the confirmed range before reverting date_mode', async () => {
    const { wrapper, store } = await mountView({
      id: 't1', name: 'Goa 2026', date_mode: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05', windows: []
    })
    const calls = []
    store.saveWindows.mockImplementation(async (...args) => { calls.push(['saveWindows', ...args]); return [] })
    store.updateTrip.mockImplementation(async (...args) => { calls.push(['updateTrip', ...args]) })
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Unconfirm')
    await btn.trigger('click')
    await flushPromises()
    expect(store.saveWindows).toHaveBeenCalledWith('t1', [{ start_date: '2026-08-01', end_date: '2026-08-05' }])
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { date_mode: 'slight' })
    expect(calls.map((c) => c[0])).toEqual(['saveWindows', 'updateTrip'])
  })

  it('Unconfirm on a trip that already has saved windows does not seed another one', async () => {
    const { wrapper, store } = await mountView({
      id: 't1',
      name: 'Goa 2026',
      date_mode: 'confirmed',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }]
    })
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Unconfirm')
    await btn.trigger('click')
    await flushPromises()
    expect(store.saveWindows).not.toHaveBeenCalled()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { date_mode: 'slight' })
  })

  it('gives the date banner "confirmed" tag a distinct title from the sidebar trip-status tag', async () => {
    const { wrapper } = await mountView({
      id: 't1', name: 'Goa 2026', date_mode: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05', windows: []
    })
    const tag = wrapper.findComponent({ name: 'Tag' })
    expect(tag.attributes('title')).toBe('Dates confirmed')
    expect(tag.attributes('aria-label')).toBe('Dates confirmed')
  })
})
