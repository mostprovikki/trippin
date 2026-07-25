// Removes the artefacts that browser gates leave behind in the DEV database.
//
// Why this exists: every run of e2e/ui-walk.mjs, qa-datepicker.mjs and friends
// creates a throwaway trip (and sometimes a throwaway person, then uploads
// documents to it) and never cleans up. Left alone it compounds — the dev DB
// reached 19 junk trips, 37 junk document rows and 210MB of upload blobs, and a
// person-scoped Select degenerated to a single option, which is thin enough to
// hide real bugs during QA.
//
// Dry run by DEFAULT. Nothing is deleted without --apply.
//
// Run from server/:
//   node scripts/purge-qa-data.js              # report only
//   node scripts/purge-qa-data.js --apply      # actually delete
//
// Gates should call this themselves; see e2e/README or the gate scripts.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/db.js'
import { config } from '../src/config.js'

const APPLY = process.argv.includes('--apply')
const QUIET = process.argv.includes('--quiet')

// Names the gates generate. Anchored with a trailing marker so a real trip
// called e.g. "QA Reviewers Offsite" cannot be swept up by accident: each
// pattern is a full-string GLOB, not a substring match.
const TRIP_PATTERNS = [
  'UI Walk *',      // e2e/ui-walk.mjs
  'DP QA *',        // e2e/qa-datepicker.mjs
  'QA Review Trip', // e2e/qa-review.mjs
  'Palette QA *',   // e2e/qa-surface-palette.mjs
  'Keynav QA *',    // e2e/qa-picker-keynav.mjs
  'QA Upload Trip *', // e2e/qa-upload-reselect.mjs
  'Probe *',        // ad-hoc probes
  'Smoke *'         // e2e/smoke.mjs
]
const PERSON_PATTERNS = [
  'QA DP Person *',
  'QA Person *',
  'UI Walk Person *',
  'Probe Person *'
]

const db = getDb()
const log = (...a) => { if (!QUIET) console.log(...a) }

function globClause(column, patterns) {
  return '(' + patterns.map(() => `${column} GLOB ?`).join(' OR ') + ')'
}

// ---------- what would go ----------
const trips = db.prepare(
  `SELECT id, name FROM trips WHERE ${globClause('name', TRIP_PATTERNS)} ORDER BY name`
).all(...TRIP_PATTERNS)

const persons = db.prepare(
  `SELECT id, name FROM persons WHERE ${globClause('name', PERSON_PATTERNS)} ORDER BY name`
).all(...PERSON_PATTERNS)

const personIds = new Set(persons.map((p) => p.id))
const docsOfPersons = personIds.size
  ? db.prepare(
      `SELECT id, person_id, file_path FROM documents WHERE person_id IN (${[...personIds].map(() => '?').join(',')})`
    ).all(...personIds)
  : []

// ---------- upload blobs with nothing pointing at them ----------
const uploadsDir = path.resolve(config.uploadsDir)
const livePersonIds = new Set(db.prepare('SELECT id FROM persons').all().map((r) => r.id))
const liveDocPaths = new Set(
  db.prepare('SELECT file_path FROM documents').all().map((r) => path.resolve(r.file_path))
)

function dirSize(dir) {
  let total = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else total += statSync(p).size
    }
  }
  try { walk(dir) } catch { /* vanished mid-scan */ }
  return total
}

