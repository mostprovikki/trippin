import { expiryWarnings } from './expiry.js'

// tripper.md §6 "Missing": a required profile field absent (owner decision D2,
// 2026-10-01). Blank strings count as absent — a participant typing a space
// shouldn't read as complete.
export const REQUIRED_FIELDS = ['phone', 'emergency_contact', 'dietary']

export const missingFieldsOf = (person) => REQUIRED_FIELDS.filter((f) => !String(person?.[f] ?? '').trim())

export async function missingFieldsByPerson(db, tripId) {
  const rows = await db.all(
    `SELECT p.id, ${REQUIRED_FIELDS.map((f) => `p.${f}`).join(', ')}
     FROM trip_participants tp JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ?`,
    [tripId]
  )
  return new Map(rows.map((r) => [r.id, missingFieldsOf(r)]))
}

// Required doc types (trips.required_doc_types) a participant has no document
// of, at any expiry — an expiring one is already reported by expiryWarnings.
export async function missingDocsByPerson(db, tripId) {
  const trip = await db.get('SELECT required_doc_types FROM trips WHERE id = ?', [tripId])
  const required = JSON.parse(trip?.required_doc_types || '[]')
  const people = await db.all('SELECT person_id FROM trip_participants WHERE trip_id = ?', [tripId])
  const have = await db.all(
    `SELECT DISTINCT d.person_id, d.doc_type FROM documents d
     JOIN trip_participants tp ON tp.person_id = d.person_id WHERE tp.trip_id = ?`, [tripId])
  const owned = new Set(have.map((r) => `${r.person_id}|${r.doc_type}`))
  return new Map(people.map((p) => [p.person_id, required.filter((t) => !owned.has(`${p.person_id}|${t}`))]))
}

// How many participants the Overview lists under "Who's missing what": any
// expiry warning, missing required doc, missing required field, or an
// unconfirmed profile — the per-person rule of web/src/utils/overview.js
// missingRows, over the same inputs the readiness route returns. The Trips
// list shows it per trip (tripper.md §2 "the trip that needs me", §6 one number).
export async function missingPeopleCount(db, tripId) {
  const people = await db.all('SELECT person_id, profile_confirmed FROM trip_participants WHERE trip_id = ?', [tripId])
  if (!people.length) return 0
  const fields = await missingFieldsByPerson(db, tripId)
  const docs = await missingDocsByPerson(db, tripId)
  const warned = new Set((await expiryWarnings(db, tripId)).map((w) => w.person_id))
  return people.filter((p) => warned.has(p.person_id) || docs.get(p.person_id)?.length
    || fields.get(p.person_id)?.length || !p.profile_confirmed).length
}
