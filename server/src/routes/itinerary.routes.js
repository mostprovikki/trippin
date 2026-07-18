import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { generate, aiGuard } from '../llm/index.js'
import { buildItineraryPrompt, buildDayRegenPrompt } from '../llm/prompts/itinerary.js'

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
  const getTrip = (id) => app.db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
  const getDay = (id) => app.db.prepare('SELECT * FROM itinerary_days WHERE id = ?').get(id)
  const getItem = (id) => app.db.prepare('SELECT * FROM itinerary_items WHERE id = ?').get(id)

  function listItems(dayId) {
    return app.db.prepare('SELECT * FROM itinerary_items WHERE day_id = ? ORDER BY position').all(dayId).map(itemToJson)
  }
  function dayToJson(row) {
    return { id: row.id, day_date: row.day_date, position: row.position, items: listItems(row.id) }
  }
  function listDays(tripId) {
    return app.db.prepare('SELECT * FROM itinerary_days WHERE trip_id = ? ORDER BY position').all(tripId).map(dayToJson)
  }

  // Ensures itinerary_days matches trip.start_date..end_date: drops out-of-range days
  // (cascades their items), inserts missing dates, and normalizes positions. Safe to
  // call inside an already-open db.transaction (better-sqlite3 nests via savepoints).
  function ensureDays(trip) {
    const run = app.db.transaction(() => {
      const range = dateRange(trip.start_date, trip.end_date)
      const existing = app.db.prepare('SELECT id, day_date FROM itinerary_days WHERE trip_id = ?').all(trip.id)
      for (const d of existing) if (!range.includes(d.day_date)) app.db.prepare('DELETE FROM itinerary_days WHERE id = ?').run(d.id)
      const remaining = new Set(app.db.prepare('SELECT day_date FROM itinerary_days WHERE trip_id = ?').all(trip.id).map((r) => r.day_date))
      range.forEach((date, idx) => {
        if (!remaining.has(date)) app.db.prepare('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)').run(randomUUID(), trip.id, date, idx)
      })
      range.forEach((date, idx) => app.db.prepare('UPDATE itinerary_days SET position = ? WHERE trip_id = ? AND day_date = ?').run(idx, trip.id, date))
    })
    run()
  }

  function computeDietSummary(tripId) {
    const total = app.db.prepare('SELECT COUNT(*) AS c FROM trip_participants WHERE trip_id = ?').get(tripId).c
    if (!total) return 'no participants recorded yet'
    const rows = app.db.prepare(
      `SELECT p.dietary AS dietary, COUNT(*) AS c FROM trip_participants tp
       JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? AND p.dietary IS NOT NULL GROUP BY p.dietary`,
    ).all(tripId)
    if (!rows.length) return `no dietary data of ${total} total`
    return `${rows.map((r) => `${r.c} ${r.dietary}`).join(', ')} of ${total} total`
  }
  function computePaceSummary(tripId) {
    const rows = app.db.prepare(
      `SELECT p.pace AS pace, COUNT(*) AS c FROM trip_participants tp
       JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? AND p.pace IS NOT NULL GROUP BY p.pace`,
    ).all(tripId)
    if (!rows.length) return null
    return rows.map((r) => `${r.c} prefer ${r.pace}`).join(', ')
  }

  function insertItems(dayId, items) {
    const ins = app.db.prepare(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    items.forEach((it, idx) => {
      ins.run(randomUUID(), dayId, idx, it.title, it.time_range ?? null, it.location ?? null, it.category ?? 'activity', it.est_cost ?? null, it.notes ?? null, it.link ?? null)
    })
  }

  app.get('/trips/:id/itinerary', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    return { days: listDays(trip.id) }
  })

  app.post('/trips/:id/itinerary/init', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = getTrip(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    ensureDays(trip)
    return { days: listDays(trip.id) }
  })

  app.post('/days/:dayId/items', { preHandler: app.requireOrganizer, schema: { body: itemBodySchema(['title']) } }, async (req, reply) => {
    const day = getDay(req.params.dayId)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    const b = req.body
    const { maxPos } = app.db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM itinerary_items WHERE day_id = ?').get(day.id)
    const id = randomUUID()
    app.db.prepare(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, day.id, maxPos + 1, b.title, b.time_range ?? null, b.location ?? null, b.category ?? 'activity', b.est_cost ?? null, b.notes ?? null, b.link ?? null)
    reply.code(201)
    return itemToJson(getItem(id))
  })

  app.put('/items/:itemId', { preHandler: app.requireOrganizer, schema: { body: itemBodySchema([]) } }, async (req, reply) => {
    const item = getItem(req.params.itemId)
    if (!item) return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    const b = req.body || {}
    const fields = ['title', 'time_range', 'location', 'category', 'est_cost', 'notes', 'link']
    const updates = []; const params = { id: item.id }
    for (const f of fields) if (Object.prototype.hasOwnProperty.call(b, f)) { updates.push(`${f} = @${f}`); params[f] = b[f] }
    if (updates.length) app.db.prepare(`UPDATE itinerary_items SET ${updates.join(', ')} WHERE id = @id`).run(params)
    return itemToJson(getItem(item.id))
  })

  app.delete('/items/:itemId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const item = getItem(req.params.itemId)
    if (!item) return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    app.db.prepare('DELETE FROM itinerary_items WHERE id = ?').run(item.id)
    reply.code(204)
    return null
  })

  app.put(
    '/days/:dayId/items/order',
    { preHandler: app.requireOrganizer, schema: { body: { type: 'object', required: ['item_ids'], properties: { item_ids: { type: 'array', items: { type: 'string' } } } } } },
    async (req, reply) => {
      const day = getDay(req.params.dayId)
      if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
      const tx = app.db.transaction((ids) => {
        ids.forEach((itemId, idx) => app.db.prepare('UPDATE itinerary_items SET position = ? WHERE id = ? AND day_id = ?').run(idx, itemId, day.id))
      })
      tx(req.body.item_ids)
      return { items: listItems(day.id) }
    },
  )

  app.post('/trips/:id/itinerary/ai-draft', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (aiGuard(reply)) return
    const trip = getTrip(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    const goals = app.db.prepare('SELECT title, fixed_date, fixed_place, notes FROM trip_goals WHERE trip_id = ?').all(trip.id)
    const dietSummary = computeDietSummary(trip.id)
    const paceSummary = computePaceSummary(trip.id)
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
    const trip = getTrip(req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    if (!trip.start_date || !trip.end_date) return httpError(reply, 400, 'NO_DATES', 'Trip dates are not confirmed')
    const range = dateRange(trip.start_date, trip.end_date)
    const badDay = req.body.days.map((d) => d.day_date).find((d) => !range.includes(d))
    if (badDay) return httpError(reply, 400, 'BAD_DAY', `Unknown day_date ${badDay} for this trip's date range`)

    const tx = app.db.transaction(() => {
      ensureDays(trip)
      const dayRows = app.db.prepare('SELECT id, day_date FROM itinerary_days WHERE trip_id = ?').all(trip.id)
      const dayIds = dayRows.map((d) => d.id)
      if (dayIds.length) app.db.prepare(`DELETE FROM itinerary_items WHERE day_id IN (${dayIds.map(() => '?').join(',')})`).run(...dayIds)
      const dayIdByDate = Object.fromEntries(dayRows.map((d) => [d.day_date, d.id]))
      for (const d of req.body.days) {
        const dayId = dayIdByDate[d.day_date]
        if (dayId) insertItems(dayId, d.items)
      }
    })
    tx()
    return { days: listDays(trip.id) }
  })

  app.post('/days/:dayId/ai-regen', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (aiGuard(reply)) return
    const day = getDay(req.params.dayId)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    const trip = getTrip(day.trip_id)
    const currentItems = listItems(day.id)
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
    const day = getDay(req.params.dayId)
    if (!day) return httpError(reply, 404, 'NOT_FOUND', 'No such day')
    const tx = app.db.transaction((items) => {
      app.db.prepare('DELETE FROM itinerary_items WHERE day_id = ?').run(day.id)
      insertItems(day.id, items)
    })
    tx(req.body.items)
    return { day: dayToJson(getDay(day.id)) }
  })
}
