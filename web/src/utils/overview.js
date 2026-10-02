import { formatShortDate, toIsoDate } from './dates.js'
import { docTypeLabel } from './format.js'

const FIELD_LABEL = { phone: 'no phone', emergency_contact: 'no emergency contact', dietary: 'no dietary preference' }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// What a doc warning was measured against (server/src/lib/expiry.js
// compared_to): the trip end, else the latest date window's end, else today.
function expiryReason(w, tripEnd) {
  const doc = docTypeLabel(w.doc_type)
  const refuse = ' — many countries refuse entry'
  if (w.compared_to === 'today') {
    return w.level === 'expired' ? `${doc} has expired` : `${doc} expires within 6 months of today${refuse}`
  }
  if (w.compared_to === 'window_end') {
    const when = `${formatShortDate(w.compared_date)}, when the latest date window ends`
    return w.level === 'expired' ? `${doc} expires before ${when}` : `${doc} expires within 6 months of ${when}${refuse}`
  }
  return w.level === 'expired'
    ? `${doc} expires before the trip${tripEnd || w.compared_to === 'trip_end' ? ' ends' : ''}`
    : `${doc} expires within 6 months of the trip end${refuse}`
}

// tripper.md §2 "Who's missing what" + §6 "Missing". The server's `expired`
// level means expired by the trip end (server/src/lib/expiry.js), not expired
// today, so the copy says "expires before the trip ends" rather than "expired".
export function missingRows(participants = [], tripEnd) {
  const rows = []
  const complete = []
  for (const p of participants) {
    const warnings = p.doc_warnings || []
    const pills = warnings.map((w) => ({ level: w.level, label: `${docTypeLabel(w.doc_type)} expires ${formatShortDate(w.expiry_date)}` }))
    const reasons = warnings.map((w) => expiryReason(w, tripEnd))
    for (const d of p.missing_docs || []) reasons.push(`${docTypeLabel(d)} not uploaded`)
    // Confirmed means complete (server, trip-planner-4hi), so field gaps are
    // the reason a profile is unconfirmed: name them — /p calls the same
    // fields "Still needed". "Hasn't confirmed" is left for a profile the
    // organizer filled in that the person never saved themselves.
    if (p.missing_fields?.length) reasons.push(cap(p.missing_fields.map((f) => FIELD_LABEL[f] || f).join(' · ')))
    else if (!p.profile_confirmed) reasons.push("Hasn't confirmed their details")
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

// §2 Checklists card: open items, unassigned first. D13: packing items are
// personal and only tasks are assigned, so a packing item has no who (null —
// not even a stale assignee_name) and only an unassigned *task* is "Unassigned".
const isUnassigned = (list, item) => list.kind === 'tasks' && !item.assignee_person_id
const checklistWho = (list, item) => (list.kind === 'tasks' ? item.assignee_name || 'Unassigned' : null)

export function openChecklistItems(checklists = []) {
  const out = []
  for (const list of checklists || []) {
    for (const item of list.items || []) {
      if (item.done) continue
      out.push({ ...item, kind: list.kind, unassigned: isUnassigned(list, item), who: checklistWho(list, item) })
    }
  }
  return out.sort((a, b) => Number(b.unassigned) - Number(a.unassigned))
}

// §9 gap "next item timing": time_range is free text ('09:30–11:00', '9am',
// 'morning'). The first clock time in it is the start; a bare number isn't one
// ('Day 2'), so a time needs minutes or am/pm. Unparseable → null, and such an
// item is listed but never "Next".
const to24 = (h, ap) => (h % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0)

const RANGE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i

export function parseStartMinutes(timeRange) {
  const s = String(timeRange ?? '')
  // A range's start may be a bare hour that borrows the end's am/pm:
  // '10–11am' → 10:00, '9–11pm' → 21:00, '11-1pm' → 11:00 (11pm would come
  // after its own end), '9-10:30' → 09:00 (24h).
  const range = RANGE.exec(s)
  if (range) {
    const [, h1, m1, ap1, h2, m2, ap2] = range
    const sm = m1 == null ? 0 : Number(m1)
    const sh = Number(h1)
    if (sm <= 59) {
      if (ap1) { if (sh >= 1 && sh <= 12) return to24(sh, ap1) * 60 + sm }
      else if (ap2) {
        if (sh >= 1 && sh <= 12 && Number(h2) >= 1 && Number(h2) <= 12) {
          const end = to24(Number(h2), ap2) * 60 + (m2 == null ? 0 : Number(m2))
          const same = to24(sh, ap2) * 60 + sm
          return same <= end ? same : to24(sh, ap2.toLowerCase() === 'pm' ? 'am' : 'pm') * 60 + sm
        }
      } else if (sh <= 23 && (m1 != null || m2 != null)) return sh * 60 + sm
    }
  }
  const re = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/gi
  for (const m of s.matchAll(re)) {
    const [, hh, mm, ap] = m
    if (mm == null && !ap) continue
    let h = Number(hh)
    const min = mm == null ? 0 : Number(mm)
    if (min > 59) return null
    if (ap) {
      if (h < 1 || h > 12) return null
      h = to24(h, ap)
    } else if (h > 23) return null
    return h * 60 + min
  }
  return null
}

// A range's end, by the same rules as its start ('10–11am' → 11:00,
// '9am–1' → 13:00, '09:30–11:00' → 11:00). null without a range, or when the
// end isn't after the start (overnight, unparseable).
export function parseEndMinutes(timeRange) {
  const range = RANGE.exec(String(timeRange ?? ''))
  const start = parseStartMinutes(timeRange)
  if (!range || start == null) return null
  const [, , m1, ap1, h2s, m2s, ap2] = range
  const h2 = Number(h2s)
  const m2 = m2s == null ? 0 : Number(m2s)
  if (m2 > 59) return null
  let end
  const ap = ap2 || ap1
  if (ap) {
    if (h2 < 1 || h2 > 12) return null
    end = to24(h2, ap) * 60 + m2
    if (!ap2 && end <= start) end = to24(h2, ap.toLowerCase() === 'am' ? 'pm' : 'am') * 60 + m2
  } else {
    if (h2 > 23 || (m1 == null && m2s == null)) return null
    end = h2 * 60 + m2
  }
  return end > start ? end : null
}

// §2 Today: done items dimmed, the next one marked "Next · in N min".
// `next` is the first timed item starting at or after now; timed items before
// it are done — or `ongoing` while their end time is still to come.
// Untimed items go last and are never next (Review Focus 3).
export function todayTimeline(items = [], nowMinutes) {
  const withStart = items.map((it, i) => ({ ...it, start: parseStartMinutes(it.time_range), i }))
  const timed = withStart.filter((r) => r.start != null).sort((a, b) => a.start - b.start || a.i - b.i)
  const untimed = withStart.filter((r) => r.start == null)
  const next = timed.find((r) => r.start >= nowMinutes) || null
  const rows = [
    ...timed.map((r) => {
      if (r === next) return { ...r, state: 'next' }
      if (next && r.start >= next.start) return { ...r, state: 'later' }
      const end = parseEndMinutes(r.time_range)
      return { ...r, state: end != null && end > nowMinutes ? 'ongoing' : 'done' }
    }),
    ...untimed.map((r) => ({ ...r, state: 'untimed' }))
  ].map(({ i, ...r }) => r)
  return { rows, minutesToNext: next ? next.start - nowMinutes : null }
}

// §2 Quick reference "Tonight": the last stay booked on the latest day up to today.
export function tonightStay(days = [], todayIso) {
  const past = days.filter((d) => d.day_date <= todayIso).sort((a, b) => (a.day_date < b.day_date ? 1 : -1))
  for (const d of past) {
    const stays = (d.items || []).filter((i) => i.category === 'stay')
    if (stays.length) return stays[stays.length - 1]
  }
  return null
}

// §2 Before tomorrow: open checklist items due on or before tomorrow (overdue
// included). Items ticked this session stay listed (ticked) so a tick doesn't
// pull the row — and keyboard focus — out from under the organizer.
export function dueByTomorrow(checklists = [], tomorrowIso, keep = new Set()) {
  const out = []
  for (const list of checklists || []) {
    for (const item of list.items || []) {
      if (!item.due_date || item.due_date > tomorrowIso) continue
      if (item.done && !keep.has(item.id)) continue
      out.push({ ...item, who: checklistWho(list, item) })
    }
  }
  return out.map((it, i) => ({ it, i })).sort((a, b) => (a.it.due_date < b.it.due_date ? -1 : a.it.due_date > b.it.due_date ? 1 : a.i - b.i)).map((x) => x.it)
}

// §7: maps are a link out to Google Maps, never embedded.
export function mapsUrl(location) {
  return location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null
}
