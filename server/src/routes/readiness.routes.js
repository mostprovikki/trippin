import { httpError } from '../lib/errors.js'
import { expiryWarnings } from '../lib/expiry.js'

export default async function routes(app) {
  app.get('/trips/:id/readiness', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await app.ownedTrip(req, req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const tripId = trip.id

    const warningsByPerson = new Map()
    for (const w of await expiryWarnings(app.db, tripId)) {
      const list = warningsByPerson.get(w.person_id) || []
      list.push({ doc_type: w.doc_type, expiry_date: w.expiry_date, level: w.level })
      warningsByPerson.set(w.person_id, list)
    }

    const people = await app.db.all(
      `SELECT p.id AS person_id, p.name, tp.profile_confirmed
       FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
       WHERE tp.trip_id = ? ORDER BY p.name`,
      [tripId]
    )

    // One aggregate query per concern for all participants (was 2 round-trips per
    // participant — 2N total — which is expensive on serverless/pooled connections).
    const docCounts = await app.db.all(
      `SELECT tp.person_id AS person_id, COUNT(d.id)::int AS docs_count
       FROM trip_participants tp
       LEFT JOIN documents d ON d.person_id = tp.person_id
       WHERE tp.trip_id = ?
       GROUP BY tp.person_id`,
      [tripId]
    )
    const docsCountByPerson = new Map(docCounts.map((r) => [r.person_id, r.docs_count]))

    const activeLinks = await app.db.all(
      `SELECT tp.person_id AS person_id, bool_or(pl.person_id IS NOT NULL) AS has_active_link
       FROM trip_participants tp
       LEFT JOIN participant_links pl ON pl.trip_id = tp.trip_id AND pl.person_id = tp.person_id
         AND pl.revoked_at IS NULL
         AND (pl.expires_at IS NULL OR pl.expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
       WHERE tp.trip_id = ?
       GROUP BY tp.person_id`,
      [tripId]
    )
    const activeLinkByPerson = new Map(activeLinks.map((r) => [r.person_id, r.has_active_link]))

    const participants = people.map((p) => ({
      person_id: p.person_id,
      name: p.name,
      profile_confirmed: p.profile_confirmed,
      docs_count: docsCountByPerson.get(p.person_id) ?? 0,
      doc_warnings: warningsByPerson.get(p.person_id) || [],
      has_active_link: !!activeLinkByPerson.get(p.person_id),
    }))

    const dates_confirmed = !!(trip.date_mode === 'confirmed' && trip.start_date && trip.end_date)
    const destination_decided = !!(trip.destination_mode === 'decided' && trip.destination)
    const budget_drafted = !!(await app.db.get(
      'SELECT 1 FROM budget_lines WHERE trip_id = ? AND estimate > 0 LIMIT 1', [tripId]
    ))
    const { c: itinerary_days } = await app.db.get(
      'SELECT COUNT(*)::int AS c FROM itinerary_days WHERE trip_id = ?', [tripId]
    )

    const { total, done } = await app.db.get(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(ci.done), 0)::int AS done
       FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id
       WHERE c.trip_id = ?`,
      [tripId]
    )

    const overdue = await app.db.all(
      `SELECT ci.title, ci.due_date, p.name AS assignee_name
       FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id
       LEFT JOIN persons p ON p.id = ci.assignee_person_id
       WHERE c.trip_id = ? AND ci.done = 0 AND ci.due_date IS NOT NULL
         AND ci.due_date < to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
       ORDER BY ci.due_date`,
      [tripId]
    )

    return {
      participants,
      decisions: { dates_confirmed, destination_decided, budget_drafted, itinerary_days },
      checklists: { total_items: total, done_items: done, overdue },
    }
  })
}
