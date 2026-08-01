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

    const participants = []
    for (const p of people) {
      const { c: docs_count } = await app.db.get(
        'SELECT COUNT(*)::int AS c FROM documents WHERE person_id = ?', [p.person_id]
      )
      const activeLink = await app.db.get(
        `SELECT 1 FROM participant_links
         WHERE trip_id = ? AND person_id = ? AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))`,
        [tripId, p.person_id]
      )
      participants.push({
        person_id: p.person_id,
        name: p.name,
        profile_confirmed: p.profile_confirmed,
        docs_count,
        doc_warnings: warningsByPerson.get(p.person_id) || [],
        has_active_link: !!activeLink,
      })
    }

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
