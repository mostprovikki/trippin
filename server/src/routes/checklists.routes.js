import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { generate, aiGuard } from '../llm/index.js'
import { buildPackingPrompt } from '../llm/prompts/packing.js'

const CHECKLIST_FIELDS = ['name', 'trip_type_tags']
const ITEM_FIELDS = ['title', 'assignee_person_id', 'due_date', 'done']

export function itemsForChecklist(db, checklistId) {
  return db.prepare(`SELECT ci.id, ci.checklist_id, ci.title, ci.assignee_person_id, p.name AS assignee_name,
      ci.due_date, ci.done, ci.position
    FROM checklist_items ci LEFT JOIN persons p ON p.id = ci.assignee_person_id
    WHERE ci.checklist_id = ? ORDER BY ci.position`).all(checklistId)
}

export function checklistToJson(db, row) {
  if (!row) return row
  return {
    id: row.id,
    trip_id: row.trip_id,
    is_template: row.is_template,
    kind: row.kind,
    name: row.name,
    trip_type_tags: JSON.parse(row.trip_type_tags || '[]'),
    items: itemsForChecklist(db, row.id),
  }
}

function itemToJson(db, itemId) {
  return db.prepare(`SELECT ci.id, ci.checklist_id, ci.title, ci.assignee_person_id, p.name AS assignee_name,
      ci.due_date, ci.done, ci.position
    FROM checklist_items ci LEFT JOIN persons p ON p.id = ci.assignee_person_id
    WHERE ci.id = ?`).get(itemId)
}