const orphanDirs = []
const orphanFiles = []
if (existsSync(uploadsDir)) {
  for (const entry of readdirSync(uploadsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(uploadsDir, entry.name)
    // A directory is named after a person id. No such person -> the whole tree
    // is unreachable, including for persons this run is about to delete.
    if (!livePersonIds.has(entry.name) || personIds.has(entry.name)) {
      orphanDirs.push({ dir, bytes: dirSize(dir) })
      continue
    }
    // Person still exists: drop only files no document row references.
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue
      const p = path.join(dir, f.name)
      if (!liveDocPaths.has(p)) orphanFiles.push({ file: p, bytes: statSync(p).size })
    }
  }
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)}MB`
const totalOrphanBytes =
  orphanDirs.reduce((n, o) => n + o.bytes, 0) + orphanFiles.reduce((n, o) => n + o.bytes, 0)

log(`${APPLY ? 'PURGING' : 'DRY RUN'} — dev DB ${config.dbPath}\n`)
log(`QA trips              ${trips.length}`)
for (const t of trips.slice(0, 8)) log(`  - ${t.name}`)
if (trips.length > 8) log(`  … and ${trips.length - 8} more`)
log(`QA persons            ${persons.length}`)
for (const p of persons) log(`  - ${p.name} (${docsOfPersons.filter((d) => d.person_id === p.id).length} documents)`)
log(`Document rows         ${docsOfPersons.length} (cascade from the persons above)`)
log(`Orphaned upload dirs  ${orphanDirs.length} (${mb(orphanDirs.reduce((n, o) => n + o.bytes, 0))})`)
log(`Orphaned upload files ${orphanFiles.length} (${mb(orphanFiles.reduce((n, o) => n + o.bytes, 0))})`)
log(`Disk reclaimed        ${mb(totalOrphanBytes)}`)

// What must survive, printed so a mistake in the patterns is visible here
// rather than after the fact.
const keptTrips = db.prepare(
  `SELECT name FROM trips WHERE NOT ${globClause('name', TRIP_PATTERNS)} ORDER BY name`
).all(...TRIP_PATTERNS)
const keptPersons = db.prepare(
  `SELECT name FROM persons WHERE NOT ${globClause('name', PERSON_PATTERNS)} ORDER BY name`
).all(...PERSON_PATTERNS)
log(`\nKEEPING ${keptTrips.length} trip(s): ${keptTrips.map((t) => t.name).join(', ') || '(none)'}`)
log(`KEEPING ${keptPersons.length} person(s): ${keptPersons.map((p) => p.name).join(', ') || '(none)'}`)

if (!APPLY) {
  log('\nNothing deleted. Re-run with --apply to execute.')
  process.exit(0)
}

// ---------- delete ----------
// FK cascades are on (see src/db.js openDb), so removing a trip takes its date
// windows, goals, participants, links, budget lines, itinerary and archive with
// it, and removing a person takes its documents.
const purge = db.transaction(() => {
  const delTrip = db.prepare('DELETE FROM trips WHERE id = ?')
  const delPerson = db.prepare('DELETE FROM persons WHERE id = ?')
  // trip_participants / participant_links reference persons WITHOUT a cascade,
  // so clear those rows first or the delete fails the FK check.
  const delParticipation = db.prepare('DELETE FROM trip_participants WHERE person_id = ?')
  const delLinks = db.prepare('DELETE FROM participant_links WHERE person_id = ?')
  const delOverrides = db.prepare('DELETE FROM budget_overrides WHERE person_id = ?')
  const clearAssignees = db.prepare(
    'UPDATE checklist_items SET assignee_person_id = NULL WHERE assignee_person_id = ?'
  )
  for (const t of trips) delTrip.run(t.id)
  for (const p of persons) {
    delParticipation.run(p.id)
    delLinks.run(p.id)
    delOverrides.run(p.id)
    clearAssignees.run(p.id)
    delPerson.run(p.id)
  }
})
purge()

for (const o of orphanDirs) rmSync(o.dir, { recursive: true, force: true })
for (const o of orphanFiles) rmSync(o.file, { force: true })

// WAL grows across gate runs; fold it back and compact the file.
db.pragma('wal_checkpoint(TRUNCATE)')
db.exec('VACUUM')

const after = {
  trips: db.prepare('SELECT count(*) c FROM trips').get().c,
  persons: db.prepare('SELECT count(*) c FROM persons').get().c,
  documents: db.prepare('SELECT count(*) c FROM documents').get().c
}
log(`\nDone. Now: ${after.trips} trips, ${after.persons} persons, ${after.documents} documents.`)
