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
    const row = app.db.prepare(
      `SELECT id, trip_id, person_id, expires_at, revoked_at FROM participant_links WHERE token_hash = ?`
    ).get(app.hashToken(raw))
    if (!row || row.revoked_at || (row.expires_at && row.expires_at < new Date().toISOString()))
      return httpError(reply, 401, 'INVALID_TOKEN', 'Invalid, revoked or expired link')
    req.participant = { linkId: row.id, tripId: row.trip_id, personId: row.person_id }
  })
})
