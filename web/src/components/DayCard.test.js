import { describe, it, expect, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../test-utils.js'
import DayCard from './DayCard.vue'
import { useItineraryStore } from '../stores/itinerary.js'
import { useAuthStore } from '../stores/auth.js'

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

  it('renders a humane day header with a 1-based index', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    expect(wrapper.find('h3').text()).toBe('Fri 6 Nov · Day 1')
  })

  it('renders est_cost with the currency symbol, not a bare $', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [{ id: 'i1', title: 'Snorkeling', est_cost: 1500 }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    expect(wrapper.text()).toContain('₹1,500')
    expect(wrapper.text()).not.toMatch(/\$1,?500/)
  })

  it('keeps an aria-label and still confirms before deleting an item', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const day = { id: 'd1', day_date: '2026-11-06', items: [{ id: 'i1', title: 'Snorkeling', est_cost: null }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    store.deleteItem = vi.fn().mockResolvedValue()
    const delBtn = wrapper.find('[aria-label="Delete Snorkeling"]')
    expect(delBtn.exists()).toBe(true)
    // ConfirmDialog isn't mounted by DayCard itself (App.vue owns the global
    // one) — mount it alongside so confirm.require()'s dialog actually renders.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await delBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Delete "Snorkeling" from Fri 6 Nov?')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.deleteItem).toHaveBeenCalledWith('i1')
    dialogWrapper.unmount()
  })
})

afterEach(() => vi.useRealTimers())

function baseDay() {
  return { id: 'd1', day_date: '2026-08-02', items: [
    { id: 'i1', title: 'Breakfast', time_range: '08:00–09:00', category: 'food', location: null, est_cost: null },
    { id: 'i2', title: 'Museum', time_range: '11:00–13:00', category: 'activity', location: null, est_cost: null },
  ] }
}

describe('DayCard today view', () => {
  it('shows a Today chip and highlights the item whose time range contains now, only when isToday is true', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2, 8, 30)) // 08:30 local
    const pinia = createPinia(); setActivePinia(pinia)
    useAuthStore().aiEnabled = false
    const wrapper = mountWithBase(DayCard, { props: { day: baseDay(), index: 1, currency: 'INR', isToday: true }, pinia })
    expect(wrapper.text()).toContain('Today')
    const items = wrapper.findAll('.day-item')
    expect(items[0].classes()).toContain('day-item-now')  // Breakfast 08:00–09:00 contains 08:30
    expect(items[1].classes()).not.toContain('day-item-now')
  })

  it('shows no Today chip or now-highlight when isToday is false', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2, 8, 30))
    const pinia = createPinia(); setActivePinia(pinia)
    useAuthStore().aiEnabled = false
    const wrapper = mountWithBase(DayCard, { props: { day: baseDay(), index: 1, currency: 'INR', isToday: false }, pinia })
    expect(wrapper.text()).not.toContain('Today')
    expect(wrapper.findAll('.day-item-now')).toHaveLength(0)
  })

  it('highlights an overnight item (end before start) from its start time until midnight', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2, 23, 30)) // 23:30 local
    const pinia = createPinia(); setActivePinia(pinia)
    useAuthStore().aiEnabled = false
    const day = { id: 'd1', day_date: '2026-08-02', items: [
      { id: 'i1', title: 'Night bus', time_range: '22:00–02:00', category: 'travel', location: null, est_cost: null },
    ] }
    const wrapper = mountWithBase(DayCard, { props: { day, index: 1, currency: 'INR', isToday: true }, pinia })
    const items = wrapper.findAll('.day-item')
    expect(items[0].classes()).toContain('day-item-now')
  })
})
