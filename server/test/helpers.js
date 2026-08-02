import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { afterAll } from 'vitest'
import { makeDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
let n = 0

// One admin connection per test file, not one per makeTestApp() call. Each makeDb() is
// a real pg Pool; a file with a dozen makeTestApp() calls was opening (and never closing)
// two dozen of them against a cluster whose max_connections is 100.
let adminDb = null
const admin = async () => (adminDb ||= await makeDb({ url: TEST_URL, driver: 'pg' }))

// Every schema and pool this file hands out, so they can be torn down at file end.
// vitest hooks registered at module scope attach to the importing test file's suite,
// and `isolate: true` (the default) gives each file its own module instance.
const created = []

afterAll(async () => {
  for (const { db, schema } of created.splice(0)) {
    await db.close().catch(() => {})
    await (await admin()).exec(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
  }
  if (adminDb) { await adminDb.close().catch(() => {}); adminDb = null }
})

export async function makeTestApp({ storage } = {}) {
  // macOS recycles PIDs, so `tp_<pid>_<n>` collides with a leftover schema from an
  // earlier run often enough to matter — and a bare CREATE SCHEMA turns that into a
  // red test file with an error that reads like a migration bug.
  const schema = `tp_${process.pid}_${++n}`
  await (await admin()).exec(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await (await admin()).exec(`CREATE SCHEMA ${schema}`)
  const db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: schema })
  created.push({ db, schema })
  const app = await buildApp({ db, storage }) // migrations land in the schema via search_path
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
