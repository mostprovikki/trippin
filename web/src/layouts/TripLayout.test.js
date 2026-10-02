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
          { path: 'people', name: 'trip-people', component: Stub },
          { path: 'budget', name: 'trip-budget', component: Stub },
          { path: 'itinerary', name: 'trip-itinerary', component: Stub },
          { path: 'checklists', name: 'trip-checklists', component: Stub },
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
  const tabLabels = (w) => w.findAll('.trip-nav-item').map((n) => n.find('.trip-nav-label').text())

  it('renders exactly the five top tabs, a Details toggle, the trip name, and the active child', async () => {
    const { wrapper } = await mountLayout()
    expect(tabLabels(wrapper)).toEqual(['Overview', 'Itinerary', 'Budget', 'Checklists', 'People'])
    expect(wrapper.find('.trip-details-toggle').text()).toContain('Details')
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.find('.child-stub').exists()).toBe(true)
  })

  it('has no Goals or Readiness entry, in the bar or behind Details', async () => {
    const { wrapper } = await mountLayout()
    await wrapper.find('.trip-details-toggle').trigger('click')
    expect(wrapper.find('a[href$="/goals"]').exists()).toBe(false)
    expect(wrapper.find('a[href$="/readiness"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Goals|Readiness/)
  })

  it('Details ▾ is closed at rest and opens to Dates, Destination, Settings', async () => {
    const { wrapper } = await mountLayout()
    const toggle = wrapper.find('.trip-details-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.trip-details-menu').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const items = wrapper.findAll('.trip-details-menu a')
    expect(items.map((a) => a.text())).toEqual(['Dates', 'Destination', 'Settings'])
    expect(items.map((a) => a.attributes('href'))).toEqual(['/trips/t1/dates', '/trips/t1/destination', '/trips/t1/settings'])
  })

  it('closes Details on Escape (focus back on the toggle) and after navigating', async () => {
    const { wrapper, router } = await mountLayout()
    const toggle = wrapper.find('.trip-details-toggle')
    await toggle.trigger('click')
    await wrapper.find('.trip-details-menu').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.trip-details-menu').exists()).toBe(false)
    await toggle.trigger('click')
    await router.push('/trips/t1/dates')
    await flushPromises()
    expect(wrapper.find('.trip-details-menu').exists()).toBe(false)
  })

  it('scrolls the tab strip back to the start after navigating, so all five tabs are in view', async () => {
    const { wrapper, router } = await mountLayout()
    const strip = wrapper.find('.trip-tabs').element
    strip.scrollLeft = 60
    await router.push('/trips/t1/settings')
    await flushPromises()
    expect(strip.scrollLeft).toBe(0)
  })

  it('marks only the current tab active', async () => {
    const { wrapper } = await mountLayout()
    const active = wrapper.findAll('.trip-nav-active')
    expect(active).toHaveLength(1)
    expect(active[0].text()).toContain('Budget')
  })

  it('marks the Details toggle active on a details page, so the bar always shows where you are', async () => {
    const { wrapper, router } = await mountLayout()
    await router.push('/trips/t1/settings')
    await flushPromises()
    const active = wrapper.findAll('.trip-nav-active')
    expect(active).toHaveLength(1)
    expect(active[0].classes()).toContain('trip-details-toggle')
    expect(active[0].text()).toContain('Settings')
  })

  it('flags an undecided date or destination on the Details toggle', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.find('.trip-details-toggle .trip-nav-dot').exists()).toBe(true)
  })

  it('shows hint badge for unconfirmed profiles', async () => {
    const { wrapper } = await mountLayout()
    const peopleItem = wrapper.findAll('.trip-nav-item').find((n) => n.text().includes('People'))
    expect(peopleItem.text()).toContain('1')
  })

  it('labels the People badge as a people-missing count (tripper.md §6, same number as Who\'s missing what), not a total, so it cannot be misread as "someone was removed"', async () => {
    const { wrapper } = await mountLayout()
    const peopleItem = wrapper.findAll('.trip-nav-item').find((n) => n.text().includes('People'))
    const badge = peopleItem.find('.trip-nav-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('aria-label')).toBe('1 person missing details or documents')
    expect(badge.attributes('title')).toBe('1 person missing details or documents')
  })

  it('shows not-found panel when the trip fails to load', async () => {
    const { wrapper } = await mountLayout({ fetchTrip: vi.fn().mockRejectedValue(new Error('nope')) })
    expect(wrapper.text()).toContain('Trip not found')
    expect(wrapper.find('.child-stub').exists()).toBe(false)
  })

  // D9 (2026-10-02): the header shows the status chip only; Settings owns the change
  it('header shows the status chip but no next-status button', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.find('.trip-head .status-tag').exists()).toBe(true)
    expect(wrapper.find('.trip-head').findAll('button').some((b) => /Start planning|Confirm trip|Activate/.test(b.text()))).toBe(false)
  })
})