export default async function routes(app) {
  const db = app.db
  // Unscoped re-reads for rows whose ownership the handler already verified.
  // Templates (is_template=1, trip_id NULL) are shared across organizers.
  const getChecklist = (id) => db.prepare('SELECT * FROM checklists WHERE id = ?').get(id)
  const getTrip = (id) => db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
  const getItem = (id) => db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id)
  const ownedChecklist = (req, id) => db.prepare(
    `SELECT c.* FROM checklists c LEFT JOIN trips t ON t.id = c.trip_id
     WHERE c.id = ? AND (c.is_template = 1 OR t.organizer_id = ?)`
  ).get(id, req.organizer.id)
  const ownedItem = (req) => db.prepare(
    `SELECT ci.* FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id
     LEFT JOIN trips t ON t.id = c.trip_id
     WHERE ci.id = ? AND (c.is_template = 1 OR t.organizer_id = ?)`
  ).get(req.params.itemId, req.organizer.id)
  const nextPosition = (checklistId) =>
    db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM checklist_items WHERE checklist_id = ?')
      .get(checklistId).maxPos + 1

  // ---- organizer: checklists ----
  app.get('/checklists', { preHandler: app.requireOrganizer }, async (req) => {
    const templateOnly = req.query?.template === '1' || req.query?.template === 1
    const rows = templateOnly
      ? db.prepare('SELECT * FROM checklists WHERE is_template = 1 ORDER BY name').all()
      : db.prepare(`SELECT * FROM checklists
          WHERE is_template = 1 OR trip_id IN (SELECT id FROM trips WHERE organizer_id = ?)
          ORDER BY name`).all(req.organizer.id)
    return { checklists: rows.map((r) => checklistToJson(db, r)) }
  })

  app.get('/trips/:tripId/checklists', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = app.ownedTrip(req, req.params.tripId)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const rows = db.prepare('SELECT * FROM checklists WHERE trip_id = ? ORDER BY name').all(trip.id)
    return { checklists: rows.map((r) => checklistToJson(db, r)) }
  })

  app.post('/checklists', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object',
        required: ['kind', 'name'],
        properties: {
          kind: { type: 'string', enum: ['packing', 'tasks'] },
          name: { type: 'string', minLength: 1 },
          trip_id: { type: ['string', 'null'] },
          is_template: { type: ['boolean', 'integer'] },
          trip_type_tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body
    const isTemplate = !!b.is_template
    if (!isTemplate && !b.trip_id)
      return httpError(reply, 400, 'VALIDATION', 'trip_id is required unless is_template is set')
    if (!isTemplate) {
      const trip = app.ownedTrip(req, b.trip_id)
      if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    }
    const id = randomUUID()
    db.prepare(`INSERT INTO checklists (id, trip_id, is_template, kind, name, trip_type_tags)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, isTemplate ? null : b.trip_id, isTemplate ? 1 : 0, b.kind, b.name, JSON.stringify(b.trip_type_tags ?? []))
    reply.code(201)
    return { checklist: checklistToJson(db, getChecklist(id)) }
  })

  app.put('/checklists/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const checklist = ownedChecklist(req, req.params.id)
    if (!checklist) return httpError(reply, 404, 'NOT_FOUND', 'No such checklist')
    const b = req.body || {}
    const updates = []
    const params = { id: checklist.id }
    for (const field of CHECKLIST_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, field)) {
        updates.push(`${field} = @${field}`)
        params[field] = field === 'trip_type_tags' ? JSON.stringify(b[field] ?? []) : b[field]
      }
    }
    if (updates.length) db.prepare(`UPDATE checklists SET ${updates.join(', ')} WHERE id = @id`).run(params)
    return { checklist: checklistToJson(db, getChecklist(checklist.id)) }
  })

  app.delete('/checklists/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const checklist = ownedChecklist(req, req.params.id)
    if (!checklist) return httpError(reply, 404, 'NOT_FOUND', 'No such checklist')
    db.prepare('DELETE FROM checklists WHERE id = ?').run(checklist.id)
    reply.code(204)
    return null
  })

  // ---- organizer: items ----
  app.post('/checklists/:id/items', {
    preHandler: app.requireOrganizer,
    schema: {
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1 },
          assignee_person_id: { type: ['string', 'null'] },
          due_date: { type: ['string', 'null'] },
        },
      },
    },
  }, async (req, reply) => {
    const checklist = ownedChecklist(req, req.params.id)
    if (!checklist) return httpError(reply, 404, 'NOT_FOUND', 'No such checklist')
    const id = randomUUID()
    const b = req.body
    db.prepare(`INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position)
      VALUES (?, ?, ?, ?, ?, 0, ?)`)
      .run(id, checklist.id, b.title, b.assignee_person_id ?? null, b.due_date ?? null, nextPosition(checklist.id))
    reply.code(201)
    return itemToJson(db, id)
  })

  app.put('/checklist-items/:itemId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const item = ownedItem(req)
    if (!item) return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    const b = req.body || {}
    const updates = []
    const params = { id: item.id }
    for (const field of ITEM_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, field)) {
        updates.push(`${field} = @${field}`)
        params[field] = field === 'done' ? (b[field] ? 1 : 0) : b[field]
      }
    }
    if (updates.length) db.prepare(`UPDATE checklist_items SET ${updates.join(', ')} WHERE id = @id`).run(params)
    return itemToJson(db, item.id)
  })

  app.delete('/checklist-items/:itemId', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const item = ownedItem(req)
    if (!item) return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(item.id)
    reply.code(204)
    return null
  })

  // ---- from-template / promote-to-template ----
  app.post('/trips/:tripId/checklists/from-template', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['template_id'], properties: { template_id: { type: 'string' } } } },
  }, async (req, reply) => {
    const trip = app.ownedTrip(req, req.params.tripId)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const template = getChecklist(req.body.template_id)
    if (!template || !template.is_template) return httpError(reply, 404, 'NOT_FOUND', 'No such template')

    const newId = randomUUID()
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO checklists (id, trip_id, is_template, kind, name, trip_type_tags)
        VALUES (?, ?, 0, ?, ?, ?)`)
        .run(newId, trip.id, template.kind, template.name, template.trip_type_tags)
      const items = itemsForChecklist(db, template.id)
      const ins = db.prepare(`INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position)
        VALUES (?, ?, ?, NULL, ?, 0, ?)`)
      for (const item of items) ins.run(randomUUID(), newId, item.title, item.due_date, item.position)
    })
    tx()
    reply.code(201)
    return { checklist: checklistToJson(db, getChecklist(newId)) }
  })

  app.post('/checklists/:id/promote-to-template', {
    preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } },
  }, async (req, reply) => {
    const source = ownedChecklist(req, req.params.id)
    if (!source) return httpError(reply, 404, 'NOT_FOUND', 'No such checklist')

    const newId = randomUUID()
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO checklists (id, trip_id, is_template, kind, name, trip_type_tags)
        VALUES (?, NULL, 1, ?, ?, ?)`)
        .run(newId, source.kind, req.body.name, source.trip_type_tags)
      const items = itemsForChecklist(db, source.id)
      const ins = db.prepare(`INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, due_date, done, position)
        VALUES (?, ?, ?, NULL, NULL, 0, ?)`)
      for (const item of items) ins.run(randomUUID(), newId, item.title, item.position)
    })
    tx()
    reply.code(201)
    return { checklist: checklistToJson(db, getChecklist(newId)) }
  })

  // ---- AI packing suggestion ----
  app.post('/checklists/:id/ai-packing-suggest', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const checklist = ownedChecklist(req, req.params.id)
    if (!checklist) return httpError(reply, 404, 'NOT_FOUND', 'No such checklist')
    if (checklist.kind !== 'packing') return httpError(reply, 400, 'NOT_PACKING', 'Checklist is not a packing list')
    if (checklist.is_template) return httpError(reply, 404, 'NOT_FOUND', 'Template has no trip context')
    if (aiGuard(reply)) return

    const trip = getTrip(checklist.trip_id)
    const durationDays = trip?.start_date && trip?.end_date
      ? Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) + 1
      : null
    const prompt = buildPackingPrompt(trip, durationDays, checklist.name)
    const result = await generate({
      system: 'You are a meticulous trip-packing assistant. Respond with JSON only, matching the schema.',
      prompt,
      schema: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
          },
        },
      },
    })
    return { items: result.items }
  })

  // ---- participant ----
  app.get('/participant/checklist', { preHandler: app.requireParticipant }, async (req) => {
    const { tripId, personId } = req.participant
    const packing = db.prepare(`SELECT ci.id, ci.title, ci.assignee_person_id, p.name AS assignee_name,
        ci.due_date, ci.done, ci.position, cl.name AS checklist_name
      FROM checklist_items ci
      JOIN checklists cl ON cl.id = ci.checklist_id
      LEFT JOIN persons p ON p.id = ci.assignee_person_id
      WHERE cl.trip_id = ? AND cl.kind = 'packing' AND (ci.assignee_person_id = ? OR ci.assignee_person_id IS NULL)
      ORDER BY cl.name, ci.position`).all(tripId, personId)

    const tasks = db.prepare(`SELECT ci.id, ci.title, ci.assignee_person_id, p.name AS assignee_name,
        ci.due_date, ci.done, ci.position, cl.name AS checklist_name
      FROM checklist_items ci
      JOIN checklists cl ON cl.id = ci.checklist_id
      LEFT JOIN persons p ON p.id = ci.assignee_person_id
      WHERE cl.trip_id = ? AND cl.kind = 'tasks' AND ci.assignee_person_id = ?
      ORDER BY cl.name, ci.position`).all(tripId, personId)

    return { packing, tasks }
  })

  app.put('/participant/checklist-items/:itemId', {
    preHandler: app.requireParticipant,
    schema: { body: { type: 'object', required: ['done'], properties: { done: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const row = db.prepare(`SELECT ci.*, cl.trip_id AS cl_trip_id, cl.kind AS cl_kind
      FROM checklist_items ci JOIN checklists cl ON cl.id = ci.checklist_id WHERE ci.id = ?`).get(req.params.itemId)
    if (!row || row.cl_trip_id !== req.participant.tripId)
      return httpError(reply, 404, 'NOT_FOUND', 'No such item')
    if (row.assignee_person_id && row.assignee_person_id !== req.participant.personId)
      return httpError(reply, 404, 'NOT_FOUND', 'Not assigned to you')
    if (row.cl_kind === 'tasks' && row.assignee_person_id !== req.participant.personId)
      return httpError(reply, 404, 'NOT_FOUND', 'Not assigned to you')
    db.prepare('UPDATE checklist_items SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, row.id)
    return itemToJson(db, row.id)
  })
}
