// The API speaks ISO calendar dates ('YYYY-MM-DD') with no time and no zone.
// Always parse them in LOCAL time: `new Date('2026-01-01')` is UTC midnight,
// which renders as Dec 31 for anyone west of Greenwich and makes a document
// expiring today read as already expired. Every date parse in the app should
// go through here rather than the string constructor.

export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(y, mo - 1, d)
  // Date() rolls impossible dates over silently (Feb 31 -> Mar 3), so compare
  // the parts back: 2026-02-31 and 2026-13-01 are rejected, not shifted.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

export function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Local midnight today — the boundary for "has this expired?". A document that
// expires *today* is still valid, so compare against the start of the day.
export function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function isExpiredIso(iso) {
  const expiry = parseIsoDate(iso)
  return !!expiry && expiry < startOfToday()
}
