import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase, pasteViaMenu } from '../../test-utils.js'
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
  // one saved non-zero line: an all-zero budget renders the empty state, not the table (sog)
  store.fetchBudget = vi.fn(async () => { store.lines = [{ category: 'misc', estimate: 1, basis: '' }] })
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

  it('AI actions live only in ⋯; "Draft with your own AI…" imports a draft with one provenance line', async () => {
    const { wrapper, store } = await mountView()
    const buttonTexts = wrapper.findAll('button').map((b) => b.text())
    expect(buttonTexts.some((t) => /AI/.test(t))).toBe(false)
    expect(wrapper.text()).not.toContain('your own AI')
    api.get.mockImplementation(async (url) => {
      if (url === '/api/trips/t1/budget/ai-draft/prompt') return { prompt: 'BUDGET PROMPT' }
      throw new Error(`unexpected GET ${url}`)
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ lines: [{ category: 'stay', estimate: 1234, basis: 'pasted basis' }] })
    await wrapper.find('[aria-label="More budget actions"]').trigger('click')
    await flushPromises()
    // provider action kept, not removed — disabled here with its reason in the label
    expect(document.body.textContent).toContain('AI draft · AI not configured')
    await wrapper.find('[aria-label="More budget actions"]').trigger('click')
    await flushPromises()
    await pasteViaMenu(wrapper, 'More budget actions', '{"lines":[]}', flushPromises)
    expect(post).toHaveBeenCalledWith('/api/trips/t1/budget/ai-draft/import', { text: '{"lines":[]}' })
    expect(store.draft).toEqual([{ category: 'stay', estimate: 1234, basis: 'pasted basis' }])
    expect(wrapper.findAll('[data-test="draft-pasted"]')).toHaveLength(1)
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  // trip-planner-sog: tripper.md §4 phone reach (job 3), §5 D8, §6 one number one place
  describe('per-person first, Save only when dirty, empty state', () => {
    async function mountWith({ lines = [{ category: 'stay', estimate: 1000, basis: '' }], equal = 0, count = 0, overrides = [] } = {}) {
      const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/trips/:id/budget', name: 'trip-budget', component: TripBudgetView }] })
      await router.push('/trips/t1/budget')
      await router.isReady()
      vi.spyOn(api, 'get').mockResolvedValue({ trip: { participants: [{ person_id: 'p9', name: 'Meera' }] } })
      const pinia = createPinia()
      setActivePinia(pinia)
      const store = useBudgetStore()
      store.fetchBudget = vi.fn(async () => {
        store.lines = lines; store.equal_share = equal; store.participant_count = count; store.overrides = overrides
      })
      store.saveOverrides = vi.fn().mockResolvedValue()
      const wrapper = mountWithBase(TripBudgetView, { pinia, global: { plugins: [router] } })
      await flushPromises()
      return { wrapper, store }
    }

    it('puts the per-person card before the category estimates', async () => {
      const { wrapper } = await mountWith({ equal: 500, count: 2 })
      const heads = wrapper.findAll('h2').map((h) => h.text())
      expect(heads.indexOf('Per person')).toBeGreaterThanOrEqual(0)
      expect(heads.indexOf('Per person')).toBeLessThan(heads.indexOf('Category estimates'))
    })

    it('says the per-person number the way the Overview does', async () => {
      const { wrapper } = await mountWith({
        equal: 174325, count: 6,
        overrides: [{ person_id: 'p1', person_name: 'Asha', amount: 145000, note: '' }, { person_id: 'p2', person_name: 'Ravi', amount: 128000, note: '' }]
      })
      const card = wrapper.find('[data-test="per-person"]')
      expect(card.text()).toContain('₹174,325')
      expect(card.text()).toContain('each of 4 people · 2 set their own amount')
    })

    it('Save overrides shows only once an override changed', async () => {
      const { wrapper, store } = await mountWith({ equal: 500, count: 2, overrides: [{ person_id: 'p1', person_name: 'Asha', amount: 100, note: '' }] })
      expect(wrapper.text()).not.toContain('Save overrides')
      await wrapper.find('#tb-note-p1').setValue('pays later')
      await flushPromises()
      const save = wrapper.findAll('button').find((b) => b.text() === 'Save overrides')
      expect(save).toBeTruthy()
      await save.trigger('click')
      await flushPromises()
      expect(store.saveOverrides).toHaveBeenCalledWith('t1', [{ person_id: 'p1', amount: 100, note: 'pays later' }])
    })

    it('overrides are stacked rows, not a table of narrow inputs', async () => {
      const { wrapper } = await mountWith({ equal: 500, count: 2, overrides: [{ person_id: 'p1', person_name: 'Asha', amount: 100, note: '' }] })
      const card = wrapper.find('[data-test="per-person"]')
      expect(card.find('table').exists()).toBe(false)
      expect(card.findAll('.override-row:not(.override-add)')).toHaveLength(1)
    })

    // participants come from GET /trips/:id as { person_id, name } — the picker
    // read p.id, so every option was undefined and Add never enabled
    it('Add override picks a participant by person_id and adds their row', async () => {
      const { wrapper } = await mountWith({ equal: 500, count: 2 })
      const select = wrapper.findAllComponents({ name: 'Select' }).find((c) => c.props('inputId') === 'tb-new-override-person')
      expect(select.props('options')[0]).toMatchObject({ person_id: 'p9' })
      select.vm.$emit('update:modelValue', 'p9')
      await flushPromises()
      const add = wrapper.findAll('button').find((b) => b.text() === 'Add')
      expect(add.attributes('disabled')).toBeUndefined()
      await add.trigger('click')
      await flushPromises()
      const rows = wrapper.findAll('.override-row:not(.override-add)')
      expect(rows).toHaveLength(1)
      expect(rows[0].text()).toContain('Meera')
      expect(wrapper.text()).toContain('Save overrides')
    })

    it('an all-zero budget says "No estimate yet" instead of ₹0 rows; Edit budget still opens the table', async () => {
      const zero = ['stay', 'food'].map((category) => ({ category, estimate: 0, basis: '' }))
      const { wrapper } = await mountWith({ lines: zero })
      expect(wrapper.text()).toContain('No estimate yet')
      expect(wrapper.findComponent({ name: 'BudgetTable' }).exists()).toBe(false)
      expect(wrapper.find('[data-test="per-person"]').text()).toContain('No estimate yet')
      await wrapper.findAll('button').find((b) => b.text() === 'Edit budget').trigger('click')
      expect(wrapper.findComponent({ name: 'BudgetTable' }).props('editing')).toBe(true)
    })
  })
})
