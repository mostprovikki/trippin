// RFC5545 .ics generation for a trip's itinerary. Server-side twin of
// web/src/utils/itinerary.js's parseTimeRange (T9) — two runtimes, no shared
// module, but the contract is identical: "HH:MM–HH:MM" (en dash) or
// "HH:MM-HH:MM" (ASCII hyphen), optional surrounding whitespace -> {start,end},
// else null.

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

export function parseTimeRange(str) {
  if (!str) return null
  const m = /^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/.exec(str)
  if (!m) return null
  const [sh, sm, eh, em] = m.slice(1).map(Number)
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null
  const pad = (n) => String(n).padStart(2, '0')
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` }
}

export function slugify(name) {
  const s = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'trip'
}

function isoDateParts(dayDate) {
  const [y, mo, d] = dayDate.split('-')
  return { y, mo, d }
}
function addOneDay(dayDate) {
  const d = new Date(`${dayDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
function compact(dayDate) {
  const { y, mo, d } = isoDateParts(dayDate)
  return `${y}${mo}${d}`
}

function eventLines(dayDate, item) {
  const uid = `${item.id}@tripper`
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`]

  const range = parseTimeRange(item.time_range)
  if (range) {
    // Floating local time: no TZID, no trailing Z. Tripper does not track the
    // destination's timezone, so this is the best representation available —
    // every calendar app will show these times as-is, in whichever zone the
    // viewer's device is set to, which is wrong for a trip abroad but is the
    // same ambiguity the app's own time_range display already has.
    //
    // Known limitation: a range that crosses midnight (end <= start) is not
    // handled — the file still generates, just with DTEND < DTSTART on that
    // one event. Out of scope per the brief.
    const date = compact(dayDate)
    lines.push(`DTSTART:${date}T${range.start.replace(':', '')}00`)
    lines.push(`DTEND:${date}T${range.end.replace(':', '')}00`)
  } else {
    // All-day fallback. DTEND on an all-day VEVENT is exclusive per RFC5545,
    // so it is the *next* calendar day even for a single-day event.
    lines.push(`DTSTART;VALUE=DATE:${compact(dayDate)}`)
    lines.push(`DTEND;VALUE=DATE:${compact(addOneDay(dayDate))}`)
  }

  lines.push(`SUMMARY:${escapeText(item.title)}`)
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`)
  const descParts = [item.notes, item.link].filter(Boolean)
  if (descParts.length) lines.push(`DESCRIPTION:${escapeText(descParts.join('\n\n'))}`)
  lines.push('END:VEVENT')
  return lines
}

export function buildTripIcs({ trip, days }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tripper//Itinerary//EN', 'CALSCALE:GREGORIAN']
  for (const day of days) for (const item of day.items) lines.push(...eventLines(day.day_date, item))
  lines.push('END:VCALENDAR')
  // RFC5545 requires CRLF line endings. No line folding at 75 octets —
  // not implemented, documented as a known limitation.
  return lines.join('\r\n') + '\r\n'
}
