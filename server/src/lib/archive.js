import { tripToJson } from '../routes/trips.routes.js'
import { CATEGORIES } from '../routes/budget.routes.js'
import { checklistToJson } from '../routes/checklists.routes.js'

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

async function budgetSnapshot(db, tripId) {
  const rows = await db.all('SELECT category, estimate, basis FROM budget_lines WHERE trip_id = ?', [tripId])
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]))
  const lines = CATEGORIES.map((category) => byCategory[category] || { category, estimate: 0, basis: null })
  const total = round2(lines.reduce((sum, l) => sum + l.estimate, 0))
  return { lines, total }
}

async function itinerarySnapshot(db, tripId) {
  const days = await db.all('SELECT id, day_date, position FROM itinerary_days WHERE trip_id = ? ORDER BY position', [tripId])
  const out = []
  for (const day of days) {
    const items = await db.all(
      'SELECT id, position, title, time_range, location, category, est_cost, notes, link FROM itinerary_items WHERE day_id = ? ORDER BY position',
      [day.id]
    )
    out.push({ ...day, items })
  }
  return out
}

async function checklistsSnapshot(db, tripId) {
  // The archive snapshot is a write-once immutable JSON blob: whatever order this
  // captures is frozen forever and cannot be re-derived. Postgres heap order is
  // unspecified and shifts after any UPDATE, so order explicitly. `name` matches how
  // checklists.routes.js lists checklists everywhere else; `id` (a UUID) breaks ties,
  // since checklists.name carries no uniqueness constraint.
  const rows = await db.all('SELECT * FROM checklists WHERE trip_id = ? ORDER BY name, id', [tripId])
  const out = []
  for (const row of rows) out.push(await checklistToJson(db, row))
  return out
}

// Archives `trip` in one transaction: snapshot (budget/itinerary/checklists), the
// archives upsert row, the trips status flip (recording prior_status + archived_at), and
// revoking any live participant links. Shared by the manual POST /trips/:id/archive
// endpoint (archive.routes.js) and the auto-archive sweep in trips.routes.js (GET /trips,
// GET /trips/:id), so a trip that ages out of 'active' ends up in exactly the same state
// as one archived by hand — same snapshot, same unarchive semantics, same revoked links.
export async function archiveTrip(db, trip, { notes = null, photoLinks = '[]', photoLinksProvided = false } = {}) {
  await db.tx(async () => {
    const snapshot = {
      trip: await tripToJson(db, trip),
      budget: await budgetSnapshot(db, trip.id),
      itinerary: await itinerarySnapshot(db, trip.id),
      checklists: await checklistsSnapshot(db, trip.id),
    }
    // Upsert: archives.trip_id is a PRIMARY KEY, and a trip archived a second
    // time (after being unarchived) reuses the same row rather than erroring
    // on a duplicate key.
    await db.run(
      `INSERT INTO archives (trip_id, snapshot_json, notes, photo_links)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (trip_id) DO UPDATE SET
         snapshot_json = EXCLUDED.snapshot_json,
         notes = COALESCE(EXCLUDED.notes, archives.notes),
         photo_links = CASE WHEN ? THEN EXCLUDED.photo_links ELSE archives.photo_links END,
         archived_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`,
      [trip.id, JSON.stringify(snapshot), notes, photoLinks, photoLinksProvided]
    )
    await db.run(
      `UPDATE trips SET status = 'archived', prior_status = ?, archived_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
      [trip.status, trip.id]
    )
    await db.run(
      `UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE trip_id = ? AND revoked_at IS NULL`,
      [trip.id]
    )
  })
}
