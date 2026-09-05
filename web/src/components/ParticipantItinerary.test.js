import { describe, it, expect, vi, afterEach } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import ParticipantItinerary from './ParticipantItinerary.vue'

afterEach(() => vi.useRealTimers())

// Note: the real /participant/me response's `trip` subset (server/src/routes/participant.routes.js,
// Task 6) does not include `currency` — `budget.currency` is the source of truth for money on
// this page. `currency` is kept here only as a harmless extra field on this component-level test
// fixture (ParticipantItinerary.vue never reads `trip.currency`), not because the real API sends it.
const trip = { start_date: '2026-08-01', end_date: '2026-08-03', currency: 'INR' }
const itinerary = [
  { day_date: '2026-08-01', items: [{ title: 'Arrival', time_range: '10:00–11:00', location: 'Airport', category: 'travel', est_cost: null, notes: null, link: null }] },
  { day_date: '2026-08-02', items: [] },
]

describe('ParticipantItinerary', () => {
  it('renders day headings, category icons and item details', () => {
    const wrapper = mountWithBase(ParticipantItinerary, {
      props: { itinerary, trip, budget: { currency: 'INR', equal_share: 5000, my_amount: 5000 }, companions: ['Asha', 'Priya'], companionCount: 5 },
    })
    expect(wrapper.text()).toContain('Arrival')
    expect(wrapper.text()).toContain('Airport')
    expect(wrapper.text()).toContain('✈️')
    expect(wrapper.text()).toContain('Travelling with: Asha, Priya')
  })

  it('marks today with a badge when today falls inside the trip range', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2)) // Aug 2, 2026 local
    const wrapper = mountWithBase(ParticipantItinerary, {
      props: { itinerary, trip, budget: null, companions: [], companionCount: 1 },
    })
    const days = wrapper.findAll('.pi-day')
    expect(days[1].text()).toContain('Today')
    expect(days[0].text()).not.toContain('Today')
  })

  it('shows no budget line when budget is null', () => {
    const wrapper = mountWithBase(ParticipantItinerary, {
      props: { itinerary, trip, budget: null, companions: [], companionCount: 1 },
    })
    expect(wrapper.find('.pi-share').exists()).toBe(false)
  })
})
