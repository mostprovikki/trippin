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
import { makeDb } from '../src/db.js'
import { config } from '../src/config.js'

const APPLY = process.argv.includes('--apply')
const QUIET = process.argv.includes('--quiet')

// Names the gates generate. Anchored with a trailing marker so a real trip
// called e.g. "QA Reviewers Offsite" cannot be swept up by accident: each
// pattern is a full-string match, '*' is the only wildcard used below.
const TRIP_PATTERNS = [
  'UI Walk *',      // e2e/ui-walk.mjs
  'DP QA *',        // e2e/qa-datepicker.mjs
  'QA Review Trip', // e2e/qa-review.mjs
  'Palette QA *',   // e2e/qa-surface-palette.mjs
  'Keynav QA *',    // e2e/qa-picker-keynav.mjs
  'QA Upload Trip *', // e2e/qa-upload-reselect.mjs
  'Dark QA *',      // e2e/qa-dark-mode.mjs
  'SRCHQA *',       // e2e/qa-search.mjs
  'Iso QA *',       // e2e/qa-template-isolation.mjs
  'Walk QA *',      // e2e/qa-app-walk.mjs
  'Light QA *',     // e2e/qa-light-contrast.mjs
  'Aesth QA *',     // e2e/qa-aesthetics.mjs
  'Probe *',        // ad-hoc probes
  'Smoke *'         // e2e/smoke.mjs
]
// Checklist TEMPLATES need their own list: they carry trip_id IS NULL, so unlike
// a trip's own checklists nothing cascades them when a QA trip is deleted, and
// they were quietly accumulating one row per gate run.
const TEMPLATE_PATTERNS = [
  'SRCHQA *',       // e2e/qa-search.mjs
  'QA Template *',
  'DP QA *'
]
const PERSON_PATTERNS = [
  'SRCHQA *',       // e2e/qa-search.mjs
  'QA DP Person *',
  'QA Person *',
  'UI Walk Person *',
  'Probe Person *'
]

const db = await makeDb()
const log = (...a) => { if (!QUIET) console.log(...a) }

// Ported from SQLite's GLOB to Postgres LIKE: '*' -> '%'. None of the
// patterns above use GLOB's '?' single-char wildcard or a literal '%'/'_',
// so this translation is exact and needs no escaping.
const toLike = (p) => p.replace(/\*/g, '%')
function likeClause(column, patterns) {
  return '(' + patterns.map(() => `${column} LIKE ?`).join(' OR ') + ')'
}

// ---------- what would go ----------
const trips = await db.all(
  `SELECT id, name FROM trips WHERE ${likeClause('name', TRIP_PATTERNS)} ORDER BY name`,
  TRIP_PATTERNS.map(toLike)
)

const persons = await db.all(
  `SELECT id, name FROM persons WHERE ${likeClause('name', PERSON_PATTERNS)} ORDER BY name`,
  PERSON_PATTERNS.map(toLike)
)

const templates = await db.all(
  `SELECT id, name FROM checklists WHERE is_template = 1 AND ${likeClause('name', TEMPLATE_PATTERNS)} ORDER BY name`,
  TEMPLATE_PATTERNS.map(toLike)
)

const personIds = new Set(persons.map((p) => p.id))
const docsOfPersons = personIds.size
  ? await db.all(
      `SELECT id, person_id, file_path FROM documents WHERE person_id IN (${[...personIds].map(() => '?').join(',')})`,
      [...personIds]
    )
  : []

