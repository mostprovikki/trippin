# Trip Planner Implementation Plan — Part 1 of 3 (Overview + Foundation + Wave 1)

> **STATUS (audited 2026-07-28): Tasks 1–6 all implemented.** Server routes under `server/src/routes/` and `web/src/views/` map 1:1 onto the task split. Baseline at audit: web 270/270, server 114/114 tests green.
> **The checkboxes below are stale — unchecked ≠ undone.** They were never ticked during implementation. Do not read them as a progress signal; treat this doc as historical task spec, not a live tracker.

> **This plan spans three files** (same directory):
> - **Part 1 (this file):** overview, global constraints, parallel execution guide, Tasks 1–6
> - **Part 2** `2026-07-18-trip-planner-part2-domain-apis.md`: Tasks 7–12 (Wave-2 server APIs)
> - **Part 3** `2026-07-18-trip-planner-part3-ui-and-ship.md`: Tasks 13–22 (UI, dashboard, archive, deploy, e2e) + spec coverage map
>
> The orchestrator reads all three; each subagent gets Part 1's "Global Constraints" + "Parallel Execution Guide" sections plus its own task text only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is **designed for parallel execution by multiple subagents** — see "Parallel Execution Guide" below.

**Goal:** Build a self-hosted trip planner web app (private group ≤20 people) per `docs/brief.md` — reusable people directory, doc vault, trips with flexible dates, AI-assisted destinations/budgets/itineraries/packing via a provider-agnostic LLM adapter, participant tokenized links, readiness dashboard, archive+clone.

**Architecture:** npm-workspaces monorepo: `server/` (Fastify 5 + better-sqlite3, route modules auto-loaded from `server/src/routes/`) and `web/` (Vue 3 + Vite + Pinia + vue-router SPA). All cross-cutting primitives (schema, DB handle, auth decorators, error format, test harness) land in Task 1 so every later task only **adds** files — parallel agents never edit shared files.

**Tech Stack:** Node ≥20, Fastify 5, better-sqlite3, bcryptjs, jsonwebtoken, Ajv, Vue 3 (Composition API), Pinia, vue-router 4, Vite, Vitest.

**Spec:** `docs/brief.md` (the approved product brief — copied into the new repo by Task 1). Every requirement traces to a task; see Coverage Map at the end.

## Global Constraints

- **New standalone repo.** Execute in a fresh directory (suggested `trip-planner/`), NOT inside any existing project. Task 1 runs `git init`.
- Node >= 20. npm workspaces (`server`, `web`).
- **Frozen files** (created once, never edited afterwards — a task needing changes to a frozen file is a plan bug; stop and report):
  - After T1: root+workspace `package.json`/`package-lock.json`, `server/src/app.js`, `server/src/plugins/auth.js`, `server/src/db.js`, `server/src/config.js`, `server/src/lib/errors.js`, `server/src/migrations/001_init.sql` (the ONLY migration).
  - After T6: `web/src/router.js`, `web/src/api/client.js`, `web/src/App.vue`.
- **No new npm dependencies after T1.**
- All IDs: `crypto.randomUUID()`. All dates: ISO `YYYY-MM-DD` strings. Money: SQLite REAL, single currency (`DEFAULT_CURRENCY` env, default `INR`), no FX.
- API: JSON under `/api`; error body always `{"error":{"code":"SOME_CODE","message":"..."}}` with proper HTTP status.
- Organizer auth: JWT (HS256, `JWT_SECRET` env) in httpOnly cookie `tp_session`. Participant auth: `Authorization: Bearer <token>` on `/api/participant/*`, token stored as SHA-256 hex hash.
- **Privacy (brief §7):** LLM prompts must NEVER contain names, phone numbers, emails, document numbers/files, or medical notes — only trip parameters and aggregated preferences (e.g. "3 of 6 vegetarian"). Every AI task has a test asserting this.
- **Graceful AI degradation (brief §7):** `LLM_PROVIDER=none` → AI endpoints return 503 `{"error":{"code":"AI_DISABLED",...}}`; UI disables AI buttons via `GET /api/ai/status`. All features fully usable manually.
- Uploaded files live under `UPLOADS_DIR` (default `./data/uploads`), served ONLY through authorized endpoints, never a static dir. Max upload 10 MB.
- TDD: every server task writes failing tests first (Vitest + `app.inject()`), then implements. Commit at the end of every task step marked "Commit".
- Never edit files outside your task's **Files** list.

---

## Parallel Execution Guide (for the orchestrator)

### Dependency graph & waves

Run each wave's tasks **concurrently** (one subagent per task); a wave starts only when all its dependencies are merged and `npm test` passes on the integration branch.

| Wave | Tasks (parallel) | Depends on |
|---|---|---|
| 0 | T1 Foundation | — |
| 1 | T2 Auth API · T3 LLM adapter · T4 People API · T5 Trips API · T6 Web shell | T1 |
| 2 | T7 Documents API · T8 Participant links API · T9 Budget API · T10 Itinerary API · T11 Checklists API · T12 Destination API | T7←T4 · T8←T4,T5 · T9←T3,T5 · T10←T3,T5 · T11←T3,T4,T5 · T12←T3,T5 (T2 needed by all for login-in-tests) |
| 3 | T13 People+Docs UI · T14 Trip UI · T15 Budget UI · T16 Itinerary UI · T17 Checklists UI · T18 Participant pages | T13←T6,T4,T7 · T14←T6,T5,T12 · T15←T6,T9 · T16←T6,T10 · T17←T6,T11 · T18←T6,T7,T8,T11 |
| 4 | T19 Readiness dashboard · T20 Archive+clone | T19←T7,T8,T11,T14 · T20←T9,T10,T11,T14 |
| 5 | T21 Deployment packaging · T22 E2E smoke | everything |

### Isolation & merge protocol

1. T1 runs alone on `main`.
2. For each wave: branch `wave-N/tN-<slug>` per task off `main` (git worktrees recommended — `superpowers:using-git-worktrees`). Task file sets are **disjoint by construction**, so merges are conflict-free; merge in task-number order, run `npm install && npm test` on `main` after each merge.
3. A subagent's prompt must include: this plan's Global Constraints + Parallel Execution rules, its full task text verbatim, and `docs/brief.md` sections referenced by the task. Subagents must not read other tasks.
4. Each task ends with all its tests passing locally (`npm test --workspace=server` and/or `--workspace=web`).

### File-ownership map (who creates what)

