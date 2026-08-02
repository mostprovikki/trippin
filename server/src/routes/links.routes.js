import { randomUUID, randomBytes } from 'node:crypto'
import { httpError } from '../lib/errors.js'

export default async function routes(app) {
  app.post('/trips/:tripId/participants/:personId/link', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const { tripId, personId } = req.params
    if (!(await app.ownedTrip(req, tripId))) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const member = await app.db.get('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?', [tripId, personId])
    if (!member) return httpError(reply, 404, 'NOT_FOUND', 'Person is not a participant of this trip')
    await app.db.run(
      `UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
       WHERE trip_id = ? AND person_id = ? AND revoked_at IS NULL`,
      [tripId, personId]
    )
    const token = randomBytes(32).toString('base64url')
    // expires_at is TEXT in 'YYYY-MM-DD HH24:MI:SS' UTC like every other timestamp in
    // this schema — NOT ISO-8601. It used to be written with .toISOString(), and since
    // 'T' (0x54) sorts above ' ' (0x20), a dead link compared as still-alive against a
    // to_char() stamp for the whole of its expiry date. Computing it here in SQL keeps
    // the clock and the format identical to what plugins/auth.js and readiness.routes.js
    // compare it against.
    const days = req.body?.expires_in_days || null
    await app.db.run(
      `INSERT INTO participant_links (id,trip_id,person_id,token_hash,expires_at)
       VALUES (?,?,?,?, CASE WHEN ?::double precision IS NULL THEN NULL ELSE
         to_char((now() AT TIME ZONE 'UTC') + (?::double precision * INTERVAL '1 day'), 'YYYY-MM-DD HH24:MI:SS') END)`,
      [randomUUID(), tripId, personId, app.hashToken(token), days, days])
    return reply.code(201).send({ token, url: `/p/${token}` })
  })

  app.get('/trips/:tripId/links', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (!(await app.ownedTrip(req, req.params.tripId))) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const links = await app.db.all(
      `SELECT l.id, l.person_id, p.name AS person_name, l.created_at, l.expires_at, l.revoked_at
       FROM participant_links l JOIN persons p ON p.id = l.person_id
       WHERE l.trip_id = ? ORDER BY l.created_at DESC, l.id`,
      [req.params.tripId]
    )
    return { links }
  })

  app.post('/links/:linkId/revoke', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const link = await app.db.get(
      'SELECT l.id FROM participant_links l JOIN trips t ON t.id = l.trip_id WHERE l.id = ? AND t.organizer_id = ?',
      [req.params.linkId, req.organizer.id]
    )
    if (!link) return httpError(reply, 404, 'NOT_FOUND', 'No such link')
    await app.db.run(
      `UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
      [req.params.linkId]
    )
    return reply.code(204).send()
  })
}
