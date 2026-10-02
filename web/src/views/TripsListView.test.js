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

  it('shows a countdown chip only for confirmed/active trips with dates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 5)) // Oct 5 2026
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
        { id: 't1', name: 'Goa', status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10', participant_count: 1 },
        { id: 't2', name: 'Alps idea', status: 'idea', participant_count: 0 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('32 days to go')
    expect(wrapper.findAll('.trip-countdown')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('gives cards a vibe-tag accent color, deterministic per tag, absent with no tags', async () => {
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
        { id: 't1', name: 'Goa', status: 'planning', vibe_tags: ['beach'], participant_count: 1 },
        { id: 't2', name: 'Kerala', status: 'planning', vibe_tags: ['beach'], participant_count: 1 },
        { id: 't3', name: 'No vibe', status: 'planning', participant_count: 1 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.trip-card')
    expect(cards[0].attributes('style')).toContain('border-left-color: var(--app-text-muted)')
    expect(cards[0].attributes('style')).toBe(cards[1].attributes('style'))
    expect(cards[2].attributes('style') || '').not.toContain('border-left-color')
  })

  // trip-planner-cpp: tripper.md §2 "pick the trip that needs me" — the
  // Overview's "N of M people" missing number on each card (§6)
  it('says "N of M people missing" on a card when anyone is missing, else the participant count', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', name: 'trips', component: TripsListView },
      { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } }
    ] })
    await router.push('/')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.fetchTrips = vi.fn(async () => {
      store.trips = [
        { id: 't1', name: 'Goa', status: 'planning', participant_count: 5, missing_count: 2 },
        { id: 't2', name: 'Alps', status: 'planning', participant_count: 3, missing_count: 0 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const [goa, alps] = wrapper.findAll('.trip-card')
    expect(goa.find('[data-test="trip-missing"]').text()).toBe('2 of 5 people missing')
    expect(goa.text()).not.toContain('5 participants')
    expect(alps.find('[data-test="trip-missing"]').exists()).toBe(false)
    expect(alps.text()).toContain('3 participants')
  })

  // ux-review M2: nobody chases a finished trip — archived cards drop the missing line
  it('archived trip shows no missing line; confirmed trip still does', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', name: 'trips', component: TripsListView },
      { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } }
    ] })
    await router.push('/')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.fetchTrips = vi.fn(async () => {
      store.trips = [
        { id: 't1', name: 'Kerala', status: 'confirmed', participant_count: 4, missing_count: 2 },
        { id: 't2', name: 'Bali', status: 'archived', participant_count: 5, missing_count: 5 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const kerala = wrapper.findAll('.trip-card').find((c) => c.text().includes('Kerala'))
    const bali = wrapper.findAll('.trip-card').find((c) => c.text().includes('Bali'))
    expect(kerala.find('[data-test="trip-missing"]').text()).toBe('2 of 4 people missing')
    expect(bali.find('[data-test="trip-missing"]').exists()).toBe(false)
    expect(bali.text()).toContain('5 participants')
  })
})