- T1: repo root, `server/src/{config,db,migrate,app,server}.js`, `server/src/plugins/auth.js`, `server/src/lib/*`, `server/src/migrations/001_init.sql`, `server/test/helpers.js`, `server/scripts/seed-organizer.js`, minimal `web/` scaffold.
- T2: `server/src/routes/auth.routes.js` + test. T3: `server/src/llm/*`, `server/src/routes/ai.routes.js` + tests. T4: `server/src/routes/people.routes.js` + test. T5: `server/src/routes/trips.routes.js` + test.
- T6: everything under `web/src/` except later view/store files; creates ALL router entries + placeholder view files that later tasks **overwrite (each view owned by exactly one later task)**.
- T7: `server/src/routes/documents.routes.js`, `server/src/lib/expiry.js` + tests. T8: `server/src/routes/links.routes.js`, `server/src/routes/participant.routes.js` + tests. T9: `server/src/routes/budget.routes.js`, `server/src/llm/prompts/budget.js` + tests. T10: `server/src/routes/itinerary.routes.js`, `server/src/llm/prompts/itinerary.js` + tests. T11: `server/src/routes/checklists.routes.js`, `server/src/llm/prompts/packing.js` + tests. T12: `server/src/routes/destinations.routes.js`, `server/src/llm/prompts/destinations.js` + tests.
- T13–T18: each owns specific `web/src/views/*.vue`, `web/src/stores/*.js`, `web/src/components/*.vue` files (listed per task).
- T19: `server/src/routes/readiness.routes.js`, `web/src/views/TripReadinessView.vue`, `web/src/stores/readiness.js`. T20: `server/src/routes/archive.routes.js`, `web/src/views/TripArchiveView.vue`, `web/src/stores/archive.js`.
- T21: `Dockerfile`, `docker-compose.yml`, `server/src/plugins/static.js` (new file — app.js autoloads plugins dir, so no frozen-file edit), `README.md`, `docs/backup.md`. T22: `e2e/smoke.mjs`.

---
## Task 1: Foundation — repo, schema, app skeleton, auth primitives, test harness

**Runs alone (Wave 0).** Everything cross-cutting lands here so Wave 1+ tasks only add files.

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `docs/brief.md` (copy of the approved brief), `docs/plan.md` (this file)
- Create: `server/package.json`, `server/vitest.config.js`, `server/src/config.js`, `server/src/db.js`, `server/src/migrate.js`, `server/src/migrations/001_init.sql`, `server/src/lib/errors.js`, `server/src/plugins/auth.js`, `server/src/app.js`, `server/src/server.js`, `server/src/routes/health.routes.js`, `server/test/helpers.js`, `server/test/foundation.test.js`, `server/scripts/seed-organizer.js`
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/src/main.js` (minimal boot; T6 replaces)

**Interfaces (Produces — every later task consumes these):**
- `openDb(path)` / `getDb()` from `server/src/db.js` — better-sqlite3 handle, WAL, FKs on.
- `runMigrations(db)` from `server/src/migrate.js`.
- Fastify app factory `buildApp({ db })` from `server/src/app.js` — autoloads `src/plugins/` then `src/routes/`; decorates `app.db`.
- Auth plugin decorators: `app.requireOrganizer` (preHandler; sets `req.organizer = {id,email,name}` from `tp_session` JWT cookie, else 401 `UNAUTHORIZED`), `app.requireParticipant` (preHandler; verifies `Authorization: Bearer <raw>` against sha256 hash in `participant_links`, checks not revoked/expired, sets `req.participant = {linkId, tripId, personId}`, else 401 `INVALID_TOKEN`), `app.signSession(organizer)` → JWT string, `app.hashToken(raw)` → sha256 hex.
- Errors: `httpError(reply, status, code, message)` and global error handler emitting `{error:{code,message}}`.
- Test harness `makeTestApp()` from `server/test/helpers.js` → `{app, db}` on a fresh temp DB; `loginOrganizer(app)` → `{cookie}` (creates `test@x.dev`/`pass1234` organizer and logs in via route if present, else signs JWT directly); `authedInject(app, cookie, opts)`.
- Full DB schema (below) — later tasks read/write these tables directly.

- [ ] **Step 1: Init repo + workspaces + install deps**

Root `package.json`:

```json
{
  "name": "trip-planner",
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "dev": "npm run dev --workspace=server & npm run dev --workspace=web & wait",
    "test": "npm test --workspace=server && npm test --workspace=web",
    "build": "npm run build --workspace=web"
  }
}
```

`server/package.json`:

```json
{
  "name": "server",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "vitest run",
    "migrate": "node -e \"import('./src/db.js').then(m=>import('./src/migrate.js').then(g=>g.runMigrations(m.getDb())))\""
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "fastify-plugin": "^5.0.1",
    "@fastify/autoload": "^6.0.3",
    "@fastify/cookie": "^11.0.1",
    "@fastify/multipart": "^9.0.1",
    "@fastify/rate-limit": "^10.1.1",
    "@fastify/static": "^8.0.3",
    "better-sqlite3": "^12.4.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "ajv": "^8.17.1",
    "dotenv": "^16.4.5"
  },
  "devDependencies": { "vitest": "^3.2.0" }
}
```

`web/package.json`:

```json
{
  "name": "web",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.4.0",
    "pinia": "^3.0.0"
  },
  "devDependencies": {
    "vite": "^7.0.0",
    "@vitejs/plugin-vue": "^6.0.0",
    "vitest": "^3.2.0",
    "happy-dom": "^18.0.0",
    "@vue/test-utils": "^2.4.6"
  }
}
```

`.gitignore`:

```
node_modules/
data/
dist/
.env
*.log
```

`.env.example`:

```
PORT=3000
DB_PATH=./data/tripplanner.db
UPLOADS_DIR=./data/uploads
JWT_SECRET=change-me-32-chars-minimum-random
DEFAULT_CURRENCY=INR
# LLM: none | anthropic | openai | mock  (openai driver also covers Ollama via LLM_BASE_URL)
LLM_PROVIDER=none
LLM_MODEL=
LLM_API_KEY=
LLM_BASE_URL=
```

Run:
```bash
git init && mkdir -p docs server/src/{routes,plugins,lib,migrations,llm} server/test server/scripts web/src
# copy the approved brief into docs/brief.md and this plan into docs/plan.md
npm install
```
Expected: lockfile created, no errors.

- [ ] **Step 2: Config + DB + migration runner**

`server/src/config.js`:

```js
import 'dotenv/config'
export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || './data/tripplanner.db',
  uploadsDir: process.env.UPLOADS_DIR || './data/uploads',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  currency: process.env.DEFAULT_CURRENCY || 'INR',
  llm: {
    provider: process.env.LLM_PROVIDER || 'none',
    model: process.env.LLM_MODEL || '',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || ''
  }
}
```

`server/src/db.js`:

```js
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
```

`server/src/migrate.js`:

```js
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
```

- [ ] **Step 3: Full schema — `server/src/migrations/001_init.sql`** (the ONLY migration; the entire domain model from brief §4)

```sql
CREATE TABLE organizers (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE persons (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  phone TEXT, email TEXT, emergency_contact TEXT,
  dietary TEXT CHECK (dietary IN ('veg','non_veg','vegan')), allergies TEXT, medical_notes TEXT,
  pace TEXT CHECK (pace IN ('relaxed','moderate','packed')),
  interests TEXT NOT NULL DEFAULT '[]',            -- JSON string[]
  budget_band TEXT CHECK (budget_band IN ('low','medium','high')),
  home_city TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime()), updated_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE documents (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','national_id','driving_license','vaccination','other')),
  doc_number TEXT, expiry_date TEXT,               -- ISO date or NULL
  file_path TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE trips (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','planning','confirmed','active','archived')),
  vibe_tags TEXT NOT NULL DEFAULT '[]',            -- JSON string[]
  origin_city TEXT, currency TEXT NOT NULL DEFAULT 'INR',
  date_mode TEXT NOT NULL DEFAULT 'broad' CHECK (date_mode IN ('confirmed','slight','broad')),
  start_date TEXT, end_date TEXT, flex_days INTEGER,
  destination_mode TEXT NOT NULL DEFAULT 'open' CHECK (destination_mode IN ('decided','open')),
  destination TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime()), updated_at TEXT NOT NULL DEFAULT (datetime()), archived_at TEXT
);
CREATE TABLE trip_date_windows (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, note TEXT
);
CREATE TABLE trip_goals (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL, fixed_date TEXT, fixed_place TEXT, notes TEXT
);
CREATE TABLE trip_participants (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id),
  profile_confirmed INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime()),
  PRIMARY KEY (trip_id, person_id)
);
CREATE TABLE participant_links (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE destination_candidates (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL, rationale TEXT, best_dates TEXT, est_budget_per_person REAL, caveats TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai','manual')),
  decided INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE budget_lines (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('primary_transport','secondary_transport','stay','food','activities','shopping','leisure','misc')),
  estimate REAL NOT NULL DEFAULT 0, basis TEXT,
  UNIQUE (trip_id, category)
);
CREATE TABLE budget_overrides (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id),
  amount REAL NOT NULL, note TEXT,
  UNIQUE (trip_id, person_id)
);
CREATE TABLE itinerary_days (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_date TEXT NOT NULL, position INTEGER NOT NULL,
  UNIQUE (trip_id, day_date)
);
CREATE TABLE itinerary_items (
  id TEXT PRIMARY KEY, day_id TEXT NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, title TEXT NOT NULL, time_range TEXT, location TEXT,
  category TEXT NOT NULL DEFAULT 'activity' CHECK (category IN ('travel','food','activity','rest','logistics')),
  est_cost REAL, notes TEXT, link TEXT
);
CREATE TABLE checklists (
  id TEXT PRIMARY KEY,
  trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,   -- NULL for templates
  is_template INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('packing','tasks')),
  name TEXT NOT NULL, trip_type_tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime()),
  CHECK (is_template = 1 OR trip_id IS NOT NULL)
);
CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL, assignee_person_id TEXT REFERENCES persons(id),
  due_date TEXT, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
);
CREATE TABLE archives (
  trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL, notes TEXT, photo_links TEXT NOT NULL DEFAULT '[]',
  archived_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE actuals (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL, amount REAL NOT NULL,
  PRIMARY KEY (trip_id, category)
);
CREATE INDEX idx_documents_person ON documents(person_id);
CREATE INDEX idx_links_trip ON participant_links(trip_id);
CREATE INDEX idx_items_day ON itinerary_items(day_id);
```

- [ ] **Step 4: Errors, auth plugin, app factory, health route**

`server/src/lib/errors.js`:

```js
export function httpError(reply, status, code, message) {
  return reply.code(status).send({ error: { code, message } })
}
```

`server/src/plugins/auth.js` (Fastify plugin, autoloaded):

```js
import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import jwt from 'jsonwebtoken'
import { createHash } from 'node:crypto'
import { config } from '../config.js'
import { httpError } from '../lib/errors.js'

export default fp(async function authPlugin(app) {
  await app.register(cookie)
  app.decorate('signSession', (organizer) =>
    jwt.sign({ sub: organizer.id, email: organizer.email, name: organizer.name }, config.jwtSecret, { expiresIn: '30d' }))
  app.decorate('hashToken', (raw) => createHash('sha256').update(raw).digest('hex'))
  app.decorate('requireOrganizer', async (req, reply) => {
    const raw = req.cookies?.tp_session
    if (!raw) return httpError(reply, 401, 'UNAUTHORIZED', 'Login required')
    try {
      const p = jwt.verify(raw, config.jwtSecret)
      req.organizer = { id: p.sub, email: p.email, name: p.name }
    } catch { return httpError(reply, 401, 'UNAUTHORIZED', 'Invalid or expired session') }
  })
  app.decorate('requireParticipant', async (req, reply) => {
    const h = req.headers.authorization || ''
    const raw = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!raw) return httpError(reply, 401, 'INVALID_TOKEN', 'Missing token')
    const row = app.db.prepare(
      `SELECT id, trip_id, person_id, expires_at, revoked_at FROM participant_links WHERE token_hash = ?`
    ).get(app.hashToken(raw))
    if (!row || row.revoked_at || (row.expires_at && row.expires_at < new Date().toISOString()))
      return httpError(reply, 401, 'INVALID_TOKEN', 'Invalid, revoked or expired link')
    req.participant = { linkId: row.id, tripId: row.trip_id, personId: row.person_id }
  })
})
```

`server/src/app.js`:

```js
import Fastify from 'fastify'
import autoload from '@fastify/autoload'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from './migrate.js'

