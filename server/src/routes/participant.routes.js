import rateLimit from '@fastify/rate-limit'
import { personToJson } from './people.routes.js'

const FIELDS = ['name', 'phone', 'email', 'emergency_contact', 'dietary', 'allergies', 'medical_notes', 'pace', 'interests', 'budget_band', 'home_city']
const bodySchema = {
  type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1 }, phone: { type: ['string', 'null'] }, email: { type: ['string', 'null'] },
    emergency_contact: { type: ['string', 'null'] }, dietary: { type: ['string', 'null'], enum: ['veg', 'non_veg', 'vegan', null] },
    allergies: { type: ['string', 'null'] }, medical_notes: { type: ['string', 'null'] },
    pace: { type: ['string', 'null'], enum: ['relaxed', 'moderate', 'packed', null] },
    interests: { type: 'array', items: { type: 'string' } },
    budget_band: { type: ['string', 'null'], enum: ['low', 'medium', 'high', null] }, home_city: { type: ['string', 'null'] },
  },
}

export default async function routes(app) {
  await app.register(rateLimit, { max: 30, timeWindow: '1 minute' })

  app.get('/participant/me', { preHandler: app.requireParticipant }, async (req) => {
    const { tripId, personId } = req.participant
    const trip = app.db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId)
    const goals = app.db.prepare('SELECT title, fixed_date, fixed_place FROM trip_goals WHERE trip_id = ?').all(tripId)
    const tp = app.db.prepare('SELECT profile_confirmed FROM trip_participants WHERE trip_id = ? AND person_id = ?').get(tripId, personId)
    const person = personToJson(app.db.prepare('SELECT * FROM persons WHERE id = ?').get(personId))
    return {
      trip: {
        id: trip.id, name: trip.name, description: trip.description, status: trip.status,
        vibe_tags: JSON.parse(trip.vibe_tags || '[]'), destination: trip.destination,
        date_mode: trip.date_mode, start_date: trip.start_date, end_date: trip.end_date,
        goals,
      },
      person,
      profile_confirmed: tp?.profile_confirmed ?? 0,
    }
  })

  app.put('/participant/profile', {
    preHandler: app.requireParticipant,
    schema: { body: bodySchema },
  }, async (req) => {
    const { tripId, personId } = req.participant
    for (const f of FIELDS) if (f in req.body)
      app.db.prepare(`UPDATE persons SET ${f} = ?, updated_at = datetime() WHERE id = ?`)
        .run(f === 'interests' ? JSON.stringify(req.body[f]) : req.body[f], personId)
    app.db.prepare('UPDATE trip_participants SET profile_confirmed = 1 WHERE trip_id = ? AND person_id = ?').run(tripId, personId)
    return { person: personToJson(app.db.prepare('SELECT * FROM persons WHERE id = ?').get(personId)) }
  })
}
