import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'

const FIELDS = ['name','phone','email','emergency_contact','dietary','allergies','medical_notes','pace','interests','budget_band','home_city']
const bodySchema = (required) => ({ type: 'object', required, additionalProperties: false, properties: {
  name: { type: 'string', minLength: 1 }, phone: { type: ['string','null'] }, email: { type: ['string','null'] },
  emergency_contact: { type: ['string','null'] }, dietary: { type: ['string','null'], enum: ['veg','non_veg','vegan',null] },
  allergies: { type: ['string','null'] }, medical_notes: { type: ['string','null'] },
  pace: { type: ['string','null'], enum: ['relaxed','moderate','packed',null] },
  interests: { type: 'array', items: { type: 'string' } },
  budget_band: { type: ['string','null'], enum: ['low','medium','high',null] }, home_city: { type: ['string','null'] }
} })

export function personToJson(row) {
  return row ? { ...row, interests: JSON.parse(row.interests || '[]') } : row
}

export default async function routes(app) {
  const opts = (required = []) => ({ preHandler: app.requireOrganizer, schema: { body: bodySchema(required) } })
  const get = (id) => app.db.prepare('SELECT * FROM persons WHERE id = ?').get(id)
  const owned = (req) => app.ownedPerson(req, req.params.id)

  app.get('/people', { preHandler: app.requireOrganizer }, async (req) =>
    ({ people: app.db.prepare('SELECT * FROM persons WHERE organizer_id = ? ORDER BY name').all(req.organizer.id).map(personToJson) }))

  app.post('/people', opts(['name']), async (req, reply) => {
    const id = randomUUID()
    const vals = Object.fromEntries(FIELDS.map(f => [f, f === 'interests' ? JSON.stringify(req.body.interests || []) : req.body[f] ?? null]))
    app.db.prepare(`INSERT INTO persons (id, organizer_id, ${FIELDS.join(',')}) VALUES (?, ?, ${FIELDS.map(() => '?').join(',')})`)
      .run(id, req.organizer.id, ...FIELDS.map(f => vals[f]))
    return reply.code(201).send({ person: personToJson(get(id)) })
  })

  app.get('/people/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = owned(req)
    return row ? { person: personToJson(row) } : httpError(reply, 404, 'NOT_FOUND', 'No such person')
  })

  app.put('/people/:id', opts([]), async (req, reply) => {
    if (!owned(req)) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    for (const f of FIELDS) if (f in req.body)
      app.db.prepare(`UPDATE persons SET ${f} = ?, updated_at = datetime() WHERE id = ?`)
        .run(f === 'interests' ? JSON.stringify(req.body[f]) : req.body[f], req.params.id)
    return { person: personToJson(get(req.params.id)) }
  })

  app.delete('/people/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (!owned(req)) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    const inTrip = app.db.prepare(`SELECT 1 FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
      WHERE tp.person_id = ? AND t.status != 'archived'`).get(req.params.id)
    if (inTrip) return httpError(reply, 409, 'TRIP_MEMBER', 'Person is part of a non-archived trip')
    app.db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id)
    return reply.code(204).send()
  })
}