const here = dirname(fileURLToPath(import.meta.url))

export async function buildApp({ db }) {
  runMigrations(db)
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  app.decorate('db', db)
  await app.register(autoload, { dir: join(here, 'plugins') })
  await app.register(autoload, { dir: join(here, 'routes'), options: { prefix: '/api' } })
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500
    reply.code(status).send({ error: { code: err.code || 'INTERNAL', message: status === 500 ? 'Internal error' : err.message } })
  })
  return app
}
```

`server/src/server.js`:

```js
import { buildApp } from './app.js'
import { getDb } from './db.js'
import { config } from './config.js'
const app = await buildApp({ db: getDb() })
app.listen({ port: config.port, host: '0.0.0.0' })
```

`server/src/routes/health.routes.js` (also the route-module convention every later task copies):

```js
export default async function routes(app) {
  app.get('/health', async () => ({ ok: true }))
}
```

- [ ] **Step 5: Test harness + failing foundation tests, then verify green**

`server/vitest.config.js`:

```js
export default { test: { environment: 'node', fileParallelism: false } }
```

`server/test/helpers.js`:

```js
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { openDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

export async function makeTestApp() {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'tp-')), 'test.db'))
  const app = await buildApp({ db })
  return { app, db }
}
export function createOrganizer(db, { email = 'test@x.dev', password = 'pass1234', name = 'Tester' } = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?)')
    .run(id, email, bcrypt.hashSync(password, 8), name)
  return { id, email, name }
}
export function loginOrganizer(app, db) {
  const org = createOrganizer(db)
  return { cookie: `tp_session=${app.signSession(org)}`, organizer: org }
}
export function authedInject(app, cookie, opts) {
  return app.inject({ ...opts, headers: { cookie, ...(opts.headers || {}) } })
}
export function createPerson(db, fields = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO persons (id,name) VALUES (?,?)').run(id, fields.name || 'P ' + id.slice(0, 4))
  if (Object.keys(fields).length) {
    for (const [k, v] of Object.entries(fields)) if (k !== 'name')
      db.prepare(`UPDATE persons SET ${k} = ? WHERE id = ?`).run(v, id)
  }
  return db.prepare('SELECT * FROM persons WHERE id = ?').get(id)
}
export function createTrip(db, fields = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO trips (id,name) VALUES (?,?)').run(id, fields.name || 'Trip ' + id.slice(0, 4))
  for (const [k, v] of Object.entries(fields)) if (k !== 'name')
    db.prepare(`UPDATE trips SET ${k} = ? WHERE id = ?`).run(v, id)
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
}
```

`server/test/foundation.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject } from './helpers.js'

