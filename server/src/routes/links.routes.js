import { randomUUID, randomBytes } from 'node:crypto'
import { httpError } from '../lib/errors.js'

export default async function routes(app) {
  app.post('/trips/:tripId/participants/:personId/link', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const { tripId, personId } = req.params
    if (!app.ownedTrip(req, tripId)) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const member = app.db.prepare('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?').get(tripId, personId)
    if (!member) return httpError(reply, 404, 'NOT_FOUND', 'Person is not a participant of this trip')
    app.db.prepare('UPDATE participant_links SET revoked_at = datetime() WHERE trip_id = ? AND person_id = ? AND revoked_at IS NULL')
      .run(tripId, personId)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = req.body?.expires_in_days
      ? new Date(Date.now() + req.body.expires_in_days * 86400e3).toISOString() : null
    app.db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash,expires_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(), tripId, personId, app.hashToken(token), expiresAt)
    return reply.code(201).send({ token, url: `/p/${token}` })
  })

  app.get('/trips/:tripId/links', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (!app.ownedTrip(req, req.params.tripId)) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const links = app.db.prepare(
      `SELECT l.id, l.person_id, p.name AS person_name, l.created_at, l.expires_at, l.revoked_at
       FROM participant_links l JOIN persons p ON p.id = l.person_id
       WHERE l.trip_id = ? ORDER BY l.created_at DESC`
    ).all(req.params.tripId)
    return { links }
  })

  app.post('/links/:linkId/revoke', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const link = app.db.prepare(
      'SELECT l.id FROM participant_links l JOIN trips t ON t.id = l.trip_id WHERE l.id = ? AND t.organizer_id = ?'
    ).get(req.params.linkId, req.organizer.id)
    if (!link) return httpError(reply, 404, 'NOT_FOUND', 'No such link')
    app.db.prepare('UPDATE participant_links SET revoked_at = datetime() WHERE id = ?').run(req.params.linkId)
    return reply.code(204).send()
  })
}
