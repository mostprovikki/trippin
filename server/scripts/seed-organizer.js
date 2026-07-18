import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getDb } from '../src/db.js'
import { runMigrations } from '../src/migrate.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')).map(([k, v]) => [k.replace(/^--/, ''), v]))
if (!args.email || !args.password || !args.name) {
  console.error('Usage: node scripts/seed-organizer.js --email=a@b.c --name=Name --password=secret')
  process.exit(1)
}
const db = getDb(); runMigrations(db)
db.prepare('INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, name=excluded.name')
  .run(randomUUID(), args.email, bcrypt.hashSync(args.password, 10), args.name)
console.log('Organizer ready:', args.email)