describe('foundation', () => {
  it('migrates schema and serves /api/health', async () => {
    const { app, db } = await makeTestApp()
    expect(db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table'").get().c).toBeGreaterThan(10)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
  })
  it('requireOrganizer rejects without cookie, accepts with signed session', async () => {
    const { app, db } = await makeTestApp()
    app.get('/api/_secure', { preHandler: app.requireOrganizer }, async (req) => ({ id: req.organizer.id }))
    expect((await app.inject({ method: 'GET', url: '/api/_secure' })).statusCode).toBe(401)
    const { cookie } = loginOrganizer(app, db)
    expect((await authedInject(app, cookie, { method: 'GET', url: '/api/_secure' })).statusCode).toBe(200)
  })
  it('requireParticipant validates bearer token hash, revocation, expiry', async () => {
    const { app, db } = await makeTestApp()
    app.get('/api/participant/_ping', { preHandler: app.requireParticipant }, async (req) => req.participant)
    const { createPerson, createTrip } = await import('./helpers.js')
    const p = createPerson(db); const t = createTrip(db)
    const raw = 'x'.repeat(43)
    db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)')
      .run('l1', t.id, p.id, app.hashToken(raw))
    const ok = await app.inject({ method: 'GET', url: '/api/participant/_ping', headers: { authorization: `Bearer ${raw}` } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ linkId: 'l1', tripId: t.id, personId: p.id })
    db.prepare("UPDATE participant_links SET revoked_at = datetime() WHERE id='l1'").run()
    const rev = await app.inject({ method: 'GET', url: '/api/participant/_ping', headers: { authorization: `Bearer ${raw}` } })
    expect(rev.statusCode).toBe(401)
  })
})
```

Run: `npm test --workspace=server` — Expected: all 3 tests PASS. (Write tests before `auth.js`/`app.js` bodies if following strict TDD; either way they must pass here.)

- [ ] **Step 6: Seed script + minimal web scaffold**

`server/scripts/seed-organizer.js`:

```js
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
```

`web/index.html`: standard Vite entry (`<div id="app"></div>`, `<script type="module" src="/src/main.js">`).
`web/vite.config.js`:

```js
import vue from '@vitejs/plugin-vue'
export default {
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'happy-dom' }
}
```

`web/src/main.js` (T6 replaces): `document.querySelector('#app').textContent = 'trip-planner web: built in Task 6'`

- [ ] **Step 7: Verify + commit**

```bash
npm test --workspace=server        # all pass
node server/scripts/seed-organizer.js --email=admin@local --name=Admin --password=changeme  # prints "Organizer ready"
git add -A && git commit -m "feat: foundation — schema, app skeleton, auth primitives, test harness"
```

---
## Task 2: Organizer auth endpoints

**Wave 1. Depends on:** T1.

**Files:**
- Create: `server/src/routes/auth.routes.js`
- Test: `server/test/auth.test.js`

**Interfaces:**
- Consumes: `app.signSession`, `app.requireOrganizer`, `httpError`, test helpers.
- Produces: `POST /api/auth/login {email,password}` → 200 `{organizer:{id,email,name}}` + Set-Cookie `tp_session` (httpOnly, SameSite=Lax, Path=/, 30d) | 401 `INVALID_CREDENTIALS`. `POST /api/auth/logout` → 204 + cookie cleared. `GET /api/auth/me` (requireOrganizer) → `{organizer}`.

- [ ] **Step 1: Failing tests** — `server/test/auth.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, createOrganizer } from './helpers.js'

describe('auth', () => {
  it('login sets httpOnly cookie and returns organizer; bad password 401', async () => {
    const { app, db } = await makeTestApp()
    createOrganizer(db, { email: 'a@b.c', password: 'secret123', name: 'A' })
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.c', password: 'secret123' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().organizer.email).toBe('a@b.c')
    const setCookie = ok.headers['set-cookie']
    expect(setCookie).toMatch(/tp_session=/); expect(setCookie).toMatch(/HttpOnly/i)
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.c', password: 'wrong' } })
    expect(bad.statusCode).toBe(401); expect(bad.json().error.code).toBe('INVALID_CREDENTIALS')
  })
  it('me returns organizer with cookie; logout clears it', async () => {
    const { app, db } = await makeTestApp()
    createOrganizer(db, { email: 'a@b.c', password: 'secret123' })
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.c', password: 'secret123' } })
    const cookie = login.headers['set-cookie'].split(';')[0]
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    expect(out.statusCode).toBe(204)
    expect(out.headers['set-cookie']).toMatch(/tp_session=;/)
  })
})
```

- [ ] **Step 2: Run** `npm test --workspace=server -- auth` — Expected: FAIL (404s).
- [ ] **Step 3: Implement** `server/src/routes/auth.routes.js`:

```js
import bcrypt from 'bcryptjs'
import { httpError } from '../lib/errors.js'

export default async function routes(app) {
  const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 }
  app.post('/auth/login', {
    schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } }
  }, async (req, reply) => {
    const org = app.db.prepare('SELECT * FROM organizers WHERE email = ?').get(req.body.email)
    if (!org || !bcrypt.compareSync(req.body.password, org.password_hash))
      return httpError(reply, 401, 'INVALID_CREDENTIALS', 'Wrong email or password')
    reply.setCookie('tp_session', app.signSession(org), cookieOpts)
    return { organizer: { id: org.id, email: org.email, name: org.name } }
  })
  app.post('/auth/logout', async (req, reply) => {
    reply.clearCookie('tp_session', { path: '/' }); return reply.code(204).send()
  })
  app.get('/auth/me', { preHandler: app.requireOrganizer }, async (req) => ({ organizer: req.organizer }))
}
```

- [ ] **Step 4: Run** `npm test --workspace=server -- auth` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: organizer login/logout/me"`

---

## Task 3: LLM adapter (provider-agnostic) + AI status route

**Wave 1. Depends on:** T1. Implements brief §7 exactly.

**Files:**
- Create: `server/src/llm/index.js`, `server/src/llm/drivers/anthropic.js`, `server/src/llm/drivers/openai.js`, `server/src/llm/drivers/mock.js`, `server/src/routes/ai.routes.js`
- Test: `server/test/llm.test.js`

