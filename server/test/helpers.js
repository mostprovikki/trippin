import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { makeDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
let n = 0

export async function makeTestApp() {
  const schema = `tp_${process.pid}_${++n}`
  const admin = await makeDb({ url: TEST_URL, driver: 'pg' })
  await admin.exec(`CREATE SCHEMA ${schema}`)
  await admin.close()
  const db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: schema })
  const app = await buildApp({ db }) // migrations land in the schema via search_path
  return { app, db }
}
export async function createOrganizer(db, { email = 'test@x.dev', password = 'pass1234', name = 'Tester' } = {}) {
  const id = randomUUID()
  await db.run('INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?)',
    [id, email, bcrypt.hashSync(password, 8), name])
  return { id, email, name }
}
export async function defaultOrganizer(db) {
  const row = await db.get("SELECT id, email, name FROM organizers WHERE email = 'test@x.dev'")
  return row || createOrganizer(db)
}
export async function loginOrganizer(app, db) {
  const org = await defaultOrganizer(db)
  return { cookie: `tp_session=${app.signSession(org)}`, organizer: org }
}
export function authedInject(app, cookie, opts) {
  return app.inject({ ...opts, headers: { cookie, ...(opts.headers || {}) } })
}
export async function createPerson(db, fields = {}) {
  const id = randomUUID()
  const organizerId = fields.organizer_id ?? (await defaultOrganizer(db)).id
  await db.run('INSERT INTO persons (id,organizer_id,name) VALUES (?,?,?)', [id, organizerId, fields.name || 'P ' + id.slice(0, 4)])
  for (const [k, v] of Object.entries(fields)) if (k !== 'name' && k !== 'organizer_id')
    await db.run(`UPDATE persons SET ${k} = ? WHERE id = ?`, [v, id])
  return db.get('SELECT * FROM persons WHERE id = ?', [id])
}
export async function createTrip(db, fields = {}) {
  const id = randomUUID()
  const organizerId = fields.organizer_id ?? (await defaultOrganizer(db)).id
  await db.run('INSERT INTO trips (id,organizer_id,name) VALUES (?,?,?)', [id, organizerId, fields.name || 'Trip ' + id.slice(0, 4)])
  for (const [k, v] of Object.entries(fields)) if (k !== 'name' && k !== 'organizer_id')
    await db.run(`UPDATE trips SET ${k} = ? WHERE id = ?`, [v, id])
  return db.get('SELECT * FROM trips WHERE id = ?', [id])
}
