// Thousands-separated display for money-ish integers. The budget table's
// InputNumber cells already render 342,000-style, so plain-text renders of the
// same amounts must match.
export function formatAmount(n) {
  const num = Number(n)
  return n == null || n === '' || Number.isNaN(num) ? null : num.toLocaleString('en-US')
}

// Stored enums are snake_case ('non_veg'); labels elsewhere in the app render
// them humanized ('Non-veg'). One place to keep those two in agreement.
export function humanizeEnum(v) {
  if (!v) return v
  const s = String(v).replaceAll('_', '-')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Budget line categories are stored snake_case ('primary_transport'); the
// live Budget page (BudgetTable) title-cases each word for display
// ('Primary Transport'). Extracted here (trip-planner-k2j) so the archived
// Actuals section on TripSettingsView can match instead of rendering the
// raw key.
export function budgetCategoryLabel(category) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const CURRENCY_SYMBOLS = { INR: '₹', VND: '₫', USD: '$', EUR: '€', THB: '฿', GBP: '£' }

// Money display with a currency lens: `compact` gives 57K / 1.2M (standard
// Intl compact notation), not lakh/crore grouping — this app's users travel
// across currencies, not just within India. Unknown currency codes fall back
// to the code itself as a prefix rather than guessing a symbol.
export function formatMoney(amount, currency, { compact = false } = {}) {
  const num = Number(amount)
  if (amount == null || amount === '' || Number.isNaN(num)) return null
  const code = currency || 'INR'
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `
  if (compact) {
    return `${symbol}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num)}`
  }
  return `${symbol}${num.toLocaleString('en-US')}`
}
