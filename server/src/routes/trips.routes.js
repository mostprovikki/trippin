import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'

const TRIP_FIELDS = ['name', 'description', 'vibe_tags', 'origin_city', 'date_mode', 'start_date', 'end_date', 'flex_days', 'destination_mode', 'destination']
const TRANSITIONS = { idea: ['planning'], planning: ['confirmed'], confirmed: ['active'], active: [], archived: [] }

export async function tripToJson(db, row) {
  if (!row) return row
  return {
    ...row,
    vibe_tags: JSON.parse(row.vibe_tags || '[]'),
    windows: await db.all('SELECT id,start_date,end_date,note FROM trip_date_windows WHERE trip_id = ? ORDER BY start_date', [row.id]),
    goals: await db.all('SELECT id,title,fixed_date,fixed_place,notes FROM trip_goals WHERE trip_id = ? ORDER BY seq', [row.id]),
    participants: await db.all(`SELECT tp.person_id, p.name, tp.profile_confirmed FROM trip_participants tp
      JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? ORDER BY p.name`, [row.id]),
  }
}

export default async function routes(app) {
  // Unscoped re-read for rows whose ownership the handler already verified.
  const get = (id) => app.db.get('SELECT * FROM trips WHERE id = ?', [id])
  const owned = (req) => app.ownedTrip(req, req.params.id)
  const getGoal = (req, id) => app.db.get(
    'SELECT g.* FROM trip_goals g JOIN trips t ON t.id = g.trip_id WHERE g.id = ? AND t.organizer_id = ?', [id, req.organizer.id]
  )

  app.get('/trips', { preHandler: app.requireOrganizer }, async (req) => {
    const { status } = req.query || {}
    const rows = status
      ? await app.db.all('SELECT * FROM trips WHERE organizer_id = ? AND status = ? ORDER BY created_at DESC, id', [req.organizer.id, status])
      : await app.db.all('SELECT * FROM trips WHERE organizer_id = ? ORDER BY created_at DESC, id', [req.organizer.id])
    const trips = []
    for (const row of rows) {
      const { count } = await app.db.get('SELECT COUNT(*)::int AS count FROM trip_participants WHERE trip_id = ?', [row.id])
      trips.push({
        id: row.id, name: row.name, status: row.status, destination: row.destination,
        start_date: row.start_date, end_date: row.end_date, participant_count: count,
        vibe_tags: JSON.parse(row.vibe_tags || '[]'),
      })
    }
    return { trips }
  })

  app.post('/trips', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
  }, async (req, reply) => {
    const id = randomUUID()
    const b = req.body
    const participantIds = Array.isArray(b.participant_ids) ? b.participant_ids : []

    // validate → authorize → write. Every participant id is ownership-checked before the
    // first insert: this used to check them one at a time *inside* the insert loop with
    // no enclosing transaction, so an unowned id 404'd only after the trip and the
    // earlier participants had already been committed.
    for (const personId of participantIds) {
      if (!(await app.ownedPerson(req, personId))) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    }

    // ...and the writes go in one transaction, so a failure part-way (or a person deleted
    // between the check above and here) still leaves nothing behind.
    await app.db.tx(async () => {
      await app.db.run(`INSERT INTO trips (id, organizer_id, name, description, vibe_tags, origin_city, date_mode, start_date, end_date, flex_days, destination_mode, destination)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.organizer.id,
          b.name,
          b.description ?? null,
          JSON.stringify(b.vibe_tags ?? []),
          b.origin_city ?? null,
          b.date_mode ?? 'broad',
          b.start_date ?? null,
          b.end_date ?? null,
          b.flex_days ?? null,
          b.destination_mode ?? 'open',
          b.destination ?? null,
        ])
      for (const personId of participantIds) {
        await app.db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [id, personId])
      }
    })
    reply.code(201)
    return { trip: await tripToJson(app.db, await get(id)) }
  })

  app.get('/trips/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await owned(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return { trip: await tripToJson(app.db, trip) }
  })

  app.put('/trips/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await owned(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const b = req.body || {}
    const updates = []
    const params = []
    for (const field of TRIP_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, field)) {
        updates.push(`${field} = ?`)
        params.push(field === 'vibe_tags' ? JSON.stringify(b[field] ?? []) : b[field])
      }
    }
    if (updates.length) {
      params.push(trip.id)
      await app.db.run(`UPDATE trips SET ${updates.join(', ')}, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`, params)
    }
    return { trip: await tripToJson(app.db, await get(trip.id)) }
  })

  app.post('/trips/:id/status', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } },
  }, async (req, reply) => {
    const trip = await owned(req)
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
    await app.db.run(`UPDATE trips SET status = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`, [target, trip.id])
    return { trip: await tripToJson(app.db, await get(trip.id)) }
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
    const trip = await owned(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    await app.db.tx(async () => {
      await app.db.run('DELETE FROM trip_date_windows WHERE trip_id = ?', [trip.id])
      for (const w of req.body.windows) await app.db.run(
        'INSERT INTO trip_date_windows (id, trip_id, start_date, end_date, note) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), trip.id, w.start_date, w.end_date, w.note ?? null]
      )
    })
    const windows = await app.db.all('SELECT id,start_date,end_date,note FROM trip_date_windows WHERE trip_id = ? ORDER BY start_date', [trip.id])
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
    const trip = await owned(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const id = randomUUID()
    const b = req.body
    await app.db.run('INSERT INTO trip_goals (id, trip_id, title, fixed_date, fixed_place, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [id, trip.id, b.title, b.fixed_date ?? null, b.fixed_place ?? null, b.notes ?? null])
    reply.code(201)
    return await getGoal(req, id)
  })

  app.put('/goals/:goalId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const goal = await getGoal(req, req.params.goalId)
    if (!goal) return httpError(reply, 404, 'NOT_FOUND', 'No such goal')
    const b = req.body || {}
    const fields = ['title', 'fixed_date', 'fixed_place', 'notes']
    const updates = []
    const params = []
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(b, field)) {
        updates.push(`${field} = ?`)
        params.push(b[field])
      }
    }
    if (updates.length) {
      params.push(goal.id)
      await app.db.run(`UPDATE trip_goals SET ${updates.join(', ')} WHERE id = ?`, params)
    }
    return await getGoal(req, goal.id)
  })

  app.delete('/goals/:goalId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const goal = await getGoal(req, req.params.goalId)
    if (!goal) return httpError(reply, 404, 'NOT_FOUND', 'No such goal')
    await app.db.run('DELETE FROM trip_goals WHERE id = ?', [goal.id])
    reply.code(204)
    return null
  })

  app.post('/trips/:id/participants', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['person_id'], properties: { person_id: { type: 'string' } } } },
  }, async (req, reply) => {
    const trip = await owned(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!(await app.ownedPerson(req, req.body.person_id))) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    const existing = await app.db.get('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?', [trip.id, req.body.person_id])
    if (existing) return httpError(reply, 409, 'ALREADY_MEMBER', 'Person is already a participant')
    await app.db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [trip.id, req.body.person_id])
    reply.code(201)
    return { trip: await tripToJson(app.db, await get(trip.id)) }
  })

  app.delete('/trips/:id/participants/:personId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await owned(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    await app.db.run('DELETE FROM trip_participants WHERE trip_id = ? AND person_id = ?', [trip.id, req.params.personId])
    reply.code(204)
    return null
  })
}
