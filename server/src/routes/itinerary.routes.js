import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { generate, aiGuard } from '../llm/index.js'
import { buildItineraryPrompt, buildDayRegenPrompt } from '../llm/prompts/itinerary.js'
import { buildTripIcs, slugify } from '../lib/ics.js'

const ITEM_CATEGORIES = ['travel', 'food', 'activity', 'rest', 'logistics']

function dateRange(start, end) {
  const out = []
  const d = new Date(start)
  while (d.toISOString().slice(0, 10) <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

function itemToJson(row) {
  if (!row) return row
  const { day_id, ...rest } = row
  return rest
}

const itemBodySchema = (required = []) => ({
  type: 'object', required, additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1 },
    time_range: { type: ['string', 'null'] },
    location: { type: ['string', 'null'] },
    category: { type: 'string', enum: ITEM_CATEGORIES },
    est_cost: { type: ['number', 'null'] },
    notes: { type: ['string', 'null'] },
    link: { type: ['string', 'null'] },
  },
})

const draftItemSchema = {
  type: 'object', required: ['title'],
  properties: {
    title: { type: 'string' }, time_range: { type: ['string', 'null'] }, location: { type: ['string', 'null'] },
    category: { type: 'string', enum: ITEM_CATEGORIES }, est_cost: { type: ['number', 'null'] },
    notes: { type: ['string', 'null'] }, link: { type: ['string', 'null'] },
  },
}
const draftDaySchema = {
  type: 'object', required: ['day_date', 'items'],
  properties: { day_date: { type: 'string' }, items: { type: 'array', items: draftItemSchema } },
}
const applyDraftBodySchema = { type: 'object', required: ['days'], properties: { days: { type: 'array', items: draftDaySchema } } }
const applyDayBodySchema = { type: 'object', required: ['items'], properties: { items: { type: 'array', items: draftItemSchema } } }

