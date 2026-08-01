#!/usr/bin/env node
// Usage: DATABASE_URL=... DB_DRIVER=neon node scripts/seed-organizer.mjs email password "Name"
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { makeDb } from '../server/src/db.js'
import { runMigrations } from '../server/src/migrate.js'
const [email, password, name = 'Organizer'] = process.argv.slice(2)
if (!email || !password) { console.error('usage: seed-organizer.mjs <email> <password> [name]'); process.exit(1) }
const db = await makeDb()
await runMigrations(db)
await db.run('INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?) ON CONFLICT (email) DO NOTHING',
  [randomUUID(), email, bcrypt.hashSync(password, 10), name])
console.log('seeded', email)
await db.close()