**Interfaces:**
- Produces (every AI feature in T9–T12 consumes these):
  - `generate({ system, prompt, schema, maxTokens? })` → Promise<object validated against `schema`>. Throws `LlmDisabledError` (provider `none`), `LlmValidationError` (2 failed attempts), `LlmHttpError`.
  - `isEnabled()` → boolean. `aiGuard(reply)` helper: if disabled, sends 503 `AI_DISABLED` and returns true.
  - Mock driver test API: `import { queueMock, clearMocks } from '../src/llm/drivers/mock.js'` — `queueMock(obj)` enqueues the next response object.
  - `GET /api/ai/status` → `{ enabled, provider }` (no auth — harmless, used by web shell).
- Driver contract (internal): `complete({ system, prompt, maxTokens })` → Promise<string>.

- [ ] **Step 1: Failing tests** — `server/test/llm.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('llm adapter', () => {
  beforeEach(() => vi.resetModules())
  async function withProvider(provider) {
    process.env.LLM_PROVIDER = provider
    return await import('../src/llm/index.js')
  }
  it('throws LlmDisabledError when provider=none', async () => {
    const llm = await withProvider('none')
    expect(llm.isEnabled()).toBe(false)
    await expect(llm.generate({ prompt: 'x', schema: { type: 'object' } })).rejects.toThrow(/disabled/i)
  })
  it('mock driver returns queued object validated against schema', async () => {
    const llm = await withProvider('mock')
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    queueMock({ answer: 42 })
    const out = await llm.generate({ prompt: 'x', schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } } })
    expect(out).toEqual({ answer: 42 })
  })
  it('retries once on schema violation then throws LlmValidationError', async () => {
    const llm = await withProvider('mock')
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    queueMock({ wrong: true }); queueMock({ wrong: 'again' })
    await expect(llm.generate({ prompt: 'x', schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } } }))
      .rejects.toThrow(/validation/i)
  })
  it('extracts JSON from fenced/wrapped text', async () => {
    const llm = await withProvider('mock')
    const { queueMockRaw } = await import('../src/llm/drivers/mock.js')
    queueMockRaw('Here you go:\n```json\n{"answer": 1}\n```')
    const out = await llm.generate({ prompt: 'x', schema: { type: 'object', required: ['answer'] } })
    expect(out.answer).toBe(1)
  })
})
```

- [ ] **Step 2: Run** `npm test --workspace=server -- llm` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**

`server/src/llm/drivers/mock.js`:

```js
const queue = []
export function queueMock(obj) { queue.push(JSON.stringify(obj)) }
export function queueMockRaw(text) { queue.push(text) }
export function clearMocks() { queue.length = 0 }
export default { async complete() {
  if (!queue.length) throw new Error('mock LLM queue empty — call queueMock() in your test')
  return queue.shift()
} }
```

`server/src/llm/drivers/anthropic.js`:

```js
import { config } from '../../config.js'
export default { async complete({ system, prompt, maxTokens = 4000 }) {
  const res = await fetch((config.llm.baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.llm.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.llm.model, max_tokens: maxTokens,
      system: system || 'You are a precise trip-planning assistant. Respond with JSON only.',
      messages: [{ role: 'user', content: prompt }] })
  })
  if (!res.ok) throw Object.assign(new Error(`LLM HTTP ${res.status}: ${await res.text()}`), { name: 'LlmHttpError' })
  const data = await res.json()
  return data.content.map(b => b.text || '').join('')
} }
```

`server/src/llm/drivers/openai.js` (also covers Ollama/any OpenAI-compatible server via `LLM_BASE_URL`):

```js
import { config } from '../../config.js'
export default { async complete({ system, prompt, maxTokens = 4000 }) {
  const res = await fetch((config.llm.baseUrl || 'https://api.openai.com') + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.llm.apiKey}` },
    body: JSON.stringify({ model: config.llm.model, max_tokens: maxTokens, messages: [
      { role: 'system', content: system || 'You are a precise trip-planning assistant. Respond with JSON only.' },
      { role: 'user', content: prompt }] })
  })
  if (!res.ok) throw Object.assign(new Error(`LLM HTTP ${res.status}: ${await res.text()}`), { name: 'LlmHttpError' })
  return (await res.json()).choices[0].message.content
} }
```

`server/src/llm/index.js`:

```js
import Ajv from 'ajv'
import anthropic from './drivers/anthropic.js'
import openai from './drivers/openai.js'
import mock from './drivers/mock.js'

const ajv = new Ajv({ allErrors: true, useDefaults: true })
const drivers = { anthropic, openai, mock }
const provider = () => process.env.LLM_PROVIDER || 'none'

export class LlmDisabledError extends Error { constructor() { super('AI is disabled: no LLM provider configured') } }
export class LlmValidationError extends Error {}
export function isEnabled() { return provider() !== 'none' && !!drivers[provider()] }
export function aiGuard(reply) {
  if (isEnabled()) return false
  reply.code(503).send({ error: { code: 'AI_DISABLED', message: 'No LLM provider configured' } })
  return true
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{'); const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try { return JSON.parse(body.slice(start, end + 1)) } catch { return null }
}
export async function generate({ system, prompt, schema, maxTokens = 4000 }) {
  if (!isEnabled()) throw new LlmDisabledError()
  const validate = ajv.compile(schema)
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt
      : `${prompt}\n\nYour previous response failed validation: ${lastErr}\nReturn ONLY valid JSON matching the required schema.`
    const text = await drivers[provider()].complete({ system, prompt: p, maxTokens })
    const parsed = extractJson(text)
    if (parsed && validate(parsed)) return parsed
    lastErr = parsed ? ajv.errorsText(validate.errors) : 'response was not parseable JSON'
  }
  throw new LlmValidationError(`LLM output failed validation after retry: ${lastErr}`)
}
```

`server/src/routes/ai.routes.js`:

```js
import { isEnabled } from '../llm/index.js'
export default async function routes(app) {
  app.get('/ai/status', async () => ({ enabled: isEnabled(), provider: process.env.LLM_PROVIDER || 'none' }))
}
```

- [ ] **Step 4: Run** `npm test --workspace=server -- llm` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: provider-agnostic LLM adapter (anthropic/openai/mock) + /api/ai/status"`

