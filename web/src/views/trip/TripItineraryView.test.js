import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripItineraryView from './TripItineraryView.vue'
import DayCard from '../../components/DayCard.vue'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'
import { _resetAiStatus } from '../../composables/useAiStatus.js'
import { api } from '../../api/client.js'

// Shared by every test below: TripItineraryView's "Print / PDF" router-link
// resolves against 'trip-itinerary-print', so any memory router that doesn't
// register it throws mid-render (RouterLink resolution failure), not just a
// broken link.
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: TripItineraryView },
      { path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: { template: '<div />' } }
    ]
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/trips/t1/itinerary')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useItineraryStore()
  const trips = useTripsStore()
  store.fetchItinerary = vi.fn().mockImplementation(async () => { store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }] })
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
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

  it('threads the trip currency down to DayCard for est_cost display', async () => {
    const router = makeRouter()
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [{ id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Boat trip', category: 'activity', est_cost: 500000 }] }]
    })
    trips.current = { id: 't1', name: 'Vietnam 2026', status: 'planning', currency: 'VND' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('₫500,000')
  })

  it('marks today\'s DayCard as isToday when trip is active and today is in range', async () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 1)) // Aug 1, 2026 local — matches store.days[0].day_date
    const { wrapper, store } = await mountView()
    // mountView() hard-codes trips.current.status = 'planning' — override for this test
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'active', start_date: '2026-08-01', end_date: '2026-08-05' }
    store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }]
    await flushPromises()
    await wrapper.vm.$nextTick()
    const dayCard = wrapper.findComponent(DayCard)
    expect(dayCard.props('isToday')).toBe(true)
    vi.useRealTimers()
  })

  it('leaves isToday false for every day when trip is not active', async () => {
    const { wrapper } = await mountView() // default status: 'planning'
    await flushPromises()
    const dayCard = wrapper.findComponent(DayCard)
    expect(dayCard.props('isToday')).toBe(false)
  })

  it('scrolls the today card into view exactly once when the trip loads as active', async () => {
    // Sets trips.current to 'active' BEFORE mount (unlike the isToday test above,
    // which overrides it post-mount) so this exercises the real race: store.days
    // and loading both flip inside load()'s single synchronous `finally` block,
    // and the today DayCard mounts for the first time in that same pass.
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 1)) // Aug 1, 2026 local
    const router = makeRouter()
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }]
    })
    trips.current = { id: 't1', name: 'Goa 2026', status: 'active', start_date: '2026-08-01', end_date: '2026-08-05' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    const dayCard = wrapper.findComponent(DayCard)
    expect(scrollSpy.mock.instances[0]).toBe(dayCard.element)
    scrollSpy.mockRestore()
    vi.useRealTimers()
  })

  it('at rest, AI draft is not a visible button; it is an item in the ⋯ menu', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    const buttonTexts = wrapper.findAll('button').map((b) => b.text())
    expect(buttonTexts.some((t) => t.includes('AI draft'))).toBe(false)
    expect(wrapper.text()).not.toContain('Add to calendar')
    expect(wrapper.text()).not.toContain('Print / PDF')
    const more = wrapper.findAll('[aria-label="More itinerary actions"]')
    expect(more).toHaveLength(1)
    await more[0].trigger('click')
    await flushPromises()
    const menuText = document.body.textContent
    expect(menuText).toContain('AI draft (whole trip)')
    expect(menuText).toContain('Add to calendar (.ics)')
    expect(menuText).toContain('Print / PDF')
    wrapper.unmount()
  })

  it('only the per-day Add item buttons are primary-styled at rest', async () => {
    const router = makeRouter()
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [
        { id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Beach walk', est_cost: null }] },
        { id: 'd2', day_date: '2026-08-02', items: [] }
      ]
    })
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    // PrimeVue marks non-primary buttons with a severity/outlined/text class.
    const primary = wrapper.findAll('button').filter((b) => !/p-button-(secondary|outlined|text|danger|help|contrast)/.test(b.classes().join(' ')))
    expect(primary.map((b) => b.text())).toEqual(['Add item', 'Add item'])
  })

  it('has no Regenerate day button or instruction input anywhere', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Regenerate')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('shows the provider tag at most once, inside the ⋯ menu AI item label, never per day', async () => {
    _resetAiStatus()
    const getSpy = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/ai/status') return { enabled: true, provider: 'mock' }
      throw new Error(`unexpected GET ${url}`)
    })
    const router = makeRouter()
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [
        { id: 'd1', day_date: '2026-08-01', items: [] },
        { id: 'd2', day_date: '2026-08-02', items: [] }
      ]
    })
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('dev mock')
    await wrapper.find('[aria-label="More itinerary actions"]').trigger('click')
    await flushPromises()
    const items = [...document.body.querySelectorAll('.p-menu-item')]
    const aiItem = items.find((el) => el.textContent.includes('AI draft (whole trip)'))
    expect(aiItem.textContent).toContain('dev mock')
    expect(document.body.textContent.match(/dev mock/g)).toHaveLength(1)
    wrapper.unmount()
    getSpy.mockRestore()
    _resetAiStatus()
  })

  it('renders the "generated from confirmed dates" subtitle only when there are no days', async () => {
    const { wrapper, store } = await mountView()
    await flushPromises()
    expect(wrapper.find('.section-desc').exists()).toBe(false)
    store.days = []
    await flushPromises()
    expect(wrapper.find('.section-desc').text()).toContain('generated from confirmed dates')
  })

  it('keeps only one inline item form open page-wide: opening Add on another day closes Edit', async () => {
    const router = makeRouter()
    await router.push('/trips/t1/itinerary')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const trips = useTripsStore()
    store.fetchItinerary = vi.fn().mockImplementation(async () => {
      store.days = [
        { id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Beach walk', est_cost: null }] },
        { id: 'd2', day_date: '2026-08-02', items: [] }
      ]
    })
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
    const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
    await flushPromises()

    const editBtn = [...wrapper.findAll('button')].find((b) => b.text() === 'Edit')
    await editBtn.trigger('click')
    expect(wrapper.text()).toContain('Editing: Beach walk')

    const dayCards = wrapper.findAllComponents(DayCard)
    const addBtn = [...dayCards[1].findAll('button')].find((b) => b.text() === 'Add item')
    await addBtn.trigger('click')

    expect(wrapper.text()).not.toContain('Editing:')
  })
})
