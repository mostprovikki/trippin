// tripper.md §6 "Missing": a required profile field absent (owner decision D2,
// 2026-10-01). Blank strings count as absent — a participant typing a space
// shouldn't read as complete.
export const REQUIRED_FIELDS = ['phone', 'emergency_contact', 'dietary']

export async function missingFieldsByPerson(db, tripId) {
  const rows = await db.all(
    `SELECT p.id, ${REQUIRED_FIELDS.map((f) => `p.${f}`).join(', ')}
     FROM trip_participants tp JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ?`,
    [tripId]
  )
  return new Map(rows.map((r) => [r.id, REQUIRED_FIELDS.filter((f) => !String(r[f] ?? '').trim())]))
}
