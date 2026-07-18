import { httpError } from '../lib/errors.js'
import { expiryWarnings } from '../lib/expiry.js'

export default async function routes(app) {
  app.get('/trips/:id/readiness', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = app.db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const tripId = trip.id

    const warningsByPerson = new Map()
    for (const w of expiryWarnings(app.db, tripId)) {
      const list = warningsByPerson.get(w.person_id) || []
      list.push({ doc_type: w.doc_type, expiry_date: w.expiry_date, level: w.level })
      warningsByPerson.set(w.person_id, list)
    }

    const people = app.db.prepare(
      `SELECT p.id AS person_id, p.name, tp.profile_confirmed
       FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
       WHERE tp.trip_id = ? ORDER BY p.name`
    ).all(tripId)

    const docsCountStmt = app.db.prepare('SELECT COUNT(*) c FROM documents WHERE person_id = ?')
    const activeLinkStmt = app.db.prepare(
      `SELECT 1 FROM participant_links
       WHERE trip_id = ? AND person_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > datetime())`
    )

    const participants = people.map((p) => ({
      person_id: p.person_id,
      name: p.name,
      profile_confirmed: p.profile_confirmed,
      docs_count: docsCountStmt.get(p.person_id).c,
      doc_warnings: warningsByPerson.get(p.person_id) || [],
      has_active_link: !!activeLinkStmt.get(tripId, p.person_id),
    }))

    const dates_confirmed = !!(trip.date_mode === 'confirmed' && trip.start_date && trip.end_date)
    const destination_decided = !!(trip.destination_mode === 'decided' && trip.destination)
    const budget_drafted = !!app.db.prepare(
      'SELECT 1 FROM budget_lines WHERE trip_id = ? AND estimate > 0 LIMIT 1'
    ).get(tripId)
    const { c: itinerary_days } = app.db.prepare(
      'SELECT COUNT(*) c FROM itinerary_days WHERE trip_id = ?'
    ).get(tripId)

    const { total, done } = app.db.prepare(
      `SELECT COUNT(*) total, COALESCE(SUM(ci.done), 0) done
       FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id
       WHERE c.trip_id = ?`
    ).get(tripId)

    const overdue = app.db.prepare(
      `SELECT ci.title, ci.due_date, p.name AS assignee_name
       FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id
       LEFT JOIN persons p ON p.id = ci.assignee_person_id
       WHERE c.trip_id = ? AND ci.done = 0 AND ci.due_date IS NOT NULL AND ci.due_date < date('now')
       ORDER BY ci.due_date`
    ).all(tripId)

    return {
      participants,
      decisions: { dates_confirmed, destination_decided, budget_drafted, itinerary_days },
      checklists: { total_items: total, done_items: done, overdue },
    }
  })
}
