import { formatShortDate, toIsoDate } from './dates.js'
import { docTypeLabel } from './format.js'

const FIELD_LABEL = { phone: 'no phone', emergency_contact: 'no emergency contact', dietary: 'no dietary preference' }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// tripper.md §2 "Who's missing what" + §6 "Missing". The server's `expired`
// level means expired by the trip end (server/src/lib/expiry.js), not expired
// today, so the copy says "expires before the trip ends" rather than "expired".
export function missingRows(participants = [], tripEnd) {
  const rows = []
  const complete = []
  for (const p of participants) {
    const warnings = p.doc_warnings || []
    const pills = warnings.map((w) => ({ level: w.level, label: `${docTypeLabel(w.doc_type)} expires ${formatShortDate(w.expiry_date)}` }))
    const reasons = warnings.map((w) => (w.level === 'expired'
      ? `${docTypeLabel(w.doc_type)} expires before the trip${tripEnd ? ' ends' : ''}`
      : `${docTypeLabel(w.doc_type)} expires within 6 months of the trip end — many countries refuse entry`))
    for (const d of p.missing_docs || []) reasons.push(`${docTypeLabel(d)} not uploaded`)
    // an unconfirmed profile already covers its own field gaps — listing them
    // too would chase the person for the same thing twice
    if (!p.profile_confirmed) reasons.push("Hasn't confirmed their details")
    else if (p.missing_fields?.length) reasons.push(cap(p.missing_fields.map((f) => FIELD_LABEL[f] || f).join(' · ')))
    if (!reasons.length) { complete.push(p.name); continue }
    rows.push({
      personId: p.person_id,
      name: p.name,
      severity: pills.some((x) => x.level === 'expired') ? 'danger' : 'warn',
      pills,
      reasons
    })
  }
  // stable sort: danger rows first, the API's name order kept within each
  rows.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1))
  return { rows, complete, total: participants.length }
}

// tripper.md §2 "Trip overview by phase". `during` needs today inside the
// trip's own dates as well as status active: an active trip whose dates don't
// cover today (activated early, end date edited) would otherwise render an
// empty Today page.
export function overviewPhase(trip, todayIso) {
  if (!trip) return 'before'
  if (trip.status === 'archived') return 'after'
  if (trip.status === 'active' && trip.start_date && trip.end_date
    && todayIso >= trip.start_date && todayIso <= trip.end_date) return 'during'
  return 'before'
}

function* isoDaysBetween(start, end) {
  const [y, m, d] = start.split('-').map(Number)
  for (let dt = new Date(y, m - 1, d); ; dt.setDate(dt.getDate() + 1)) {
    const iso = toIsoDate(dt)
    if (iso > end) return
    yield iso
  }
}

// §2 Itinerary card: `N of M days planned`, only the empty days listed. Days
// come from the trip dates (§5: there is no Add day), so an itinerary day row
// outside them doesn't count.
export function emptyDays(trip, days = []) {
  if (!trip?.start_date || !trip?.end_date || trip.end_date < trip.start_date) return { planned: 0, total: 0, empty: [] }
  const withItems = new Set(days.filter((d) => d.items?.length).map((d) => d.day_date))
  const all = [...isoDaysBetween(trip.start_date, trip.end_date)]
  const empty = all.filter((iso) => !withItems.has(iso))
  return { planned: all.length - empty.length, total: all.length, empty }
}

// §2 Checklists card: open items, unassigned first. On a packing list an item
// with no assignee is everyone's (each participant ticks their own), so only an
// unassigned *task* is "Unassigned".
export function openChecklistItems(checklists = []) {
  const out = []
  for (const list of checklists || []) {
    for (const item of list.items || []) {
      if (item.done) continue
      const unassigned = list.kind === 'tasks' && !item.assignee_person_id
      const who = item.assignee_name || (unassigned ? 'Unassigned' : 'Everyone')
      out.push({ ...item, kind: list.kind, unassigned, who })
    }
  }
  return out.sort((a, b) => Number(b.unassigned) - Number(a.unassigned))
}
