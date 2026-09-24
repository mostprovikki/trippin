import { describe, it, expect } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import BudgetTable from './BudgetTable.vue'

describe('BudgetTable', () => {
  it('renders the footer total with the given currency symbol', () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: { modelValue: [{ category: 'stay', estimate: 50000, basis: '' }], currency: 'THB' }
    })
    expect(wrapper.text()).toContain('฿50,000')
  })

  it('defaults to INR when no currency prop is given', () => {
    const wrapper = mountWithBase(BudgetTable, { props: { modelValue: [{ category: 'stay', estimate: 100, basis: '' }] } })
    expect(wrapper.text()).toContain('₹100')
  })

  it('renders the AI-draft column estimate with formatMoney, not a bare number', () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: {
        modelValue: [{ category: 'stay', estimate: 50000, basis: '' }],
        draft: [{ category: 'stay', estimate: 60000, basis: 'hotel avg' }],
        currency: 'THB'
      }
    })
    expect(wrapper.text()).toContain('฿60,000')
    expect(wrapper.text()).not.toContain('60000 —')
  })

  // trip-planner-53h: read mode is the default — no inputs, formatted text only.
  it('read mode (default): shows formatted money and full basis text, no inputs', () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: {
        modelValue: [{ category: 'stay', estimate: 50000, basis: 'hotel avg per night, incl. breakfast' }],
        currency: 'INR'
      }
    })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('₹50,000')
    expect(wrapper.text()).toContain('hotel avg per night, incl. breakfast')
  })

  it('editing=true reveals the Estimate and Basis inputs', () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: { modelValue: [{ category: 'stay', estimate: 100, basis: 'x' }], editing: true }
    })
    expect(wrapper.find('#bt-estimate-stay').exists()).toBe(true)
    expect(wrapper.find('#bt-basis-stay').exists()).toBe(true)
  })

  it('footer Total stays visible and reflects modelValue in read mode too', () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: { modelValue: [{ category: 'stay', estimate: 50000, basis: '' }], currency: 'INR' }
    })
    expect(wrapper.text()).toContain('Total')
    expect(wrapper.text()).toContain('₹50,000')
  })

  // trip-planner-0jz: PrimeVue InputNumber only emits update:model-value on
  // blur/Enter/spin/paste (onUserInput never calls updateModel — that happens
  // in onInputBlur), so before this fix the Estimate field's per-keystroke
  // @input event was never wired up and the footer Total stayed stale until
  // the field lost focus.
  it('emits an update from @input alone, before any blur/update:model-value', async () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: { modelValue: [{ category: 'stay', estimate: 0, basis: '' }], currency: 'INR', editing: true }
    })
    const estimateInput = wrapper.findComponent({ name: 'InputNumber' })

    estimateInput.vm.$emit('input', { value: 5000 })
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toEqual([{ category: 'stay', estimate: 5000, basis: '' }])

    // BudgetTable is a plain v-model child — its footer only reflects what the
    // parent feeds back through modelValue, so round-trip the emitted payload
    // like a real v-model binding would, with no blur in between.
    await wrapper.setProps({ modelValue: emitted[0][0] })
    expect(wrapper.text()).toContain('₹5,000')
  })

  it('does not double-fire when @input and @update:model-value land with the same value', async () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: { modelValue: [{ category: 'stay', estimate: 0, basis: '' }], currency: 'INR', editing: true }
    })
    const estimateInput = wrapper.findComponent({ name: 'InputNumber' })

    estimateInput.vm.$emit('input', { value: 5000 })
    await wrapper.vm.$nextTick()
    // Simulates Enter/blur committing the same value @input already applied.
    estimateInput.vm.$emit('update:model-value', 5000)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  // trip-planner-hmu: Estimate/Basis fields had no id/name at all (Chrome a11y
  // "should have an id or name", ~11 flags on this table alone) — spot-check
  // the Estimate field carries a stable, category-scoped id.
  it('gives the Estimate field a stable id', () => {
    const wrapper = mountWithBase(BudgetTable, {
      props: { modelValue: [{ category: 'stay', estimate: 100, basis: '' }], editing: true }
    })
    expect(wrapper.find('#bt-estimate-stay').exists()).toBe(true)
  })
})
