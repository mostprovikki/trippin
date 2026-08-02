import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

// Arbitrary but fixed key for pg_advisory_xact_lock — every booting instance of this
// app must pick the same number for the lock to mean anything. Nothing else in the
// cluster may reuse it.
const MIGRATION_LOCK_ID = 4172026

export async function runMigrations(db) {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.tx(async () => {
      // AppSail boots more than one instance at a time. `CREATE TABLE IF NOT EXISTS`
      // protects only the ledger, so without this both instances would read the ledger,
      // both see 001_init.sql unapplied, and the loser would die on
      // `relation "organizers" already exists`. The advisory lock is held until this
      // transaction ends, and BOTH the ledger create and the ledger read happen *under*
      // it — so the loser wakes up after the winner has committed, sees the row, and skips.
      await db.run('SELECT pg_advisory_xact_lock(?)', [MIGRATION_LOCK_ID])
      await db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
      if (await db.get('SELECT name FROM _migrations WHERE name = ?', [f])) return
      await db.exec(readFileSync(join(dir, f), 'utf8'))
      await db.run("INSERT INTO _migrations (name, applied_at) VALUES (?, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))", [f])
    })
  }
}
