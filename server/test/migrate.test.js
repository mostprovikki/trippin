import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeDb } from '../src/db.js'
import { runMigrations } from '../src/migrate.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
const schema = `mig_${process.pid}`

describe('runMigrations', () => {
  let db
  beforeAll(async () => {
    db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: schema })
    await db.exec(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  })
  afterAll(async () => { await db.exec(`DROP SCHEMA ${schema} CASCADE`); await db.close() })

  const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

  it('applies, is idempotent, and creates the core tables', async () => {
    await runMigrations(db)
    await runMigrations(db) // second run: no-op, no throw
    for (const t of ['organizers', 'persons', 'documents', 'trips', 'trip_date_windows', 'participant_links'])
      expect(await db.get('SELECT 1 AS ok FROM ' + t + ' LIMIT 1').then(() => true, () => false), t).toBe(true)
    expect((await db.all('SELECT name FROM _migrations'))).toHaveLength(1)
  })

  it('folds the organizer_id columns from 002/003 onto persons, trips, and checklists', async () => {
    for (const t of ['persons', 'trips', 'checklists'])
      expect(await db.get(`SELECT organizer_id FROM ${t} LIMIT 1`).then(() => true, () => false), t).toBe(true)
  })

  it('produces a real UTC timestamp string from the translated DEFAULT on insert', async () => {
    await db.run('INSERT INTO organizers (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
      ['org-test-1', 'org-test-1@example.com', 'hash', 'Test Organizer'])
    const row = await db.get('SELECT created_at FROM organizers WHERE id = ?', ['org-test-1'])
    expect(row.created_at).toMatch(TS_RE)
  })

  it('records _migrations.applied_at in the same timestamp format', async () => {
    const row = await db.get('SELECT applied_at FROM _migrations LIMIT 1')
    expect(row.applied_at).toMatch(TS_RE)
  })
})
