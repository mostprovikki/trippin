import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

export async function makeTestApp() {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'tp-')), 'test.db'))
  const app = await buildApp({ db })
  return { app, db }
}
export function createOrganizer(db, { email = 'test@x.dev', password = 'pass1234', name = 'Tester' } = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?)')
    .run(id, email, bcrypt.hashSync(password, 8), name)
  return { id, email, name }
}
export function loginOrganizer(app, db) {
  const org = createOrganizer(db)
  return { cookie: `tp_session=${app.signSession(org)}`, organizer: org }
}
export function authedInject(app, cookie, opts) {
  return app.inject({ ...opts, headers: { cookie, ...(opts.headers || {}) } })
}
export function createPerson(db, fields = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO persons (id,name) VALUES (?,?)').run(id, fields.name || 'P ' + id.slice(0, 4))
  if (Object.keys(fields).length) {
    for (const [k, v] of Object.entries(fields)) if (k !== 'name')
      db.prepare(`UPDATE persons SET ${k} = ? WHERE id = ?`).run(v, id)
  }
  return db.prepare('SELECT * FROM persons WHERE id = ?').get(id)
}
export function createTrip(db, fields = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO trips (id,name) VALUES (?,?)').run(id, fields.name || 'Trip ' + id.slice(0, 4))
  for (const [k, v] of Object.entries(fields)) if (k !== 'name')
    db.prepare(`UPDATE trips SET ${k} = ? WHERE id = ?`).run(v, id)
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
}
