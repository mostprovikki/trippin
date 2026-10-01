import { formatShortDate } from './dates.js'
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