export default async function routes(app) {
  // Unscoped re-reads for rows whose ownership the handler already verified.
  const get = (id) => app.db.get('SELECT * FROM trips WHERE id = ?', [id])
  const getDay = (id) => app.db.get('SELECT * FROM itinerary_days WHERE id = ?', [id])
  const getItem = (id) => app.db.get('SELECT * FROM itinerary_items WHERE id = ?', [id])
  const getTrip = (req) => app.ownedTrip(req, req.params.id)
  const ownedDay = (req) => app.db.get(
    'SELECT d.* FROM itinerary_days d JOIN trips t ON t.id = d.trip_id WHERE d.id = ? AND t.organizer_id = ?',
    [req.params.dayId, req.organizer.id],
  )
  const ownedItem = (req) => app.db.get(
    `SELECT i.* FROM itinerary_items i JOIN itinerary_days d ON d.id = i.day_id
     JOIN trips t ON t.id = d.trip_id WHERE i.id = ? AND t.organizer_id = ?`,
    [req.params.itemId, req.organizer.id],
  )

  async function listItems(dayId) {
    // position alone isn't a total order (no UNIQUE constraint) — id as tiebreaker,
    // same pattern as participant.routes.js's itinerary read.
    const rows = await app.db.all('SELECT * FROM itinerary_items WHERE day_id = ? ORDER BY position, id', [dayId])
    return rows.map(itemToJson)
  }
  async function dayToJson(row) {
    return { id: row.id, day_date: row.day_date, position: row.position, items: await listItems(row.id) }
  }
  async function listDays(tripId) {
    const rows = await app.db.all('SELECT * FROM itinerary_days WHERE trip_id = ? ORDER BY position, day_date', [tripId])
    const days = []
    for (const row of rows) days.push(await dayToJson(row))
    return days
  }

  // Ensures itinerary_days matches trip.start_date..end_date: drops out-of-range days
  // (cascades their items), inserts missing dates, and normalizes positions. Safe to
  // call inside an already-open db.tx (Task 2's db layer nests via savepoints).
  async function ensureDays(trip) {
    await app.db.tx(async () => {
      const range = dateRange(trip.start_date, trip.end_date)
      const existing = await app.db.all('SELECT id, day_date FROM itinerary_days WHERE trip_id = ?', [trip.id])
      for (const d of existing) if (!range.includes(d.day_date)) await app.db.run('DELETE FROM itinerary_days WHERE id = ?', [d.id])
      const remainingRows = await app.db.all('SELECT day_date FROM itinerary_days WHERE trip_id = ?', [trip.id])
      const remaining = new Set(remainingRows.map((r) => r.day_date))
      for (const [idx, date] of range.entries())
        if (!remaining.has(date)) await app.db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', [randomUUID(), trip.id, date, idx])
      for (const [idx, date] of range.entries())
        await app.db.run('UPDATE itinerary_days SET position = ? WHERE trip_id = ? AND day_date = ?', [idx, trip.id, date])
    })
  }

  async function computeDietSummary(tripId) {
    const total = (await app.db.get('SELECT COUNT(*)::int AS c FROM trip_participants WHERE trip_id = ?', [tripId])).c
    if (!total) return 'no participants recorded yet'
    const rows = await app.db.all(
      `SELECT p.dietary AS dietary, COUNT(*)::int AS c FROM trip_participants tp
       JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? AND p.dietary IS NOT NULL GROUP BY p.dietary`,
      [tripId],
    )
    if (!rows.length) return `no dietary data of ${total} total`
    return `${rows.map((r) => `${r.c} ${r.dietary}`).join(', ')} of ${total} total`
  }
  async function computePaceSummary(tripId) {
    const rows = await app.db.all(
      `SELECT p.pace AS pace, COUNT(*)::int AS c FROM trip_participants tp
       JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? AND p.pace IS NOT NULL GROUP BY p.pace`,
      [tripId],
    )
    if (!rows.length) return null
    return rows.map((r) => `${r.c} prefer ${r.pace}`).join(', ')
  }

  async function insertItems(dayId, items) {
    for (const [idx, it] of items.entries()) {
      await app.db.run(
        `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [randomUUID(), dayId, idx, it.title, it.time_range ?? null, it.location ?? null, it.category ?? 'activity', it.est_cost ?? null, it.notes ?? null, it.link ?? null],
      )
    }
  }

  app.get('/trips/:id/itinerary', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return { days: await listDays(trip.id) }
  })

  app.get('/trips/:id/itinerary.ics', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const ics = buildTripIcs({ trip, days: await listDays(trip.id) })
    reply.header('content-disposition', `attachment; filename="${slugify(trip.name)}.ics"`)
    reply.type('text/calendar; charset=utf-8')
    return ics
  })

  app.post('/trips/:id/itinerary/init', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    await ensureDays(trip)
    return { days: await listDays(trip.id) }
  })

  app.post('/days/:dayId/items', { preHandler: app.requireOrganizer, schema: { body: itemBodySchema(['title']) } }, async (req, reply) => {
    const day = await ownedDay(req)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    const b = req.body
    const { maxpos } = await app.db.get('SELECT COALESCE(MAX(position), -1) AS maxpos FROM itinerary_items WHERE day_id = ?', [day.id])
    const id = randomUUID()
    await app.db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, day.id, maxpos + 1, b.title, b.time_range ?? null, b.location ?? null, b.category ?? 'activity', b.est_cost ?? null, b.notes ?? null, b.link ?? null],
    )
    reply.code(201)
    return itemToJson(await getItem(id))
  })

  app.put('/items/:itemId', { preHandler: app.requireOrganizer, schema: { body: itemBodySchema([]) } }, async (req, reply) => {
    const item = await ownedItem(req)
    if (!item) return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    const b = req.body || {}
    const fields = ['title', 'time_range', 'location', 'category', 'est_cost', 'notes', 'link']
    const updates = []; const params = []
    for (const f of fields) if (Object.prototype.hasOwnProperty.call(b, f)) { updates.push(`${f} = ?`); params.push(b[f]) }
    if (updates.length) {
      params.push(item.id)
      await app.db.run(`UPDATE itinerary_items SET ${updates.join(', ')} WHERE id = ?`, params)
    }
    return itemToJson(await getItem(item.id))
  })

  app.delete('/items/:itemId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const item = await ownedItem(req)
    if (!item) return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    await app.db.run('DELETE FROM itinerary_items WHERE id = ?', [item.id])
    reply.code(204)
    return null
  })

  app.put(
    '/days/:dayId/items/order',
    { preHandler: app.requireOrganizer, schema: { body: { type: 'object', required: ['item_ids'], properties: { item_ids: { type: 'array', items: { type: 'string' } } } } } },
    async (req, reply) => {
      const day = await ownedDay(req)
      if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
      await app.db.tx(async () => {
        for (const [idx, itemId] of req.body.item_ids.entries())
          await app.db.run('UPDATE itinerary_items SET position = ? WHERE id = ? AND day_id = ?', [idx, itemId, day.id])
      })
      return { items: await listItems(day.id) }
    },
  )

  app.get('/trips/:id/itinerary/ai-draft/prompt', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    const goals = await app.db.all('SELECT title, fixed_date, fixed_place, notes FROM trip_goals WHERE trip_id = ? ORDER BY seq', [trip.id])
    const dietSummary = await computeDietSummary(trip.id)
    const paceSummary = await computePaceSummary(trip.id)
    const days = dateRange(trip.start_date, trip.end_date)
    return { prompt: buildItineraryPrompt.standalone({ ...trip, paceSummary }, goals, dietSummary, days) }
  })

  app.post('/trips/:id/itinerary/ai-draft', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (aiGuard(reply)) return
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    const goals = await app.db.all('SELECT title, fixed_date, fixed_place, notes FROM trip_goals WHERE trip_id = ? ORDER BY seq', [trip.id])
    const dietSummary = await computeDietSummary(trip.id)
    const paceSummary = await computePaceSummary(trip.id)
    const days = dateRange(trip.start_date, trip.end_date)
    try {
      const { system, prompt, schema } = buildItineraryPrompt({ ...trip, paceSummary }, goals, dietSummary, days)
      const draft = await generate({ system, prompt, schema })
      return draft
    } catch (err) {
      return httpError(reply, 502, 'AI_FAILED', err.message)
    }
  })

  app.post('/trips/:id/itinerary/apply-draft', { preHandler: app.requireOrganizer, schema: { body: applyDraftBodySchema } }, async (req, reply) => {
    const trip = await getTrip(req)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    const range = dateRange(trip.start_date, trip.end_date)
    const badDay = req.body.days.map((d) => d.day_date).find((d) => !range.includes(d))
    if (badDay) return httpError(reply, 400, 'BAD_DAY', `Unknown day_date ${badDay} for this trip's date range`)

    await app.db.tx(async () => {
      await ensureDays(trip)
      const dayRows = await app.db.all('SELECT id, day_date FROM itinerary_days WHERE trip_id = ?', [trip.id])
      const dayIds = dayRows.map((d) => d.id)
      if (dayIds.length) await app.db.run(`DELETE FROM itinerary_items WHERE day_id IN (${dayIds.map(() => '?').join(',')})`, dayIds)
      const dayIdByDate = Object.fromEntries(dayRows.map((d) => [d.day_date, d.id]))
      for (const d of req.body.days) {
        const dayId = dayIdByDate[d.day_date]
        if (dayId) await insertItems(dayId, d.items)
      }
    })
    return { days: await listDays(trip.id) }
  })

  app.get('/days/:dayId/ai-regen/prompt', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const day = await ownedDay(req)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    const trip = await get(day.trip_id)
    const currentItems = await listItems(day.id)
    const instruction = (req.query && req.query.instruction) || null
    return { prompt: buildDayRegenPrompt.standalone(trip, day, currentItems, instruction) }
  })

  app.post('/days/:dayId/ai-regen', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (aiGuard(reply)) return
    const day = await ownedDay(req)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    const trip = await get(day.trip_id)
    const currentItems = await listItems(day.id)
    const instruction = (req.body && req.body.instruction) || null
    try {
      const { system, prompt, schema } = buildDayRegenPrompt(trip, day, currentItems, instruction)
      const draft = await generate({ system, prompt, schema })
      return draft
    } catch (err) {
      return httpError(reply, 502, 'AI_FAILED', err.message)
    }
  })

  app.post('/days/:dayId/apply', { preHandler: app.requireOrganizer, schema: { body: applyDayBodySchema } }, async (req, reply) => {
    const day = await ownedDay(req)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    await app.db.tx(async () => {
      await app.db.run('DELETE FROM itinerary_items WHERE day_id = ?', [day.id])
      await insertItems(day.id, req.body.items)
    })
    return { day: await dayToJson(await getDay(day.id)) }
  })
}