// ---------- upload blobs with nothing pointing at them ----------
const uploadsDir = path.resolve(config.uploadsDir)
const livePersonIds = new Set((await db.all('SELECT id FROM persons')).map((r) => r.id))
const liveDocPaths = new Set(
  (await db.all('SELECT file_path FROM documents')).map((r) => path.resolve(r.file_path))
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

// Redact credentials before printing a connection string.
const safeDbUrl = config.databaseUrl.replace(/:\/\/([^:@/]+):[^@/]+@/, '://$1:***@')
log(`${APPLY ? 'PURGING' : 'DRY RUN'} — dev DB ${safeDbUrl}\n`)
log(`QA trips              ${trips.length}`)
for (const t of trips.slice(0, 8)) log(`  - ${t.name}`)
if (trips.length > 8) log(`  … and ${trips.length - 8} more`)
log(`QA persons            ${persons.length}`)
for (const p of persons) log(`  - ${p.name} (${docsOfPersons.filter((d) => d.person_id === p.id).length} documents)`)
log(`Document rows         ${docsOfPersons.length} (cascade from the persons above)`)
log(`QA checklist templates ${templates.length} (trip_id IS NULL, so nothing cascades them)`)
log(`Orphaned upload dirs  ${orphanDirs.length} (${mb(orphanDirs.reduce((n, o) => n + o.bytes, 0))})`)
log(`Orphaned upload files ${orphanFiles.length} (${mb(orphanFiles.reduce((n, o) => n + o.bytes, 0))})`)
log(`Disk reclaimed        ${mb(totalOrphanBytes)}`)

// What must survive, printed so a mistake in the patterns is visible here
// rather than after the fact.
const keptTrips = await db.all(
  `SELECT name FROM trips WHERE NOT ${likeClause('name', TRIP_PATTERNS)} ORDER BY name`,
  TRIP_PATTERNS.map(toLike)
)
const keptPersons = await db.all(
  `SELECT name FROM persons WHERE NOT ${likeClause('name', PERSON_PATTERNS)} ORDER BY name`,
  PERSON_PATTERNS.map(toLike)
)
log(`\nKEEPING ${keptTrips.length} trip(s): ${keptTrips.map((t) => t.name).join(', ') || '(none)'}`)
log(`KEEPING ${keptPersons.length} person(s): ${keptPersons.map((p) => p.name).join(', ') || '(none)'}`)

if (!APPLY) {
  log('\nNothing deleted. Re-run with --apply to execute.')
  await db.close()
  process.exit(0)
}

// ---------- delete ----------
// FK cascades are declared directly in the schema (see `ON DELETE CASCADE`
// in server/src/migrations/001_init.sql), so removing a trip takes its date
// windows, goals, participants, links, budget lines, itinerary and archive
// with it, and removing a person takes its documents. Same delete order as
// the pre-Postgres version; only the plumbing (async, one statement at a
// time instead of better-sqlite3's synchronous prepared statements) changed.
await db.tx(async () => {
  for (const t of trips) await db.run('DELETE FROM trips WHERE id = ?', [t.id])
  // checklist_items cascade from checklists, so the template row is enough.
  for (const c of templates) await db.run('DELETE FROM checklists WHERE id = ?', [c.id])
  for (const p of persons) {
    // trip_participants / participant_links / budget_overrides reference
    // persons WITHOUT a cascade, so clear those rows first or the delete
    // fails the FK check.
    await db.run('DELETE FROM trip_participants WHERE person_id = ?', [p.id])
    await db.run('DELETE FROM participant_links WHERE person_id = ?', [p.id])
    await db.run('DELETE FROM budget_overrides WHERE person_id = ?', [p.id])
    await db.run('UPDATE checklist_items SET assignee_person_id = NULL WHERE assignee_person_id = ?', [p.id])
    await db.run('DELETE FROM persons WHERE id = ?', [p.id])
  }
})

for (const o of orphanDirs) rmSync(o.dir, { recursive: true, force: true })
for (const o of orphanFiles) rmSync(o.file, { force: true })

// The original SQLite version ran `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM`
// here to fold WAL growth back into the single db file. Postgres has no
// per-file WAL to truncate this way (autovacuum handles space reclamation
// automatically), so that step is dropped rather than guessed at.

const after = {
  trips: (await db.get('SELECT count(*) c FROM trips')).c,
  persons: (await db.get('SELECT count(*) c FROM persons')).c,
  documents: (await db.get('SELECT count(*) c FROM documents')).c,
  templates: (await db.get("SELECT count(*) c FROM checklists WHERE is_template = 1")).c
}
log(`\nDone. Now: ${after.trips} trips, ${after.persons} persons, ${after.documents} documents, ${after.templates} templates.`)
await db.close()