**Note for T9–T12 (copy into those agents' context):** in AI-endpoint tests set `process.env.LLM_PROVIDER = 'mock'` at top of file, `queueMock(<valid draft object>)` before the request, and add one test with `LLM_PROVIDER='none'` (or restore env) asserting 503 `AI_DISABLED`, plus one privacy test asserting the built prompt contains no name/phone/email/medical string (prompt builders are pure functions — test them directly).

---
## Task 4: People directory API

**Wave 1. Depends on:** T1. Brief §4.1.

**Files:**
- Create: `server/src/routes/people.routes.js`
- Test: `server/test/people.test.js`

**Interfaces:**
- Person JSON shape (used by T6/T8/T13/T18): `{id, name, phone, email, emergency_contact, dietary('veg'|'non_veg'|'vegan'|null), allergies, medical_notes, pace('relaxed'|'moderate'|'packed'|null), interests: string[], budget_band('low'|'medium'|'high'|null), home_city, created_at, updated_at}`. `interests` is stored as JSON text — routes must parse on read, stringify on write. Export helper `export function personToJson(row)` from this module (T8 reuses it).
- Routes (all `preHandler: app.requireOrganizer`):
  - `GET /api/people` → `{people: Person[]}` ordered by name
  - `POST /api/people` (body: `name` required, all other profile fields optional) → 201 `{person}`
  - `GET /api/people/:id` → `{person}` | 404 `NOT_FOUND`
  - `PUT /api/people/:id` (partial) → `{person}`; bumps `updated_at`
  - `DELETE /api/people/:id` → 204 | 409 `TRIP_MEMBER` if person is in any non-archived trip

- [ ] **Step 1: Failing tests** — `server/test/people.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip } from './helpers.js'

describe('people', () => {
  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/people' })).statusCode).toBe(401)
  })
  it('CRUD round-trip with interests array + partial update', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const created = await authedInject(app, cookie, { method: 'POST', url: '/api/people',
      payload: { name: 'Asha', dietary: 'veg', interests: ['trekking', 'food'], home_city: 'Chennai' } })
    expect(created.statusCode).toBe(201)
    const p = created.json().person
    expect(p.interests).toEqual(['trekking', 'food'])
    const upd = await authedInject(app, cookie, { method: 'PUT', url: `/api/people/${p.id}`, payload: { pace: 'relaxed' } })
    expect(upd.json().person).toMatchObject({ name: 'Asha', pace: 'relaxed', dietary: 'veg' })
    const list = await authedInject(app, cookie, { method: 'GET', url: '/api/people' })
    expect(list.json().people).toHaveLength(1)
  })
  it('rejects bad enum, 404 unknown id, 409 delete when in active trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const bad = await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'X', dietary: 'carnivore' } })
    expect(bad.statusCode).toBe(400)
    expect((await authedInject(app, cookie, { method: 'GET', url: '/api/people/nope' })).statusCode).toBe(404)
    const p = (await authedInject(app, cookie, { method: 'POST', url: '/api/people', payload: { name: 'Y' } })).json().person
    const t = createTrip(db)
    db.prepare('INSERT INTO trip_participants (trip_id, person_id) VALUES (?,?)').run(t.id, p.id)
    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/people/${p.id}` })
    expect(del.statusCode).toBe(409); expect(del.json().error.code).toBe('TRIP_MEMBER')
  })
})
```

- [ ] **Step 2: Run** `npm test --workspace=server -- people` — Expected: FAIL.
- [ ] **Step 3: Implement** `server/src/routes/people.routes.js`:

```js
import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'

const FIELDS = ['name','phone','email','emergency_contact','dietary','allergies','medical_notes','pace','interests','budget_band','home_city']
const bodySchema = (required) => ({ type: 'object', required, additionalProperties: false, properties: {
  name: { type: 'string', minLength: 1 }, phone: { type: ['string','null'] }, email: { type: ['string','null'] },
  emergency_contact: { type: ['string','null'] }, dietary: { type: ['string','null'], enum: ['veg','non_veg','vegan',null] },
  allergies: { type: ['string','null'] }, medical_notes: { type: ['string','null'] },
  pace: { type: ['string','null'], enum: ['relaxed','moderate','packed',null] },
  interests: { type: 'array', items: { type: 'string' } },
  budget_band: { type: ['string','null'], enum: ['low','medium','high',null] }, home_city: { type: ['string','null'] }
} })

export function personToJson(row) {
  return row ? { ...row, interests: JSON.parse(row.interests || '[]') } : row
}

export default async function routes(app) {
  const opts = (required = []) => ({ preHandler: app.requireOrganizer, schema: { body: bodySchema(required) } })
  const get = (id) => app.db.prepare('SELECT * FROM persons WHERE id = ?').get(id)

  app.get('/people', { preHandler: app.requireOrganizer }, async () =>
    ({ people: app.db.prepare('SELECT * FROM persons ORDER BY name').all().map(personToJson) }))

  app.post('/people', opts(['name']), async (req, reply) => {
    const id = randomUUID()
    const vals = Object.fromEntries(FIELDS.map(f => [f, f === 'interests' ? JSON.stringify(req.body.interests || []) : req.body[f] ?? null]))
    app.db.prepare(`INSERT INTO persons (id, ${FIELDS.join(',')}) VALUES (?, ${FIELDS.map(() => '?').join(',')})`)
      .run(id, ...FIELDS.map(f => vals[f]))
    return reply.code(201).send({ person: personToJson(get(id)) })
  })

  app.get('/people/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = get(req.params.id)
    return row ? { person: personToJson(row) } : httpError(reply, 404, 'NOT_FOUND', 'No such person')
  })

  app.put('/people/:id', opts([]), async (req, reply) => {
    if (!get(req.params.id)) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    for (const f of FIELDS) if (f in req.body)
      app.db.prepare(`UPDATE persons SET ${f} = ?, updated_at = datetime() WHERE id = ?`)
        .run(f === 'interests' ? JSON.stringify(req.body[f]) : req.body[f], req.params.id)
    return { person: personToJson(get(req.params.id)) }
  })

  app.delete('/people/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (!get(req.params.id)) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    const inTrip = app.db.prepare(`SELECT 1 FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
      WHERE tp.person_id = ? AND t.status != 'archived'`).get(req.params.id)
    if (inTrip) return httpError(reply, 409, 'TRIP_MEMBER', 'Person is part of a non-archived trip')
    app.db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id)
    return reply.code(204).send()
  })
}
```

- [ ] **Step 4: Run** `npm test --workspace=server -- people` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: people directory CRUD"`

---

## Task 5: Trips core API — CRUD, lifecycle, date windows, goals, participants

**Wave 1. Depends on:** T1. Brief §4.3, §4.4 (organizer-only dates), lifecycle from §4.3.

**Files:**
- Create: `server/src/routes/trips.routes.js`
- Test: `server/test/trips.test.js`

**Interfaces:**
- Trip JSON (full, used by T6/T14 and read by T8–T12): `{id,name,description,status,vibe_tags:string[],origin_city,currency,date_mode,start_date,end_date,flex_days,destination_mode,destination,created_at,updated_at,archived_at, windows:[{id,start_date,end_date,note}], goals:[{id,title,fixed_date,fixed_place,notes}], participants:[{person_id,name,profile_confirmed}]}`. Export `export function tripToJson(db, row)` (T8/T20 reuse it).
- Routes (all `preHandler: app.requireOrganizer`):
  - `GET /api/trips?status=<s>` → `{trips: [{id,name,status,destination,start_date,end_date,participant_count}]}`
  - `POST /api/trips` body `{name*, description, vibe_tags[], origin_city, date_mode, start_date, end_date, flex_days, destination_mode, destination, participant_ids[]}` → 201 `{trip}` (status `idea`)
  - `GET /api/trips/:id` → `{trip}` | 404
  - `PUT /api/trips/:id` (partial; same fields minus participant_ids) → `{trip}`
  - `POST /api/trips/:id/status {status}` → `{trip}`; allowed transitions ONLY `idea→planning`, `planning→confirmed`, `confirmed→active` (else 400 `BAD_TRANSITION`). `confirmed` additionally requires `date_mode='confirmed'` + start/end set + (`destination_mode='decided'` and destination set), else 400 `NOT_READY`. `archived` here → 400 `USE_ARCHIVE_ENDPOINT` (T20 owns archiving).
  - `PUT /api/trips/:id/windows {windows:[{start_date,end_date,note?}]}` → replace-all, returns `{windows}`
  - `POST /api/trips/:id/goals {title*, fixed_date?, fixed_place?, notes?}` → 201; `PUT /api/goals/:goalId`; `DELETE /api/goals/:goalId` → 204
  - `POST /api/trips/:id/participants {person_id}` → 201 `{trip}` | 409 `ALREADY_MEMBER`; `DELETE /api/trips/:id/participants/:personId` → 204

- [ ] **Step 1: Failing tests** — `server/test/trips.test.js` (representative; write all listed behaviors):

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createPerson } from './helpers.js'

