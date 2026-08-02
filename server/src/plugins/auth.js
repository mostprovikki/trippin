import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import jwt from 'jsonwebtoken'
import { createHash } from 'node:crypto'
import { config } from '../config.js'
import { httpError } from '../lib/errors.js'

export default fp(async function authPlugin(app) {
  await app.register(cookie)
  app.decorate('signSession', (organizer) =>
    jwt.sign({ sub: organizer.id, email: organizer.email, name: organizer.name }, config.jwtSecret, { expiresIn: '30d' }))
  app.decorate('hashToken', (raw) => createHash('sha256').update(raw).digest('hex'))
  app.decorate('requireOrganizer', async (req, reply) => {
    const raw = req.cookies?.tp_session
    if (!raw) return httpError(reply, 401, 'UNAUTHORIZED', 'Login required')
    try {
      const p = jwt.verify(raw, config.jwtSecret)
      req.organizer = { id: p.sub, email: p.email, name: p.name }
    } catch { return httpError(reply, 401, 'UNAUTHORIZED', 'Invalid or expired session') }
  })
  app.decorate('requireParticipant', async (req, reply) => {
    const h = req.headers.authorization || ''
    const raw = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!raw) return httpError(reply, 401, 'INVALID_TOKEN', 'Missing token')
    // Expiry is decided in SQL, by the same expression readiness.routes.js uses, against
    // the same clock. Comparing a TEXT timestamp to a JS `new Date().toISOString()` here
    // is what let the two consumers read one column in two different formats.
    const row = await app.db.get(
      `SELECT id, trip_id, person_id, revoked_at,
              (expires_at IS NOT NULL AND expires_at <= to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) AS expired
       FROM participant_links WHERE token_hash = ?`,
      [app.hashToken(raw)])
    if (!row || row.revoked_at || row.expired)
      return httpError(reply, 401, 'INVALID_TOKEN', 'Invalid, revoked or expired link')
    req.participant = { linkId: row.id, tripId: row.trip_id, personId: row.person_id }
  })
})
