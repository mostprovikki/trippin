import { randomUUID } from 'node:crypto'
import { docTypeLabel } from './docTypes.js'

// The one writer for trip_events ("Since you last looked", tripper.md §2).
// Called after a participant's write has succeeded — validate → authorize →
// write → record — so a refused request leaves no event behind.
const firstName = (name) => String(name || 'Someone').trim().split(/\s+/)[0]

const SUMMARY = {
  profile_saved: (who) => `${who} updated their details`,
  doc_uploaded: (who, { docType }) => `${who} uploaded their ${docTypeLabel(docType).toLowerCase()}`,
  checklist_ticked: (who, { title }) => `${who} ticked ${title}`
}
const TARGET = { profile_saved: 'people', doc_uploaded: 'people', checklist_ticked: 'checklists' }

// The same person repeating the same change within an hour (tick, untick,
// tick) is one change, not several.
export async function recordEvent(db, { tripId, personId, kind, ...detail }) {
  const person = await db.get('SELECT name FROM persons WHERE id = ?', [personId])
  const summary = SUMMARY[kind](firstName(person?.name), detail)
  const recent = await db.get(
    `SELECT 1 FROM trip_events WHERE trip_id = ? AND person_id = ? AND kind = ? AND summary = ?
       AND created_at > to_char((now() AT TIME ZONE 'UTC') - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS')`,
    [tripId, personId, kind, summary])
  if (recent) return
  await db.run('INSERT INTO trip_events (id, trip_id, person_id, kind, summary, target) VALUES (?,?,?,?,?,?)',
    [randomUUID(), tripId, personId, kind, summary, TARGET[kind]])
}
