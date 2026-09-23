import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import ParticipantView from './ParticipantView.vue'
import { useParticipantStore } from '../stores/participant.js'

// Same technique as useNotify.test.js: mock the underlying toast primitive so
// a failed file action can be asserted without mounting the real <Toast/>.
const mockToastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mockToastAdd }) }))

async function mountView(state) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/p/:token', name: 'participant', component: ParticipantView }]
  })
  await router.push('/p/tok1')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useParticipantStore()
  store.load = vi.fn().mockImplementation(async () => Object.assign(store, state))
  const wrapper = mountWithBase(ParticipantView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete global.fetch
  if (global.URL) { delete global.URL.createObjectURL; delete global.URL.revokeObjectURL }
})

describe('ParticipantView', () => {
  it('renders trip hero and three step cards with completion state', async () => {
    const { wrapper } = await mountView({
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true,
      documents: [],
      packing: [{ id: 'i1', done: 0 }],
      tasks: [],
      itinerary: [],
      budget: null,
      companions: [],
      companionCount: 0
    })
    const steps = wrapper.findAll('.step-card')
    expect(steps).toHaveLength(3)
    expect(steps[0].classes()).toContain('step-done')      // profile confirmed
    expect(steps[1].classes()).not.toContain('step-done')  // no documents
    expect(wrapper.text()).toContain('Goa 2026')
  })

  it('passes itinerary/budget/companions through to ParticipantItinerary', async () => {
    const { wrapper } = await mountView({
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true, documents: [], packing: [], tasks: [],
      itinerary: [{ day_date: '2026-08-01', items: [{ title: 'Arrival', time_range: null, location: null, category: 'travel', est_cost: null, notes: null, link: null }] }],
      budget: { currency: 'INR', equal_share: 1000, my_amount: 1000 },
      companions: ['Priya'], companionCount: 2,
    })
    expect(wrapper.text()).toContain('Arrival')
    expect(wrapper.text()).toContain('Travelling with: Priya')
  })

  it('downloads the .ics with the participant bearer token', async () => {
    const blob = new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' })
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:x')
    global.URL.revokeObjectURL = vi.fn()
    // The download <a> is created, clicked, and removed synchronously inside
    // downloadIcs() — it's gone from the DOM by the time this test can
    // inspect it, so capture its .download filename at click-time instead.
    let downloadedName = null
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloadedName = this.download
    })
    const { wrapper } = await mountView({
      token: 'tok1',
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true, documents: [], packing: [], tasks: [],
      itinerary: [], budget: null, companions: [], companionCount: 0,
    })
    await wrapper.find('.p-ics-btn').trigger('click')
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledWith('/api/participant/itinerary.ics', {
      headers: { Authorization: expect.stringContaining('Bearer ') }
    })
    expect(downloadedName).toBe('Goa 2026.ics')
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  // trip-planner-d3p: the .ics download was the one user-triggered file action
  // that swallowed a failure completely — `if (!res.ok) return` with no catch
  // and no notify, so a 404/500 (or a dropped connection, since fetch() itself
  // wasn't even wrapped) produced no toast, no tab, nothing — same silent-
  // failure shape the bug reported for the documents "open in new tab" action.
  it('notifies on a failed .ics download instead of failing silently', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const { wrapper } = await mountView({
      token: 'tok1',
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true, documents: [], packing: [], tasks: [],
      itinerary: [], budget: null, companions: [], companionCount: 0,
    })
    mockToastAdd.mockClear()
    await wrapper.find('.p-ics-btn').trigger('click')
    await flushPromises()
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }))
  })

  it('notifies when the .ics fetch itself rejects (network failure)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { wrapper } = await mountView({
      token: 'tok1',
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true, documents: [], packing: [], tasks: [],
      itinerary: [], budget: null, companions: [], companionCount: 0,
    })
    mockToastAdd.mockClear()
    await wrapper.find('.p-ics-btn').trigger('click')
    await flushPromises()
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }))
  })
})
