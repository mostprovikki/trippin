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

  it('applies, is idempotent, and creates the core tables', async () => {
    await runMigrations(db)
    await runMigrations(db) // second run: no-op, no throw
    for (const t of ['organizers', 'persons', 'documents', 'trips', 'trip_date_windows', 'participant_links'])
      expect(await db.get('SELECT 1 AS ok FROM ' + t + ' LIMIT 1').then(() => true, () => false), t).toBe(true)
    expect((await db.all('SELECT name FROM _migrations'))).toHaveLength(1)
  })
})
