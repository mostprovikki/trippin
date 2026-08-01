import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { tripToJson } from './trips.routes.js'
import { CATEGORIES } from './budget.routes.js'
import { checklistToJson } from './checklists.routes.js'

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
  return Promise.all(days.map(async (day) => ({
    ...day,
    items: await db.all(
      'SELECT id, position, title, time_range, location, category, est_cost, notes, link FROM itinerary_items WHERE day_id = ? ORDER BY position',
      [day.id]
    ),
  })))
}

async function checklistsSnapshot(db, tripId) {
  const rows = await db.all('SELECT * FROM checklists WHERE trip_id = ?', [tripId])
  return Promise.all(rows.map((row) => checklistToJson(db, row)))
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
  const get = (id) => db.get('SELECT * FROM trips WHERE id = ?', [id])
  const getTrip = (req) => app.ownedTrip(req, req.params.id)
  const getArchive = (tripId) => db.get('SELECT * FROM archives WHERE trip_id = ?', [tripId])

  app.post('/trips/:id/archive', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (await getArchive(trip.id)) return httpError(reply, 409, 'ALREADY_ARCHIVED', 'Trip is already archived')

    const b = req.body || {}
    const notes = b.notes ?? null
    const photoLinks = JSON.stringify(b.photo_links ?? [])

    await db.tx(async () => {
      const snapshot = {
        trip: await tripToJson(db, trip),
        budget: await budgetSnapshot(db, trip.id),
        itinerary: await itinerarySnapshot(db, trip.id),
        checklists: await checklistsSnapshot(db, trip.id),
      }
      await db.run('INSERT INTO archives (trip_id, snapshot_json, notes, photo_links) VALUES (?, ?, ?, ?)',
        [trip.id, JSON.stringify(snapshot), notes, photoLinks])
      await db.run(
        `UPDATE trips SET status = 'archived', archived_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
        [trip.id]
      )
      await db.run(
        `UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE trip_id = ? AND revoked_at IS NULL`,
        [trip.id]
      )
    })

    return { archive: archiveToJson(await getArchive(trip.id)) }
  })

  app.get('/trips/:id/archive', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const archive = await getArchive(trip.id)
    if (!archive) return httpError(reply, 404, 'NOT_ARCHIVED', 'Trip has not been archived')
    const actuals = await db.all('SELECT category, amount FROM actuals WHERE trip_id = ?', [trip.id])
    return { archive: archiveToJson(archive), actuals }
  })

  app.put('/trips/:id/archive', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const archive = await getArchive(trip.id)
    if (!archive) return httpError(reply, 404, 'NOT_ARCHIVED', 'Trip has not been archived')
    const b = req.body || {}
    const updates = []
    const params = []
    if (Object.prototype.hasOwnProperty.call(b, 'notes')) { updates.push('notes = ?'); params.push(b.notes) }
    if (Object.prototype.hasOwnProperty.call(b, 'photo_links')) { updates.push('photo_links = ?'); params.push(JSON.stringify(b.photo_links ?? [])) }
    if (updates.length) {
      params.push(trip.id)
      await db.run(`UPDATE archives SET ${updates.join(', ')} WHERE trip_id = ?`, params)
    }
    return { archive: archiveToJson(await getArchive(trip.id)) }
  })

  app.put('/trips/:id/actuals', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const actuals = req.body?.actuals || []
    for (const a of actuals) {
      if (!CATEGORIES.includes(a.category)) return httpError(reply, 400, 'BAD_CATEGORY', `Invalid category: ${a.category}`)
    }
    await db.tx(async () => {
      await db.run('DELETE FROM actuals WHERE trip_id = ?', [trip.id])
      for (const a of actuals) await db.run('INSERT INTO actuals (trip_id, category, amount) VALUES (?, ?, ?)', [trip.id, a.category, a.amount])
    })
    return { actuals: await db.all('SELECT category, amount FROM actuals WHERE trip_id = ?', [trip.id]) }
  })

  app.post('/trips/:id/clone', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const name = req.body?.name
    if (!name) return httpError(reply, 400, 'NAME_REQUIRED', 'name is required')

    const newId = randomUUID()
    await db.tx(async () => {
      await db.run(`INSERT INTO trips (id, organizer_id, name, status, vibe_tags, origin_city, currency, destination_mode)
        VALUES (?, ?, ?, 'idea', ?, ?, ?, 'open')`,
        [newId, req.organizer.id, name, trip.vibe_tags, trip.origin_city, trip.currency])

      const goals = await db.all('SELECT title, notes FROM trip_goals WHERE trip_id = ?', [trip.id])
      for (const g of goals) await db.run(
        'INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place, notes) VALUES (?, ?, ?, NULL, NULL, ?)',
        [randomUUID(), newId, g.title, g.notes]
      )

      const participants = await db.all('SELECT person_id FROM trip_participants WHERE trip_id = ?', [trip.id])
      for (const p of participants) await db.run(
        'INSERT INTO trip_participants (trip_id, person_id, profile_confirmed) VALUES (?, ?, 0)',
        [newId, p.person_id]
      )

      const budgetLines = await db.all('SELECT category, estimate, basis FROM budget_lines WHERE trip_id = ?', [trip.id])
      for (const l of budgetLines) await db.run(
        'INSERT INTO budget_lines (id, trip_id, category, estimate, basis) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), newId, l.category, l.estimate, l.basis]
      )

      const checklists = await db.all('SELECT id, kind, name, trip_type_tags FROM checklists WHERE trip_id = ?', [trip.id])
      for (const c of checklists) {
        const newChecklistId = randomUUID()
        await db.run(
          'INSERT INTO checklists (id, trip_id, is_template, kind, name, trip_type_tags, organizer_id) VALUES (?, ?, 0, ?, ?, ?, ?)',
          [newChecklistId, newId, c.kind, c.name, c.trip_type_tags, req.organizer.id]
        )
        const items = await db.all('SELECT title, position FROM checklist_items WHERE checklist_id = ? ORDER BY position', [c.id])
        for (const it of items) await db.run(
          `INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position)
           VALUES (?, ?, ?, NULL, NULL, 0, ?)`,
          [randomUUID(), newChecklistId, it.title, it.position]
        )
      }
    })

    reply.code(201)
    return { trip: await tripToJson(db, await get(newId)) }
  })
}
