import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
export function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name))
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(f)) continue
    db.exec(readFileSync(join(dir, f), 'utf8'))
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, datetime())').run(f)
  }
}
