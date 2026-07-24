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
// Single shared organizer that owns fixture trips/persons, so scoping stays
// coherent no matter whether tests create data before or after logging in.
export function defaultOrganizer(db) {
  const row = db.prepare("SELECT id, email, name FROM organizers WHERE email = 'test@x.dev'").get()
  return row || createOrganizer(db)
}
export function loginOrganizer(app, db) {
  const org = defaultOrganizer(db)
  return { cookie: `tp_session=${app.signSession(org)}`, organizer: org }
}
export function authedInject(app, cookie, opts) {
  return app.inject({ ...opts, headers: { cookie, ...(opts.headers || {}) } })
}
export function createPerson(db, fields = {}) {
  const id = randomUUID()
  const organizerId = fields.organizer_id ?? defaultOrganizer(db).id
  db.prepare('INSERT INTO persons (id,organizer_id,name) VALUES (?,?,?)').run(id, organizerId, fields.name || 'P ' + id.slice(0, 4))
  if (Object.keys(fields).length) {
    for (const [k, v] of Object.entries(fields)) if (k !== 'name' && k !== 'organizer_id')
      db.prepare(`UPDATE persons SET ${k} = ? WHERE id = ?`).run(v, id)
  }
  return db.prepare('SELECT * FROM persons WHERE id = ?').get(id)
}
export function createTrip(db, fields = {}) {
  const id = randomUUID()
  const organizerId = fields.organizer_id ?? defaultOrganizer(db).id
  db.prepare('INSERT INTO trips (id,organizer_id,name) VALUES (?,?,?)').run(id, organizerId, fields.name || 'Trip ' + id.slice(0, 4))
  for (const [k, v] of Object.entries(fields)) if (k !== 'name' && k !== 'organizer_id')
    db.prepare(`UPDATE trips SET ${k} = ? WHERE id = ?`).run(v, id)
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
}
