import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import DayCard from './DayCard.vue'
import { useItineraryStore } from '../stores/itinerary.js'

describe('DayCard', () => {
  it('renders an item est_cost with formatMoney for the given currency', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Boat trip', category: 'activity', est_cost: 500000 }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'VND' } })
    expect(wrapper.text()).toContain('₫500,000')
  })

  it('renders the day-draft preview est_cost with formatMoney for the given currency', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const day = { id: 'd1', day_date: '2026-08-01', items: [] }
    store.dayDrafts[day.id] = [{ title: 'Night market', category: 'food', est_cost: 200000 }]
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'VND' } })
    expect(wrapper.text()).toContain('₫200,000')
  })

  it('defaults to INR when no currency prop is given', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Boat trip', category: 'activity', est_cost: 500 }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1 } })
    expect(wrapper.text()).toContain('₹500')
  })
})
