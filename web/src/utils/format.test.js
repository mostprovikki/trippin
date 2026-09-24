import { describe, it, expect } from 'vitest'
import { formatAmount, humanizeEnum, formatMoney, budgetCategoryLabel } from './format.js'

describe('formatMoney', () => {
  it('renders known currencies with their symbol, thousands-separated', () => {
    expect(formatMoney(342000, 'INR')).toBe('₹342,000')
    expect(formatMoney(500, 'VND')).toBe('₫500')
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.5')
    expect(formatMoney(10, 'EUR')).toBe('€10')
    expect(formatMoney(10, 'THB')).toBe('฿10')
    expect(formatMoney(10, 'GBP')).toBe('£10')
  })

  it('defaults to INR when no currency is given', () => {
    expect(formatMoney(500)).toBe('₹500')
    expect(formatMoney(500, null)).toBe('₹500')
  })

  it('falls back to the currency code as a prefix for unknown currencies', () => {
    expect(formatMoney(500, 'ZZZ')).toBe('ZZZ 500')
  })

  it('compact uses standard (57K / 1.2M) notation, not lakh grouping', () => {
    expect(formatMoney(57000, 'INR', { compact: true })).toBe('₹57K')
    expect(formatMoney(1234567, 'USD', { compact: true })).toBe('$1.2M')
    expect(formatMoney(999, 'INR', { compact: true })).toBe('₹999')
  })

  it('renders 0 (a real amount) rather than treating it as missing', () => {
    expect(formatMoney(0, 'INR')).toBe('₹0')
  })

  it('is null for missing or non-numeric amounts, same as formatAmount', () => {
    expect(formatMoney(null, 'INR')).toBeNull()
    expect(formatMoney('', 'INR')).toBeNull()
    expect(formatMoney('nope', 'INR')).toBeNull()
  })
})

// formatAmount/humanizeEnum had no dedicated test file before this task; a
// couple of smoke assertions so this new file is the one place that covers
// the whole module, not just the function this task added.
describe('formatAmount', () => {
  it('thousands-separates', () => { expect(formatAmount(342000)).toBe('342,000') })
})
describe('humanizeEnum', () => {
  it('humanizes snake_case', () => { expect(humanizeEnum('non_veg')).toBe('Non-veg') })
})

// trip-planner-k2j: extracted from BudgetTable's local label() so
// TripSettingsView's archived Actuals section can render the same
// category-key -> human label as the live Budget page.
describe('budgetCategoryLabel', () => {
  it('humanizes a snake_case budget category', () => {
    expect(budgetCategoryLabel('primary_transport')).toBe('Primary Transport')
  })
  it('title-cases each word', () => {
    expect(budgetCategoryLabel('stay')).toBe('Stay')
  })
})
