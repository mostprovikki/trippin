#!/usr/bin/env node
// scripts/purge-orphan-uploads.js — deletes upload dirs under UPLOADS_DIR that nothing
// references any more.
//
// A top-level dir under UPLOADS_DIR (named after a persons.id — see saveUpload() in
// server/src/routes/documents.routes.js, key = `${personId}/${documentId}`) is an
// orphan only if BOTH hold (double guard against deleting live data):
//   1. no documents.file_path starts with "<dir>/"
//   2. no persons.id equals <dir>
// (1) alone isn't enough: a person can exist with zero *current* documents (all
// deleted one at a time via DELETE /documents/:id, which only unlinks the file, not
// the directory) without being an orphan — they're still a live person who may
// upload again.
//
// Usage:
//   node scripts/purge-orphan-uploads.js            # dry run (default): lists dirs + total size
//   node scripts/purge-orphan-uploads.js --delete    # actually removes them
//
// Env:
//   UPLOADS_DIR   default <repo>/server/data/uploads (matches server/src/config.js's
//                 relative default, resolved from the server/ working directory)
//   DATABASE_URL  default matches server/src/config.js's dev/test default
'use strict'
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const REPO_ROOT = path.join(__dirname, '..')
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(REPO_ROOT, 'server', 'data', 'uploads')
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
const DELETE = process.argv.includes('--delete')

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(p)
    else if (entry.isFile()) total += fs.statSync(p).size
  }
  return total
}

function fmtBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`
}

async function main() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log(`purge-orphan-uploads: UPLOADS_DIR does not exist: ${UPLOADS_DIR}`)
    return
  }
  const pool = new Pool({ connectionString: DATABASE_URL })
  try {
    const topDirs = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)

    const { rows: prefixRows } = await pool.query(
      "SELECT DISTINCT split_part(file_path, '/', 1) AS person_dir FROM documents"
    )
    const referencedByDocs = new Set(prefixRows.map((r) => r.person_dir))

    const { rows: personRows } = await pool.query('SELECT id FROM persons')
    const personIds = new Set(personRows.map((r) => r.id))

    const orphans = topDirs.filter((d) => !referencedByDocs.has(d) && !personIds.has(d))

    let totalSize = 0
    const details = orphans.map((dir) => {
      const size = dirSize(path.join(UPLOADS_DIR, dir))
      totalSize += size
      return { dir, size }
    })

    console.log(`purge-orphan-uploads: ${DELETE ? 'DELETE' : 'DRY RUN'} mode`)
    console.log(`UPLOADS_DIR: ${UPLOADS_DIR}`)
    console.log(`DATABASE_URL: ${DATABASE_URL}`)
    console.log(`total top-level dirs: ${topDirs.length}`)
    console.log(`orphan dirs: ${orphans.length}, total size: ${fmtBytes(totalSize)} (${totalSize} bytes)`)
    for (const { dir, size } of details) console.log(`  ${dir}  ${fmtBytes(size)}`)

    if (DELETE) {
      for (const { dir } of details) fs.rmSync(path.join(UPLOADS_DIR, dir), { recursive: true, force: true })
      console.log(`deleted ${details.length} orphan dirs, freed ${fmtBytes(totalSize)}`)
    } else if (orphans.length) {
      console.log('(dry run — pass --delete to actually remove these)')
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