async function mkTrip(app, cookie, extra = {}) {
  return (await authedInject(app, cookie, { method: 'POST', url: '/api/trips',
    payload: { name: 'Goa', vibe_tags: ['chill','beach'], origin_city: 'Chennai', ...extra } })).json().trip
}
describe('trips', () => {
  it('creates trip with defaults idea/broad/open and participant_ids', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db)
    const t = await mkTrip(app, cookie, { participant_ids: [p.id] })
    expect(t).toMatchObject({ status: 'idea', date_mode: 'broad', destination_mode: 'open', vibe_tags: ['chill','beach'] })
    expect(t.participants).toEqual([{ person_id: p.id, name: p.name, profile_confirmed: 0 }])
  })
  it('windows replace-all; goals CRUD with fixed_date hard constraint stored', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const w = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/windows`,
      payload: { windows: [{ start_date: '2026-10-02', end_date: '2026-10-06' }, { start_date: '2026-10-16', end_date: '2026-10-20', note: 'after payday' }] } })
    expect(w.json().windows).toHaveLength(2)
    const g = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/goals`,
      payload: { title: 'Sunburn concert', fixed_date: '2026-10-04', fixed_place: 'Vagator' } })
    expect(g.statusCode).toBe(201)
  })
  it('lifecycle: idea→planning ok; planning→confirmed blocked until dates+destination ready; archived rejected here', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const s = (status) => authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/status`, payload: { status } })
    expect((await s('planning')).statusCode).toBe(200)
    const notReady = await s('confirmed')
    expect(notReady.statusCode).toBe(400); expect(notReady.json().error.code).toBe('NOT_READY')
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`,
      payload: { date_mode: 'confirmed', start_date: '2026-10-02', end_date: '2026-10-06', destination_mode: 'decided', destination: 'Goa' } })
    expect((await s('confirmed')).statusCode).toBe(200)
    expect((await s('idea')).statusCode).toBe(400)
    expect((await s('archived')).json().error.code).toBe('USE_ARCHIVE_ENDPOINT')
  })
})
```

- [ ] **Step 2: Run** `npm test --workspace=server -- trips` — Expected: FAIL.
- [ ] **Step 3: Implement** `server/src/routes/trips.routes.js`. Key logic (write the full module following the T4 style — JSON schema validation on bodies, `httpError` for failures):

```js
import { randomUUID } from 'node:crypto'
import { httpError } from '../lib/errors.js'

const TRIP_FIELDS = ['name','description','vibe_tags','origin_city','date_mode','start_date','end_date','flex_days','destination_mode','destination']
const TRANSITIONS = { idea: ['planning'], planning: ['confirmed'], confirmed: ['active'], active: [], archived: [] }

export function tripToJson(db, row) {
  if (!row) return row
  return { ...row, vibe_tags: JSON.parse(row.vibe_tags || '[]'),
    windows: db.prepare('SELECT id,start_date,end_date,note FROM trip_date_windows WHERE trip_id = ? ORDER BY start_date').all(row.id),
    goals: db.prepare('SELECT id,title,fixed_date,fixed_place,notes FROM trip_goals WHERE trip_id = ?').all(row.id),
    participants: db.prepare(`SELECT tp.person_id, p.name, tp.profile_confirmed FROM trip_participants tp
      JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ? ORDER BY p.name`).all(row.id) }
}

export default async function routes(app) {
  const get = (id) => app.db.prepare('SELECT * FROM trips WHERE id = ?').get(id)
  // GET /trips (list summaries), POST /trips, GET/PUT /trips/:id — same CRUD pattern as people.routes.js,
  // with vibe_tags JSON-stringified on write and participant_ids inserted into trip_participants on create.

  app.post('/trips/:id/status', { preHandler: app.requireOrganizer,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } } },
    async (req, reply) => {
      const trip = get(req.params.id)
      if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
      const target = req.body.status
      if (target === 'archived') return httpError(reply, 400, 'USE_ARCHIVE_ENDPOINT', 'Archive via POST /api/trips/:id/archive')
      if (!(TRANSITIONS[trip.status] || []).includes(target))
        return httpError(reply, 400, 'BAD_TRANSITION', `Cannot go ${trip.status} → ${target}`)
      if (target === 'confirmed') {
        const ready = trip.date_mode === 'confirmed' && trip.start_date && trip.end_date
          && trip.destination_mode === 'decided' && trip.destination
        if (!ready) return httpError(reply, 400, 'NOT_READY', 'Confirmed requires final dates and a decided destination')
      }
      app.db.prepare('UPDATE trips SET status = ?, updated_at = datetime() WHERE id = ?').run(target, trip.id)
      return { trip: tripToJson(app.db, get(trip.id)) }
    })
  // PUT /trips/:id/windows — DELETE all rows for trip then INSERT each with randomUUID(), return {windows}
  // POST /trips/:id/goals, PUT /goals/:goalId, DELETE /goals/:goalId — straightforward CRUD on trip_goals
  // POST /trips/:id/participants — INSERT into trip_participants, 409 ALREADY_MEMBER on PK conflict
  // DELETE /trips/:id/participants/:personId — DELETE row, 204
}
```

The commented routes are required — implement them fully with the shown patterns; tests in Step 1 cover them.

- [ ] **Step 4: Run** `npm test --workspace=server -- trips` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: trips CRUD, lifecycle guards, date windows, goals, participants"`

---
## Task 6: Web shell — router, API client, layout, login

