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
})
