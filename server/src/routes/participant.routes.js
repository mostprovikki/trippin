import rateLimit from '@fastify/rate-limit'
import { personToJson } from './people.routes.js'
import { budgetShape } from './budget.routes.js'
import { buildTripIcs, slugify } from '../lib/ics.js'

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
    const trip = await app.db.get('SELECT * FROM trips WHERE id = ?', [tripId])
    const goals = await app.db.all('SELECT title, fixed_date, fixed_place FROM trip_goals WHERE trip_id = ? ORDER BY seq', [tripId])
    const tp = await app.db.get('SELECT profile_confirmed FROM trip_participants WHERE trip_id = ? AND person_id = ?', [tripId, personId])
    const person = personToJson(await app.db.get('SELECT * FROM persons WHERE id = ?', [personId]))

    // Itinerary: a day always appears even with zero items (LEFT JOIN), so an
    // empty day isn't silently dropped from the guest's read-only view.
    const itineraryRows = await app.db.all(
      `SELECT d.day_date, i.title, i.time_range, i.location, i.category, i.est_cost, i.notes, i.link
       FROM itinerary_days d LEFT JOIN itinerary_items i ON i.day_id = d.id
       WHERE d.trip_id = ? ORDER BY d.position, d.day_date, i.position, i.id`, [tripId])
    const itinerary = []
    for (const row of itineraryRows) {
      let day = itinerary[itinerary.length - 1]
      if (!day || day.day_date !== row.day_date) { day = { day_date: row.day_date, items: [] }; itinerary.push(day) }
      if (row.title != null) day.items.push({
        title: row.title, time_range: row.time_range, location: row.location,
        category: row.category, est_cost: row.est_cost, notes: row.notes, link: row.link,
      })
    }

    // Budget: null when the organizer hasn't set up budget lines at all, so the
    // guest page can distinguish "no budget yet" from "your share is 0".
    const hasBudget = await app.db.get('SELECT 1 AS x FROM budget_lines WHERE trip_id = ? LIMIT 1', [tripId])
    let budget = null
    if (hasBudget) {
      const shape = await budgetShape(app, tripId)
      const mine = shape.overrides.find((o) => o.person_id === personId)
      budget = { currency: trip.currency, equal_share: shape.equal_share, my_amount: mine ? mine.amount : shape.equal_share }
    }

    // Companions: first names only, never email/phone/full name of anyone else —
    // this response goes to a bearer-token guest link, not an authenticated organizer.
    const others = await app.db.all(
      `SELECT p.name FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
       WHERE tp.trip_id = ? AND tp.person_id != ? ORDER BY p.name`, [tripId, personId])
    const companions = others.map((o) => String(o.name).trim().split(/\s+/)[0])
    const { count: companion_count } = await app.db.get(
      'SELECT COUNT(*)::int AS count FROM trip_participants WHERE trip_id = ?', [tripId])

    return {
      trip: {
        id: trip.id, name: trip.name, description: trip.description, status: trip.status,
        vibe_tags: JSON.parse(trip.vibe_tags || '[]'), destination: trip.destination,
        date_mode: trip.date_mode, start_date: trip.start_date, end_date: trip.end_date,
        goals,
      },
      person,
      profile_confirmed: tp?.profile_confirmed ?? 0,
      itinerary,
      budget,
      companions,
      companion_count,
    }
  })

  app.put('/participant/profile', {
    preHandler: app.requireParticipant,
    schema: { body: bodySchema },
  }, async (req) => {
    const { tripId, personId } = req.participant
    for (const f of FIELDS) if (f in req.body)
      await app.db.run(
        `UPDATE persons SET ${f} = ?, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
        [f === 'interests' ? JSON.stringify(req.body[f]) : req.body[f], personId]
      )
    await app.db.run('UPDATE trip_participants SET profile_confirmed = 1 WHERE trip_id = ? AND person_id = ?', [tripId, personId])
    return { person: personToJson(await app.db.get('SELECT * FROM persons WHERE id = ?', [personId])) }
  })

  app.get('/participant/itinerary.ics', { preHandler: app.requireParticipant }, async (req, reply) => {
    const { tripId } = req.participant
    const trip = await app.db.get('SELECT * FROM trips WHERE id = ?', [tripId])
    const dayRows = await app.db.all('SELECT id, day_date FROM itinerary_days WHERE trip_id = ? ORDER BY position, day_date', [tripId])
    const days = []
    for (const day of dayRows) {
      const items = await app.db.all(
        'SELECT id, title, time_range, location, notes, link FROM itinerary_items WHERE day_id = ? ORDER BY position, id',
        [day.id]
      )
      days.push({ day_date: day.day_date, items })
    }
    const ics = buildTripIcs({ trip, days })
    reply.header('content-disposition', `attachment; filename="${slugify(trip.name)}.ics"`)
    reply.type('text/calendar; charset=utf-8')
    return ics
  })
}