**Wave 1. Depends on:** T1 (T2's login contract is fixed above — no code dependency). Creates the **entire route table and one placeholder view file per screen**; Wave-3 tasks overwrite only their own view files, so `router.js` is frozen after this task.

**Files:**
- Create: `web/src/main.js` (replace T1 stub), `web/src/App.vue`, `web/src/router.js`, `web/src/api/client.js`, `web/src/stores/auth.js`, `web/src/assets/main.css`, `web/src/views/LoginView.vue`, `web/src/components/AppNav.vue`
- Create placeholder views (each is `<template><main class="page"><h1>{{ /* screen name */ }}</h1><p>Implemented in a later task.</p></main></template>`): `web/src/views/TripsListView.vue`, `TripNewView.vue`, `TripDetailView.vue`, `TripBudgetView.vue`, `TripItineraryView.vue`, `TripChecklistsView.vue`, `TripReadinessView.vue`, `TripArchiveView.vue`, `PeopleListView.vue`, `PersonDetailView.vue`, `ParticipantView.vue`
- Test: `web/src/api/client.test.js`, `web/src/stores/auth.test.js`

**Interfaces (Produces — all UI tasks consume):**
- `web/src/api/client.js`:
  - `api.get(path)`, `api.post(path, body?)`, `api.put(path, body?)`, `api.del(path)` → parsed JSON; on non-2xx throws `ApiError` with `.status`, `.code`, `.message` (from `{error:{code,message}}`). `credentials: 'same-origin'`. 401 on organizer routes → redirects to `/login` (except when already there).
  - `participantApi(token)` → same four methods but sends `Authorization: Bearer <token>` and never redirects.
  - `upload(path, formData)` → POST multipart (no JSON content-type).
- `useAuthStore()`: state `{organizer, aiEnabled}`; actions `login(email,password)`, `logout()`, `fetchMe()` (also fetches `/api/ai/status` → `aiEnabled`).
- Route table (paths are contracts — do not change):

| Path | Name | View | Meta |
|---|---|---|---|
| `/login` | login | LoginView | public |
| `/` | trips | TripsListView | auth |
| `/trips/new` | trip-new | TripNewView | auth |
| `/trips/:id` | trip | TripDetailView | auth |
| `/trips/:id/budget` | trip-budget | TripBudgetView | auth |
| `/trips/:id/itinerary` | trip-itinerary | TripItineraryView | auth |
| `/trips/:id/checklists` | trip-checklists | TripChecklistsView | auth |
| `/trips/:id/readiness` | trip-readiness | TripReadinessView | auth |
| `/trips/:id/archive` | trip-archive | TripArchiveView | auth |
| `/people` | people | PeopleListView | auth |
| `/people/:id` | person | PersonDetailView | auth |
| `/p/:token` | participant | ParticipantView | public, bare layout |

- [ ] **Step 1: Failing tests** — `web/src/api/client.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError, participantApi } from './client.js'

describe('api client', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  it('returns parsed json on 200', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    expect(await api.get('/api/health')).toEqual({ ok: 1 })
  })
  it('throws ApiError with code from error envelope', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'nope' } }), { status: 404 }))
    await expect(api.get('/api/people/x')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
  it('participantApi sends bearer header', async () => {
    fetch.mockResolvedValue(new Response('{}', { status: 200 }))
    await participantApi('tok123').get('/api/participant/me')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok123')
  })
})
```

`web/src/stores/auth.test.js`: with `createPinia()` + mocked fetch, assert `login()` sets `organizer` and `fetchMe()` sets `aiEnabled` from `/api/ai/status`.

- [ ] **Step 2: Run** `npm test --workspace=web` — Expected: FAIL.
- [ ] **Step 3: Implement.**

`web/src/api/client.js`:

```js
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}
async function request(path, { method = 'GET', body, headers = {}, redirectOn401 = true } = {}) {
  const opts = { method, credentials: 'same-origin', headers: { ...headers } }
  if (body instanceof FormData) opts.body = body
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const res = await fetch(path, opts)
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && redirectOn401 && location.pathname !== '/login') location.assign('/login')
    throw new ApiError(res.status, data.error?.code || 'UNKNOWN', data.error?.message || res.statusText)
  }
  return data
}
export const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b }),
  put: (p, b) => request(p, { method: 'PUT', body: b }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, formData) => request(p, { method: 'POST', body: formData })
}
export function participantApi(token) {
  const h = { Authorization: `Bearer ${token}` }
  const o = { headers: h, redirectOn401: false }
  return {
    get: (p) => request(p, o),
    post: (p, b) => request(p, { ...o, method: 'POST', body: b }),
    put: (p, b) => request(p, { ...o, method: 'PUT', body: b }),
    del: (p) => request(p, { ...o, method: 'DELETE' }),
    upload: (p, f) => request(p, { ...o, method: 'POST', body: f })
  }
}
```

`web/src/stores/auth.js`:

```js
import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({ organizer: null, aiEnabled: false }),
  actions: {
    async login(email, password) {
      this.organizer = (await api.post('/api/auth/login', { email, password })).organizer
      await this.fetchAi()
    },
    async logout() { await api.post('/api/auth/logout'); this.organizer = null },
    async fetchMe() {
      try { this.organizer = (await api.get('/api/auth/me')).organizer } catch { this.organizer = null }
      await this.fetchAi()
    },
    async fetchAi() {
      try { this.aiEnabled = (await api.get('/api/ai/status')).enabled } catch { this.aiEnabled = false }
    }
  }
})
```

`web/src/router.js` — `createRouter(createWebHistory())` with the exact table above; global `beforeEach`: routes with `meta.auth` redirect to `/login` when `useAuthStore().organizer` is null after a one-time `fetchMe()`. `/p/:token` sets `meta.bare` so `App.vue` hides nav.

`web/src/App.vue` — renders `<AppNav v-if="!route.meta.bare && auth.organizer" />` + `<RouterView />`. `AppNav.vue`: links to Trips (`/`), People (`/people`), logout button; mobile-first (horizontal scroll nav bar).

`web/src/assets/main.css` — small mobile-first stylesheet: system font stack, `.page{max-width:60rem;margin:auto;padding:1rem}`, `.card`, `.btn`, `.btn-primary`, `.field` (label+input block), `.table` (block-on-mobile), `.badge`, `.badge-warn`, `.badge-ok`. All later UI tasks use ONLY these classes plus scoped styles — no CSS framework.

`web/src/views/LoginView.vue` — email+password form → `auth.login()`, on success `router.push('/')`, shows `ApiError.message` on failure.

`web/src/main.js`:

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import './assets/main.css'
createApp(App).use(createPinia()).use(router).mount('#app')
```

- [ ] **Step 4: Run tests + manual check**

```bash
npm test --workspace=web            # PASS
npm run dev                         # visit http://localhost:5173 → redirected to /login; login with seeded organizer works end-to-end against the running server
```

- [ ] **Step 5: Commit** `git add web && git commit -m "feat: web shell — router, api client, auth store, login, layout"`

---
