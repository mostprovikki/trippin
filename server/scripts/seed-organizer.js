import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { makeDb } from '../src/db.js'
import { runMigrations } from '../src/migrate.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')).map(([k, v]) => [k.replace(/^--/, ''), v]))
if (!args.email || !args.password || !args.name) {
  console.error('Usage: node scripts/seed-organizer.js --email=a@b.c --name=Name --password=secret')
  process.exit(1)
}
const db = await makeDb()
await runMigrations(db)
// Unlike root scripts/seed-organizer.mjs (ON CONFLICT DO NOTHING), this one
// updates password/name on a re-run with the same --email -- kept as-is,
// this is the one that supports resetting a password (see README).
await db.run(
  'INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, name=excluded.name',
  [randomUUID(), args.email, bcrypt.hashSync(args.password, 10), args.name]
)
console.log('Organizer ready:', args.email)
await db.close()
