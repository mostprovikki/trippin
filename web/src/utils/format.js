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
