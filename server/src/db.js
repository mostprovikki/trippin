import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config.js'

let db
export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true })
  const d = new Database(path)
  d.pragma('journal_mode = WAL')
  d.pragma('foreign_keys = ON')
  return d
}
export function getDb() {
  if (!db) db = openDb(config.dbPath)
  return db
}
