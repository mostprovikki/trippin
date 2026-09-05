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

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short' })
const MS_PER_DAY = 86400000

// 'Fri 6 Nov' — no year (this app never shows a day header far enough out for
// the year to be ambiguous) and no leading zero on the day-of-month, unlike
// the ISO string it replaces.
export function formatDayDate(iso) {
  const d = parseIsoDate(iso)
  if (!d) return iso || ''
  return `${WEEKDAY_FMT.format(d)} ${d.getDate()} ${MONTH_FMT.format(d)}`
}

export function dayHeader(iso, index) {
  const date = formatDayDate(iso)
  return index != null ? `${date} · Day ${index}` : date
}

// Countdown chip. Pre-trip status only (idea/planning have no committed
// dates worth counting down to); date math is inclusive of both the start
// and end day, so a single-day trip reads "Day 1 of 1" rather than "of 0".
export function tripCountdown(trip, today = startOfToday()) {
  if (!trip || !['confirmed', 'active'].includes(trip.status)) return null
  const start = parseIsoDate(trip.start_date)
  const end = parseIsoDate(trip.end_date)
  if (!start || !end) return null
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysToStart = Math.round((start - t) / MS_PER_DAY)
  const daysToEnd = Math.round((end - t) / MS_PER_DAY)
  if (daysToEnd < 0) return { label: 'Ended' }
  if (daysToStart > 1) return { label: `${daysToStart} days to go` }
  if (daysToStart === 1) return { label: 'Starts tomorrow' }
  const totalDays = Math.round((end - start) / MS_PER_DAY) + 1
  const dayNum = Math.round((t - start) / MS_PER_DAY) + 1
  return { label: `Day ${dayNum} of ${totalDays}` }
}
