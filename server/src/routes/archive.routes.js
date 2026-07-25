import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { tripToJson } from './trips.routes.js'
import { CATEGORIES } from './budget.routes.js'
import { checklistToJson } from './checklists.routes.js'

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function budgetSnapshot(db, tripId) {
  const rows = db.prepare('SELECT category, estimate, basis FROM budget_lines WHERE trip_id = ?').all(tripId)
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]))
  const lines = CATEGORIES.map((category) => byCategory[category] || { category, estimate: 0, basis: null })
  const total = round2(lines.reduce((sum, l) => sum + l.estimate, 0))
  return { lines, total }
}

function itinerarySnapshot(db, tripId) {
  const days = db.prepare('SELECT id, day_date, position FROM itinerary_days WHERE trip_id = ? ORDER BY position').all(tripId)
  return days.map((day) => ({
    ...day,
    items: db.prepare('SELECT id, position, title, time_range, location, category, est_cost, notes, link FROM itinerary_items WHERE day_id = ? ORDER BY position')
      .all(day.id),
  }))
}

function checklistsSnapshot(db, tripId) {
  const rows = db.prepare('SELECT * FROM checklists WHERE trip_id = ?').all(tripId)
  return rows.map((row) => checklistToJson(db, row))
}

function archiveToJson(row) {
  return {
    trip_id: row.trip_id,
    snapshot: JSON.parse(row.snapshot_json),
    notes: row.notes,
    photo_links: JSON.parse(row.photo_links || '[]'),
    archived_at: row.archived_at,
  }
}

export default async function routes(app) {
  const db = app.db
  const get = (id) => db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
  const getTrip = (req) => app.ownedTrip(req, req.params.id)
  const getArchive = (tripId) => db.prepare('SELECT * FROM archives WHERE trip_id = ?').get(tripId)

  app.post('/trips/:id/archive', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (getArchive(trip.id)) return httpError(reply, 409, 'ALREADY_ARCHIVED', 'Trip is already archived')

    const b = req.body || {}
    const notes = b.notes ?? null
    const photoLinks = JSON.stringify(b.photo_links ?? [])

    const tx = db.transaction(() => {
      const snapshot = {
        trip: tripToJson(db, trip),
        budget: budgetSnapshot(db, trip.id),
        itinerary: itinerarySnapshot(db, trip.id),
        checklists: checklistsSnapshot(db, trip.id),
      }
      db.prepare('INSERT INTO archives (trip_id, snapshot_json, notes, photo_links) VALUES (?, ?, ?, ?)')
        .run(trip.id, JSON.stringify(snapshot), notes, photoLinks)
      db.prepare("UPDATE trips SET status = 'archived', archived_at = datetime() WHERE id = ?").run(trip.id)
      db.prepare('UPDATE participant_links SET revoked_at = datetime() WHERE trip_id = ? AND revoked_at IS NULL').run(trip.id)
    })
    tx()

    return { archive: archiveToJson(getArchive(trip.id)) }
  })

  app.get('/trips/:id/archive', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const archive = getArchive(trip.id)
    if (!archive) return httpError(reply, 404, 'NOT_ARCHIVED', 'Trip has not been archived')
    const actuals = db.prepare('SELECT category, amount FROM actuals WHERE trip_id = ?').all(trip.id)
    return { archive: archiveToJson(archive), actuals }
  })

  app.put('/trips/:id/archive', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const archive = getArchive(trip.id)
    if (!archive) return httpError(reply, 404, 'NOT_ARCHIVED', 'Trip has not been archived')
    const b = req.body || {}
    const updates = []
    const params = { trip_id: trip.id }
    if (Object.prototype.hasOwnProperty.call(b, 'notes')) { updates.push('notes = @notes'); params.notes = b.notes }
    if (Object.prototype.hasOwnProperty.call(b, 'photo_links')) { updates.push('photo_links = @photo_links'); params.photo_links = JSON.stringify(b.photo_links ?? []) }
    if (updates.length) db.prepare(`UPDATE archives SET ${updates.join(', ')} WHERE trip_id = @trip_id`).run(params)
    return { archive: archiveToJson(getArchive(trip.id)) }
  })

  app.put('/trips/:id/actuals', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const actuals = req.body?.actuals || []
    for (const a of actuals) {
      if (!CATEGORIES.includes(a.category)) return httpError(reply, 400, 'BAD_CATEGORY', `Invalid category: ${a.category}`)
    }
    const tx = db.transaction((rows) => {
      db.prepare('DELETE FROM actuals WHERE trip_id = ?').run(trip.id)
      const ins = db.prepare('INSERT INTO actuals (trip_id, category, amount) VALUES (?, ?, ?)')
      for (const a of rows) ins.run(trip.id, a.category, a.amount)
    })
    tx(actuals)
    return { actuals: db.prepare('SELECT category, amount FROM actuals WHERE trip_id = ?').all(trip.id) }
  })

  app.post('/trips/:id/clone', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const name = req.body?.name
    if (!name) return httpError(reply, 400, 'NAME_REQUIRED', 'name is required')

    const newId = randomUUID()
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO trips (id, organizer_id, name, status, vibe_tags, origin_city, currency, destination_mode)
        VALUES (?, ?, ?, 'idea', ?, ?, ?, 'open')`)
        .run(newId, req.organizer.id, name, trip.vibe_tags, trip.origin_city, trip.currency)

      const goals = db.prepare('SELECT title, notes FROM trip_goals WHERE trip_id = ?').all(trip.id)
      const insGoal = db.prepare('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place, notes) VALUES (?, ?, ?, NULL, NULL, ?)')
      for (const g of goals) insGoal.run(randomUUID(), newId, g.title, g.notes)

      const participants = db.prepare('SELECT person_id FROM trip_participants WHERE trip_id = ?').all(trip.id)
      const insParticipant = db.prepare('INSERT INTO trip_participants (trip_id, person_id, profile_confirmed) VALUES (?, ?, 0)')
      for (const p of participants) insParticipant.run(newId, p.person_id)

      const budgetLines = db.prepare('SELECT category, estimate, basis FROM budget_lines WHERE trip_id = ?').all(trip.id)
      const insBudget = db.prepare('INSERT INTO budget_lines (id, trip_id, category, estimate, basis) VALUES (?, ?, ?, ?, ?)')
      for (const l of budgetLines) insBudget.run(randomUUID(), newId, l.category, l.estimate, l.basis)

      const checklists = db.prepare('SELECT id, kind, name, trip_type_tags FROM checklists WHERE trip_id = ?').all(trip.id)
      const insChecklist = db.prepare('INSERT INTO checklists (id, trip_id, is_template, kind, name, trip_type_tags, organizer_id) VALUES (?, ?, 0, ?, ?, ?, ?)')
      const insItem = db.prepare(`INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position)
        VALUES (?, ?, ?, NULL, NULL, 0, ?)`)
      for (const c of checklists) {
        const newChecklistId = randomUUID()
        insChecklist.run(newChecklistId, newId, c.kind, c.name, c.trip_type_tags, req.organizer.id)
        const items = db.prepare('SELECT title, position FROM checklist_items WHERE checklist_id = ? ORDER BY position').all(c.id)
        for (const it of items) insItem.run(randomUUID(), newChecklistId, it.title, it.position)
      }
    })
    tx()

    reply.code(201)
    return { trip: tripToJson(db, get(newId)) }
  })
}
