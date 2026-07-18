import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'

const TRIP_FIELDS = ['name', 'description', 'vibe_tags', 'origin_city', 'date_mode', 'start_date', 'end_date', 'flex_days', 'destination_mode', 'destination']
const TRANSITIONS = { idea: ['planning'], planning: ['confirmed'], confirmed: ['active'], active: [], archived: [] }

export function tripToJson(db, row) {
  if (!row) return row
  return {
    ...row,
    vibe_tags: JSON.parse(row.vibe_tags || '[]'),
    windows: db.prepare('SELECT id,start_date,end_date,note FROM trip_date_windows WHERE trip_id = ? ORDER BY start_date').all(row.id),
    goals: db.prepare('SELECT id,title,fixed_date,fixed_place,notes FROM trip_goals WHERE trip_id = ?').all(row.id),
    participants: db.prepare(`SELECT tp.person_id, p.name, tp.profile_confirmed FROM trip_participants tp
      JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? ORDER BY p.name`).all(row.id),
  }
}

export default async function routes(app) {
  const get = (id) => app.db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
  const getGoal = (id) => app.db.prepare('SELECT * FROM trip_goals WHERE id = ?').get(id)

  app.get('/trips', { preHandler: app.requireOrganizer }, async (req) => {
    const { status } = req.query || {}
    const rows = status
      ? app.db.prepare('SELECT * FROM trips WHERE status = ? ORDER BY created_at DESC').all(status)
      : app.db.prepare('SELECT * FROM trips ORDER BY created_at DESC').all()
    const trips = rows.map((row) => {
      const { count } = app.db.prepare('SELECT COUNT(*) AS count FROM trip_participants WHERE trip_id = ?').get(row.id)
      return {
        id: row.id, name: row.name, status: row.status, destination: row.destination,
        start_date: row.start_date, end_date: row.end_date, participant_count: count,
      }
    })
    return { trips }
  })

  app.post('/trips', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
  }, async (req, reply) => {
    const id = randomUUID()
    const b = req.body
    app.db.prepare(`INSERT INTO trips (id, name, description, vibe_tags, origin_city, date_mode, start_date, end_date, flex_days, destination_mode, destination)
      VALUES (@id, @name, @description, @vibe_tags, @origin_city, @date_mode, @start_date, @end_date, @flex_days, @destination_mode, @destination)`)
      .run({
        id,
        name: b.name,
        description: b.description ?? null,
        vibe_tags: JSON.stringify(b.vibe_tags ?? []),
        origin_city: b.origin_city ?? null,
        date_mode: b.date_mode ?? 'broad',
        start_date: b.start_date ?? null,
        end_date: b.end_date ?? null,
        flex_days: b.flex_days ?? null,
        destination_mode: b.destination_mode ?? 'open',
        destination: b.destination ?? null,
      })
    if (Array.isArray(b.participant_ids)) {
      const ins = app.db.prepare('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)')
      for (const personId of b.participant_ids) ins.run(id, personId)
    }
    reply.code(201)
    return { trip: tripToJson(app.db, get(id)) }
  })

  app.get('/trips/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return { trip: tripToJson(app.db, trip) }
  })

  app.put('/trips/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const b = req.body || {}
    const updates = []
    const params = { id: trip.id }
    for (const field of TRIP_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, field)) {
        updates.push(`${field} = @${field}`)
        params[field] = field === 'vibe_tags' ? JSON.stringify(b[field] ?? []) : b[field]
      }
    }
    if (updates.length) {
      app.db.prepare(`UPDATE trips SET ${updates.join(', ')}, updated_at = datetime() WHERE id = @id`).run(params)
    }
    return { trip: tripToJson(app.db, get(trip.id)) }
  })

  app.post('/trips/:id/status', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } },
  }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const target = req.body.status
    if (target === 'archived') return httpError(reply, 400, 'USE_ARCHIVE_ENDPOINT', 'Archive via POST /api/trips/:id/archive')
    if (!(TRANSITIONS[trip.status] || []).includes(target))
      return httpError(reply, 400, 'BAD_TRANSITION', `Cannot go ${trip.status} → ${target}`)
    if (target === 'confirmed') {
      const ready = trip.date_mode === 'confirmed' && trip.start_date && trip.end_date
        && trip.destination_mode === 'decided' && trip.destination
      if (!ready) return httpError(reply, 400, 'NOT_READY', 'Confirmed requires final dates and a decided destination')
    }
    app.db.prepare('UPDATE trips SET status = ?, updated_at = datetime() WHERE id = ?').run(target, trip.id)
    return { trip: tripToJson(app.db, get(trip.id)) }
  })

  app.put('/trips/:id/windows', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object', required: ['windows'],
        properties: {
          windows: {
            type: 'array',
            items: {
              type: 'object', required: ['start_date', 'end_date'],
              properties: { start_date: { type: 'string' }, end_date: { type: 'string' }, note: { type: 'string' } },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const tx = app.db.transaction((windows) => {
      app.db.prepare('DELETE FROM trip_date_windows WHERE trip_id = ?').run(trip.id)
      const ins = app.db.prepare('INSERT INTO trip_date_windows (id, trip_id, start_date, end_date, note) VALUES (?, ?, ?, ?, ?)')
      for (const w of windows) ins.run(randomUUID(), trip.id, w.start_date, w.end_date, w.note ?? null)
    })
    tx(req.body.windows)
    const windows = app.db.prepare('SELECT id,start_date,end_date,note FROM trip_date_windows WHERE trip_id = ? ORDER BY start_date').all(trip.id)
    return { windows }
  })

  app.post('/trips/:id/goals', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object', required: ['title'],
        properties: {
          title: { type: 'string' }, fixed_date: { type: 'string' },
          fixed_place: { type: 'string' }, notes: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const id = randomUUID()
    const b = req.body
    app.db.prepare('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, trip.id, b.title, b.fixed_date ?? null, b.fixed_place ?? null, b.notes ?? null)
    reply.code(201)
    return getGoal(id)
  })

  app.put('/goals/:goalId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const goal = getGoal(req.params.goalId)
    if (!goal) return httpError(reply, 404, 'NOT_FOUND', 'No such goal')
    const b = req.body || {}
    const fields = ['title', 'fixed_date', 'fixed_place', 'notes']
    const updates = []
    const params = { id: goal.id }
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(b, field)) {
        updates.push(`${field} = @${field}`)
        params[field] = b[field]
      }
    }
    if (updates.length) app.db.prepare(`UPDATE trip_goals SET ${updates.join(', ')} WHERE id = @id`).run(params)
    return getGoal(goal.id)
  })

  app.delete('/goals/:goalId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const goal = getGoal(req.params.goalId)
    if (!goal) return httpError(reply, 404, 'NOT_FOUND', 'No such goal')
    app.db.prepare('DELETE FROM trip_goals WHERE id = ?').run(goal.id)
    reply.code(204)
    return null
  })

  app.post('/trips/:id/participants', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['person_id'], properties: { person_id: { type: 'string' } } } },
  }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const existing = app.db.prepare('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?').get(trip.id, req.body.person_id)
    if (existing) return httpError(reply, 409, 'ALREADY_MEMBER', 'Person is already a participant')
    app.db.prepare('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)').run(trip.id, req.body.person_id)
    reply.code(201)
    return { trip: tripToJson(app.db, get(trip.id)) }
  })

  app.delete('/trips/:id/participants/:personId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = get(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    app.db.prepare('DELETE FROM trip_participants WHERE trip_id = ? AND person_id = ?').run(trip.id, req.params.personId)
    reply.code(204)
    return null
  })
}
