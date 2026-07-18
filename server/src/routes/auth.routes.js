import bcrypt from 'bcryptjs'
import { httpError } from '../lib/errors.js'

export default async function routes(app) {
  const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 }
  app.post('/auth/login', {
    schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } }
  }, async (req, reply) => {
    const org = app.db.prepare('SELECT * FROM organizers WHERE email = ?').get(req.body.email)
    if (!org || !bcrypt.compareSync(req.body.password, org.password_hash))
      return httpError(reply, 401, 'INVALID_CREDENTIALS', 'Wrong email or password')
    reply.setCookie('tp_session', app.signSession(org), cookieOpts)
    return { organizer: { id: org.id, email: org.email, name: org.name } }
  })
  app.post('/auth/logout', async (req, reply) => {
    reply.clearCookie('tp_session', { path: '/' }); return reply.code(204).send()
  })
  app.get('/auth/me', { preHandler: app.requireOrganizer }, async (req) => ({ organizer: req.organizer }))
}
