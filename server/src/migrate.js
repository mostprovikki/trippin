import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
export async function runMigrations(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set((await db.all('SELECT name FROM _migrations')).map(r => r.name))
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(f)) continue
    await db.tx(async () => {
      await db.exec(readFileSync(join(dir, f), 'utf8'))
      await db.run("INSERT INTO _migrations (name, applied_at) VALUES (?, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))", [f])
    })
  }
}
