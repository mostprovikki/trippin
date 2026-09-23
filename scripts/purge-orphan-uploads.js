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
// Two additional guards protect against a misconfigured/wrong-target run:
//   - the resolved UPLOADS_DIR must not be '/', the user's home dir, or anything with
//     fewer than 3 path segments — those shapes mean UPLOADS_DIR is almost certainly
//     unset/misresolved, and this script does recursive deletes.
//   - if `persons` has 0 rows, EVERY dir looks orphaned (an empty or wrong DB), which
//     is refused unless --allow-empty-db is explicitly passed.
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

const REPO_ROOT = path.join(__dirname, '..')
const DEFAULT_UPLOADS_DIR = path.join(REPO_ROOT, 'server', 'data', 'uploads')
const DEFAULT_DATABASE_URL = 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'

function countSegments(p) {
  return p.split(path.sep).filter(Boolean).length
}

// Refuses '/', the user's home directory, and anything with fewer than 3 path
// segments (e.g. '/Users/me' has 2) — shapes that mean UPLOADS_DIR is almost
// certainly unset or misresolved, given this script does recursive deletes.
function isUnsafeUploadsDir(resolvedDir, homeDir) {
  if (resolvedDir === path.sep) return true
  if (homeDir && resolvedDir === path.resolve(homeDir)) return true
  if (countSegments(resolvedDir) < 3) return true
  return false
}

// An empty `persons` table means every top-level dir has no matching person id and no
// matching document prefix, so 100% of dirs would classify as orphans — almost always
// an empty or wrong-target DB, not a genuinely empty app.
function shouldRefuseEmptyDb(personCount, allowEmptyDb) {
  return personCount === 0 && !allowEmptyDb
}

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
  const UPLOADS_DIR = process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR
  const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DATABASE_URL
  const DELETE = process.argv.includes('--delete')
  const ALLOW_EMPTY_DB = process.argv.includes('--allow-empty-db')

  const resolvedUploadsDir = path.resolve(UPLOADS_DIR)
  if (isUnsafeUploadsDir(resolvedUploadsDir, process.env.HOME)) {
    console.error(`purge-orphan-uploads: refusing to run against ${resolvedUploadsDir} — ` +
      `it's '/', your home directory, or has fewer than 3 path segments. Set UPLOADS_DIR ` +
      `to the real uploads directory.`)
    process.exitCode = 1
    return
  }

  if (!fs.existsSync(resolvedUploadsDir)) {
    console.log(`purge-orphan-uploads: UPLOADS_DIR does not exist: ${resolvedUploadsDir}`)
    return
  }

  const { Pool } = require('pg')
  const pool = new Pool({ connectionString: DATABASE_URL })
  try {
    const { rows: personRows } = await pool.query('SELECT id FROM persons')
    if (shouldRefuseEmptyDb(personRows.length, ALLOW_EMPTY_DB)) {
      console.error(`purge-orphan-uploads: refusing — persons table is empty at ${DATABASE_URL}. ` +
        `Every upload dir would classify as orphaned, which usually means an empty or ` +
        `wrong-target DB. Pass --allow-empty-db to proceed anyway.`)
      process.exitCode = 1
      return
    }
    const personIds = new Set(personRows.map((r) => r.id))

    const topDirs = fs.readdirSync(resolvedUploadsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)

    const { rows: prefixRows } = await pool.query(
      "SELECT DISTINCT split_part(file_path, '/', 1) AS person_dir FROM documents"
    )
    const referencedByDocs = new Set(prefixRows.map((r) => r.person_dir))

    const orphans = topDirs.filter((d) => !referencedByDocs.has(d) && !personIds.has(d))

    let totalSize = 0
    const details = orphans.map((dir) => {
      const size = dirSize(path.join(resolvedUploadsDir, dir))
      totalSize += size
      return { dir, size }
    })

    console.log(`purge-orphan-uploads: ${DELETE ? 'DELETE' : 'DRY RUN'} mode`)
    console.log(`UPLOADS_DIR: ${resolvedUploadsDir}`)
    console.log(`DATABASE_URL: ${DATABASE_URL}`)
    console.log(`total top-level dirs: ${topDirs.length}`)
    console.log(`orphan dirs: ${orphans.length}, total size: ${fmtBytes(totalSize)} (${totalSize} bytes)`)
    for (const { dir, size } of details) console.log(`  ${dir}  ${fmtBytes(size)}`)

    if (DELETE) {
      for (const { dir } of details) fs.rmSync(path.join(resolvedUploadsDir, dir), { recursive: true, force: true })
      console.log(`deleted ${details.length} orphan dirs, freed ${fmtBytes(totalSize)}`)
    } else if (orphans.length) {
      console.log('(dry run — pass --delete to actually remove these)')
    }
  } finally {
    await pool.end()
  }
}

module.exports = { isUnsafeUploadsDir, shouldRefuseEmptyDb, countSegments, fmtBytes }

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
