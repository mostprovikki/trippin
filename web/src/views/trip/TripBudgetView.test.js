import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripBudgetView from './TripBudgetView.vue'
import { useBudgetStore } from '../../stores/budget.js'
import { api } from '../../api/client.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/budget', name: 'trip-budget', component: TripBudgetView }]
  })
  await router.push('/trips/t1/budget')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  vi.spyOn(api, 'get').mockResolvedValue({ trip: { name: 'Goa 2026', participants: [] } })
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useBudgetStore()
  store.fetchBudget = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripBudgetView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('TripBudgetView', () => {
  it('restores unsaved line edits after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:budget-lines', JSON.stringify({ lines: [{ category: 'stay', amount: 500 }] }))
    const { wrapper } = await mountView()
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('modelValue')).toEqual([{ category: 'stay', amount: 500 }])
  })

  it('shows section header', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Budget')
  })

  it('renders totals and equal share with the currency symbol', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ trip: { name: 'Goa 2026', currency: 'VND', participants: [] } })
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useBudgetStore()
    // The displayed Total is derived from the live draft (trip-planner-0jz),
    // not store.total, so it has to come from server-fetched lines here —
    // store.total is set too, to prove a stale/divergent server total is not
    // what ends up on screen.
    store.fetchBudget = vi.fn().mockImplementation(async () => {
      store.lines = [{ category: 'stay', estimate: 500000, basis: '' }]
      store.total = 999999
      store.equal_share = 250000
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/budget', name: 'trip-budget', component: TripBudgetView }]
    })
    await router.push('/trips/t1/budget')
    await router.isReady()
    const wrapper = mountWithBase(TripBudgetView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('₫500,000')
    expect(wrapper.text()).toContain('₫250,000')
    expect(wrapper.text()).not.toContain('₫999,999')
  })

  it('shows the Total from the live draft, not the stale store total, before saving (trip-planner-0jz)', async () => {
    const { wrapper, store } = await mountView()
    // Server-set total left stale — nothing here should render it.
    store.total = 999
    const budgetTable = wrapper.findComponent({ name: 'BudgetTable' })
    budgetTable.vm.$emit('update:modelValue', [
      { category: 'stay', estimate: 15000, basis: '' },
      { category: 'food', estimate: 8000, basis: '' }
    ])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('₹23,000')
    expect(wrapper.text()).not.toContain('₹999')
  })

  // trip-planner-53h: BudgetTable is read-only by default; an Edit budget
  // button in the card header switches it into edit mode with Save/Cancel.
  it('defaults to read mode: Edit budget button shown, Save/Cancel hidden, BudgetTable not editing', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('Edit budget')
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('editing')).toBe(false)
    const buttonLabels = wrapper.findAll('button').map((b) => b.text())
    expect(buttonLabels).not.toContain('Save budget')
    expect(buttonLabels).not.toContain('Cancel')
  })

  it('Edit budget reveals Save budget + Cancel and switches BudgetTable to editing', async () => {
    const { wrapper } = await mountView()
    await wrapper.findAll('button').find((b) => b.text() === 'Edit budget').trigger('click')
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('editing')).toBe(true)
    const buttonLabels = wrapper.findAll('button').map((b) => b.text())
    expect(buttonLabels).toContain('Save budget')
    expect(buttonLabels).toContain('Cancel')
  })

  it('Cancel restores last-saved lines and exits edit mode', async () => {
    const { wrapper, store } = await mountView()
    store.lines = [{ category: 'stay', estimate: 500, basis: 'saved' }]
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find((b) => b.text() === 'Edit budget').trigger('click')

    const budgetTable = wrapper.findComponent({ name: 'BudgetTable' })
    budgetTable.vm.$emit('update:modelValue', [{ category: 'stay', estimate: 9999, basis: 'unsaved edit' }])
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('modelValue')).toEqual([
      { category: 'stay', estimate: 9999, basis: 'unsaved edit' }
    ])

    await wrapper.findAll('button').find((b) => b.text() === 'Cancel').trigger('click')
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('modelValue')).toEqual(store.lines)
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('editing')).toBe(false)
    expect(wrapper.text()).toContain('Edit budget')
  })

  it('drops the duplicate "Total: ₹X" paragraph — the footer total is the only one', async () => {
    const { wrapper, store } = await mountView()
    store.total = 999
    const budgetTable = wrapper.findComponent({ name: 'BudgetTable' })
    budgetTable.vm.$emit('update:modelValue', [{ category: 'stay', estimate: 23000, basis: '' }])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('₹23,000')
    expect(wrapper.text()).not.toContain('Total: ₹')
  })

  it('override Remove button is icon-only with an aria-label', async () => {
    localStorage.setItem('tripper:draft:trip:t1:budget-overrides', JSON.stringify({
      overrides: [{ person_id: 'p1', person_name: 'Asha', amount: 100, note: '' }]
    }))
    const { wrapper } = await mountView()
    expect(wrapper.find('[aria-label="Remove override for Asha"]').exists()).toBe(true)
  })
})
