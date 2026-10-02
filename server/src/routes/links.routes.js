import { randomUUID, randomBytes } from 'node:crypto'
import { httpError } from '../lib/errors.js'
import { config } from '../config.js'
import { encryptToken, decryptToken } from '../lib/linkCrypto.js'

export default async function routes(app) {
  app.post('/trips/:tripId/participants/:personId/link', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const { tripId, personId } = req.params
    if (!(await app.ownedTrip(req, tripId))) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const member = await app.db.get('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?', [tripId, personId])
    if (!member) return httpError(reply, 404, 'NOT_FOUND', 'Person is not a participant of this trip')
    // token_enc goes with the link: a dead link's token is not kept recoverable
    await app.db.run(
      `UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), token_enc = NULL
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
      `INSERT INTO participant_links (id,trip_id,person_id,token_hash,token_enc,expires_at)
       VALUES (?,?,?,?,?, CASE WHEN ?::double precision IS NULL THEN NULL ELSE
         to_char((now() AT TIME ZONE 'UTC') + (?::double precision * INTERVAL '1 day'), 'YYYY-MM-DD HH24:MI:SS') END)`,
      [randomUUID(), tripId, personId, app.hashToken(token), encryptToken(token, config.jwtSecret), days, days])
    return reply.code(201).header('cache-control', 'no-store').send({ token, url: `/p/${token}` })
  })

  // The active link's url again, for Copy ⟨Name⟩'s link (one click, no revoke).
  // 200 {url:null} when there is none to re-read — never minted, revoked, expired,
  // or minted before token_enc existed — and the client mints a new one. Not a 404:
  // a new participant has no link, and that's normal, not an error to log.
  app.get('/trips/:tripId/participants/:personId/link', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const { tripId, personId } = req.params
    if (!(await app.ownedTrip(req, tripId))) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const row = await app.db.get(
      `SELECT token_enc FROM participant_links
       WHERE trip_id = ? AND person_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
       ORDER BY created_at DESC LIMIT 1`,
      [tripId, personId]
    )
    // the url is a live credential: never cached
    reply.header('cache-control', 'no-store')
    const noLink = { url: null, reason: 'NO_RECOVERABLE_LINK' }
    if (!row?.token_enc) return noLink
    let token
    // JWT_SECRET rotated since this link was minted
    try { token = decryptToken(row.token_enc, config.jwtSecret) } catch { return noLink }
    return { url: `/p/${token}` }
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
      `UPDATE participant_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), token_enc = NULL WHERE id = ?`,
      [req.params.linkId]
    )
    return reply.code(204).send()
  })
}
