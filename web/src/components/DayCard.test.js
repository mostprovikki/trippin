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

  it('labels the reorder arrows so their purpose is clear without relying on the glyph', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [
      { id: 'i1', title: 'Breakfast', est_cost: null },
      { id: 'i2', title: 'Museum', est_cost: null },
    ] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    const up = wrapper.find('[aria-label="Move up within day"]')
    const down = wrapper.find('[aria-label="Move down within day"]')
    expect(up.exists()).toBe(true)
    expect(down.exists()).toBe(true)
    expect(up.attributes('title')).toBe('Move up within day')
    expect(down.attributes('title')).toBe('Move down within day')
  })

  it('moving an item down calls store.reorder with the ids swapped', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    store.reorder = vi.fn().mockResolvedValue()
    const day = { id: 'd1', day_date: '2026-11-06', items: [
      { id: 'i1', title: 'Breakfast', est_cost: null },
      { id: 'i2', title: 'Museum', est_cost: null },
    ] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    const downButtons = wrapper.findAll('[aria-label="Move down within day"]')
    await downButtons[0].trigger('click')
    expect(store.reorder).toHaveBeenCalledWith('d1', ['i2', 'i1'])
  })

  it('renders a color-coded category tag with the category label, not the emoji glyph', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-08-01', items: [{ id: 'i1', title: 'Pho', category: 'food', est_cost: null }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    expect(wrapper.text()).toContain('Food')
    expect(wrapper.text()).not.toContain('🍽️')
    const tag = wrapper.find('.cat-tag-food')
    expect(tag.exists()).toBe(true)
  })

  it('renders the form inline under the row named by the shared openForm prop, with an Editing heading and row highlight', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [
      { id: 'i1', title: 'Breakfast', est_cost: null },
      { id: 'i2', title: 'Museum', est_cost: null },
    ] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR', openForm: { dayId: 'd1', itemId: 'i2' } } })
    expect(wrapper.text()).toContain('Editing: Museum')
    const items = wrapper.findAll('.day-item')
    expect(items[0].classes()).not.toContain('day-item-editing')
    expect(items[1].classes()).toContain('day-item-editing')
    expect(wrapper.find('input[name="iif-title"]').element.value).toBe('Museum')
  })

  it('ignores an openForm targeting a different day', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [{ id: 'i1', title: 'Breakfast', est_cost: null }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR', openForm: { dayId: 'd-other', itemId: 'i1' } } })
    expect(wrapper.text()).not.toContain('Editing:')
    expect(wrapper.find('input[name="iif-title"]').exists()).toBe(false)
  })

  it('emits open-form with itemId null on Add item, and with the item id on Edit', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [{ id: 'i1', title: 'Breakfast', est_cost: null }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR' } })
    const addBtn = [...wrapper.findAll('button')].find((b) => b.text() === 'Add item')
    await addBtn.trigger('click')
    expect(wrapper.emitted('open-form')[0]).toEqual([{ dayId: 'd1', itemId: null }])

    const editBtn = [...wrapper.findAll('button')].find((b) => b.text() === 'Edit')
    await editBtn.trigger('click')
    expect(wrapper.emitted('open-form')[1]).toEqual([{ dayId: 'd1', itemId: 'i1' }])
  })

  it('emits close-form when the inline edit form is cancelled', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [{ id: 'i1', title: 'Breakfast', est_cost: null }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR', openForm: { dayId: 'd1', itemId: 'i1' } } })
    const cancelBtn = [...wrapper.findAll('button')].find((b) => b.text() === 'Cancel')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close-form')).toBeTruthy()
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

// Focus lifecycle (trip-planner-0xv.3): DayCard doesn't own openForm itself
// (TripItineraryView does, one form open page-wide) — these tests drive it
// the way that parent does, via setProps after each open-form/close-form
// emit, to check the opener-focus contract end to end.
describe('DayCard focus lifecycle', () => {
  it('opening Add item focuses the Title input, and Cancel returns focus to Add item', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const day = { id: 'd1', day_date: '2026-11-06', items: [] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR', openForm: null }, attachTo: document.body })

    const addBtn = wrapper.find('button')
    expect(wrapper.text()).toContain('Add item')
    await addBtn.trigger('click')
    expect(wrapper.emitted('open-form')[0][0]).toEqual({ dayId: 'd1', itemId: null })

    await wrapper.setProps({ openForm: { dayId: 'd1', itemId: null } })
    const title = wrapper.find('input[name="iif-title"]')
    expect(title.exists()).toBe(true)
    expect(document.activeElement).toBe(title.element)

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('close-form')).toBeTruthy()

    await wrapper.setProps({ openForm: null })
    await wrapper.vm.$nextTick()
    const reopenedAddBtn = wrapper.findAll('button').find((b) => b.text() === 'Add item')
    expect(document.activeElement).toBe(reopenedAddBtn.element)
    wrapper.unmount()
  })

  it('opening Edit focuses the Title input, and Save returns focus to that row\'s Edit button', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useItineraryStore()
    store.updateItem = vi.fn().mockResolvedValue()
    const day = { id: 'd1', day_date: '2026-11-06', items: [{ id: 'i1', title: 'Snorkeling', category: 'activity', est_cost: null }] }
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index: 1, currency: 'INR', openForm: null }, attachTo: document.body })

    const editBtn = wrapper.findAll('button').find((b) => b.text() === 'Edit')
    await editBtn.trigger('click')
    expect(wrapper.emitted('open-form')[0][0]).toEqual({ dayId: 'd1', itemId: 'i1' })

    await wrapper.setProps({ openForm: { dayId: 'd1', itemId: 'i1' } })
    const title = wrapper.find('input[name="iif-title"]')
    expect(document.activeElement).toBe(title.element)

    await wrapper.find('form').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))
    expect(store.updateItem).toHaveBeenCalledWith('i1', expect.any(Object))
    expect(wrapper.emitted('close-form')).toBeTruthy()

    await wrapper.setProps({ openForm: null })
    await wrapper.vm.$nextTick()
    const editBtnAgain = wrapper.findAll('button').find((b) => b.text() === 'Edit')
    expect(document.activeElement).toBe(editBtnAgain.element)
    wrapper.unmount()
  })
})
