import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeDb } from '../src/db.js'
import { runMigrations } from '../src/migrate.js'
import { TEST_URL } from './test-db-url.js'

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
      // A resolved undefined (table exists, just empty) is success, same as before;
      // only a rejection (table missing) should fail this — and now with the real
      // Postgres error surfaced instead of collapsed to a bare `false`.
      await db.get('SELECT 1 AS ok FROM ' + t + ' LIMIT 1')
        .catch((e) => { throw new Error(`${t}: ${e.message}`, { cause: e }) })
    expect((await db.all('SELECT name FROM _migrations'))).toHaveLength(1)
  })

  it('folds the organizer_id columns from 002/003 onto persons, trips, and checklists', async () => {
    for (const t of ['persons', 'trips', 'checklists'])
      await db.get(`SELECT organizer_id FROM ${t} LIMIT 1`)
        .catch((e) => { throw new Error(`${t}: ${e.message}`, { cause: e }) })
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

  // Two AppSail instances boot at once against the same fresh database. Without
  // pg_advisory_xact_lock both read an empty ledger, both run 001_init.sql, and the
  // loser dies on `relation "organizers" already exists`.
  it('two concurrent boots apply the migration exactly once (advisory lock)', async () => {
    const raceSchema = `migrace_${process.pid}`
    const admin = await makeDb({ url: TEST_URL, driver: 'pg' })
    await admin.exec(`DROP SCHEMA IF EXISTS ${raceSchema} CASCADE`)
    await admin.exec(`CREATE SCHEMA ${raceSchema}`)
    // Separate pools = separate backends, so these really do overlap.
    const a = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: raceSchema })
    const b = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: raceSchema })
    try {
      const results = await Promise.allSettled([runMigrations(a), runMigrations(b)])
      expect(results.filter((r) => r.status === 'rejected').map((r) => String(r.reason))).toEqual([])
      expect(await a.all('SELECT name FROM _migrations')).toHaveLength(1)
      expect((await a.get('SELECT COUNT(*)::int AS c FROM organizers')).c).toBe(0)
    } finally {
      await a.close(); await b.close()
      await admin.exec(`DROP SCHEMA IF EXISTS ${raceSchema} CASCADE`)
      await admin.close()
    }
  })
})
