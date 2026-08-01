# Neon + AppSail Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Orchestration model (user directive):** the main session (Fable 5) is the orchestrator —
> it dispatches one fresh **Sonnet** subagent per task (`model: "sonnet"` on the Agent tool),
> reviews each task's diff before proceeding, and runs the gates itself. Subagents implement;
> the orchestrator validates. Do not let a subagent mark its own task complete without the
> orchestrator re-running that task's test command.

**Goal:** Move Tripper from better-sqlite3 + local-disk uploads on a single VM to Neon Postgres (`@neondatabase/serverless`) + Zoho Stratus storage, deployed as one Fastify process on Catalyst AppSail serving API + SPA same-origin.

**Architecture:** One persistent Node 22 process on AppSail (source+command deploy). New async DB layer (`makeDb`) with a `?`→`$n` compiler and AsyncLocalStorage-based transactions that nest via savepoints — spike-verified against the real Neon project from AppSail itself. Storage goes behind a two-driver interface (local disk for dev/tests/VM-fallback, Stratus with signed-URL reads for AppSail). Auth, LLM provider, and the frontend are unchanged.

**Tech Stack:** Fastify 5, Node 22, `@neondatabase/serverless` (prod) + `pg` (dev/test) against Postgres 18, `zcatalyst-sdk-node` (Stratus only), vitest, Vue 3 SPA (untouched).

## Global Constraints

- **Decisions already made (do not relitigate):** SPA served from AppSail (no Slate, no CORS work); all-at-once cutover to AppSail; **fresh Postgres schema — no data migration**; source+command deploy mode (Dockerfile stays for VM fallback, untouched by this plan).
- Node ≥ 22 everywhere (AppSail stack `node22` — verified live; native WebSocket, no `ws` package).
- ESM only (`import`), match existing code style: no semicolons where absent today, 2-space indent.
- Prod driver `neon`, dev/test driver `pg` — both behind the same `makeDb` surface; **route code never imports a driver directly**.
- SQL placeholder style in route code **stays `?`** — the db layer compiles to `$n`. Don't hand-rewrite placeholders.
- All timestamps remain **TEXT** columns in SQLite's `datetime()` format (`YYYY-MM-DD HH24:MI:SS`, UTC) so JSON API responses are byte-identical — do NOT switch to TIMESTAMPTZ (it would serialize as ISO dates and change the API).
- Booleans remain INTEGER 0/1 (JS truthiness checks like `row.decided === 1` must keep working).
- `lastInsertRowid` must not appear anywhere (TEXT UUID PKs) — grep before starting each sweep; its presence is a plan bug, stop and report.
- Test/dev Postgres: Docker on **127.0.0.1:43105** (tripper's PORT_BASE block is 43100; +5 assigned here). Never `localhost` (proxied on this machine).
- Secrets: `server/.env.spike` (Neon URLs, git-ignored) already exists; deploy env goes in `server/.env.appsail` (git-ignored). `app-config.json` is generated with secrets inline — the generated `dist-appsail/` must be git-ignored.
- Git: commit locally after each task; **never push**; stay on branch `restructure/zoho-catalyst-migration`.
- Every task ends with its listed test command green AND `npm test --workspace=server` not more broken than before the task (sweeps go file-group by file-group; untouched groups stay red until their task — track the expected-red list in the orchestrator, not by skipping tests).

## Conversion Recipe (referenced by Tasks 5–9)

Applies mechanically to every route/plugin file. The db API is defined in Task 2.

| # | better-sqlite3 pattern | replacement |
|---|---|---|
| R1 | `app.db.prepare(S).get(a, b)` | `await app.db.get(S, [a, b])` |
| R2 | `app.db.prepare(S).all(a)` | `await app.db.all(S, [a])` |
| R3 | `app.db.prepare(S).run(a)` | `await app.db.run(S, [a])` |
| R4 | `app.db.prepare(S).run(a).changes` | `(await app.db.run(S, [a])).changes` |
| R5 | `const tx = app.db.transaction((x) => { ... }); tx(arg)` | `await app.db.tx(async () => { ... })` — inline `arg`, add `await` to every db call inside |
| R6 | helper fn doing db work, called from routes | make it `async`, `await` at every call site (including inside `.map(...)` — use `Promise.all` or a `for` loop; prefer `for...of` when order matters) |
| R7 | `datetime()` inside route SQL text | `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')` |
| R8 | `date('now')` inside route SQL text | `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')` |
| R9 | `IFNULL(` | `COALESCE(` |
| R10 | `INSERT OR IGNORE INTO t ...` | `INSERT INTO t ... ON CONFLICT DO NOTHING` |
| R11 | `INSERT OR REPLACE INTO t (cols) VALUES ...` | `INSERT ... ON CONFLICT (pk) DO UPDATE SET col = EXCLUDED.col, ...` (list every non-PK column) |
| R12 | `group_concat(x)` | `string_agg(x, ',')` |
| R13 | `json_group_array(x)` | `json_agg(x)` — and note PG returns real JSON, not a string; check the consumer |
| R14 | `LIMIT ?`, `OFFSET ?` | unchanged (compiler handles it) |
| R15 | sqlite `LIKE` is case-insensitive; PG's isn't | any user-facing search `LIKE` becomes `ILIKE` |

Worked example (from `trips.routes.js:137`, the date-window replace):

```js
// BEFORE
const tx = app.db.transaction((windows) => {
  app.db.prepare('DELETE FROM trip_date_windows WHERE trip_id = ?').run(req.params.id)
  for (const w of windows) app.db.prepare(
    'INSERT INTO trip_date_windows (id, trip_id, start_date, end_date, note) VALUES (?,?,?,?,?)'
  ).run(randomUUID(), req.params.id, w.start_date, w.end_date, w.note ?? null)
})
tx(req.body.windows)

// AFTER
await app.db.tx(async () => {
  await app.db.run('DELETE FROM trip_date_windows WHERE trip_id = ?', [req.params.id])
  for (const w of req.body.windows) await app.db.run(
    'INSERT INTO trip_date_windows (id, trip_id, start_date, end_date, note) VALUES (?,?,?,?,?)',
    [randomUUID(), req.params.id, w.start_date, w.end_date, w.note ?? null]
  )
})
```

Test files convert with the same recipe (they use `db.prepare` via `helpers.js` and directly).

---

### Task 1: Postgres dev/test infrastructure

**Files:**
- Create: `docker-compose.pg.yml`
- Modify: `package.json` (root — add `db:up`/`db:down` scripts)
- Modify: `server/package.json` (add deps)
- Modify: `.gitignore` (add `dist-appsail/`)

**Interfaces:**
- Produces: a Postgres 18 reachable at `postgres://tripper:tripper@127.0.0.1:43105/tripper_test`; env name `TEST_DATABASE_URL` (that value is its default). Deps `@neondatabase/serverless`, `pg` installed.

- [ ] **Step 1: Write the compose file**

```yaml
# docker-compose.pg.yml — dev/test Postgres only (prod is Neon; VM fallback has its own compose)
services:
  pg:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: tripper
      POSTGRES_PASSWORD: tripper
      POSTGRES_DB: tripper_test
    ports:
      - "127.0.0.1:43105:5432"   # tripper's port block is 43100+; +5 = local PG. Never localhost (proxied here).
    tmpfs:
      - /var/lib/postgresql/data   # throwaway by design; tests create schemas per run
```

- [ ] **Step 2: Add npm scripts to root `package.json`**

```json
"db:up": "docker compose -f docker-compose.pg.yml up -d --wait",
"db:down": "docker compose -f docker-compose.pg.yml down"
```

- [ ] **Step 3: Install deps**

Run: `npm install --workspace=server @neondatabase/serverless pg`

- [ ] **Step 4: Verify container + connectivity (watch it fail first: run the node probe BEFORE `db:up`, expect ECONNREFUSED; then `npm run db:up` and expect the version row)**

Run: `node -e "const {Pool}=await import('pg').then(m=>m.default);const p=new Pool({connectionString:'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'});console.log((await p.query('select version()')).rows[0]);await p.end()" --input-type=module`
Expected: `PostgreSQL 18.x ...`

- [ ] **Step 5: Add `dist-appsail/` and `server/.env.appsail` to `.gitignore`** (`.env.*` already covers the latter — verify with `git check-ignore server/.env.appsail`)

- [ ] **Step 6: Register port 43105** — append `"tripper-pg-test": 43105` to `~/.claude/ports.json` under tripper's block (read the file first; follow its existing shape).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "infra: dockerized Postgres 18 for dev/test (127.0.0.1:43105), add pg + neon driver deps"`

---

### Task 2: The db layer (`makeDb`)

**Files:**
- Rewrite: `server/src/db.js` (delete better-sqlite3 code entirely)
- Modify: `server/src/config.js` (add `databaseUrl`, `dbDriver`, AppSail port)
- Test: `server/test/db.test.js` (new)

**Interfaces:**
- Produces (everything later tasks call):
  - `makeDb({ url?, driver?, searchPath? }) → Promise<db>` — driver `'pg' | 'neon'`
  - `db.all(sql, params?) → Promise<row[]>`
  - `db.get(sql, params?) → Promise<row | undefined>`
  - `db.run(sql, params?) → Promise<{ changes: number }>`
  - `db.exec(sql) → Promise<void>` (multi-statement, no params — migrations only)
  - `db.tx(fn) → Promise<ret>` — `fn: async () => ...`; **nested `tx` calls become savepoints** (the better-sqlite3 nesting analog, spike-verified)
  - `db.close() → Promise<void>`
  - `compileSql(sql) → string` (exported for its unit test)
- SQL text uses `?` placeholders; params always an array.

- [ ] **Step 1: Write failing tests**

```js
// server/test/db.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeDb, compileSql } from '../src/db.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'

describe('compileSql', () => {
  it('numbers ? placeholders', () => {
    expect(compileSql('SELECT * FROM t WHERE a = ? AND b = ?')).toBe('SELECT * FROM t WHERE a = $1 AND b = $2')
  })
  it('ignores ? inside string literals', () => {
    expect(compileSql("SELECT 'a?b' AS x WHERE y = ?")).toBe("SELECT 'a?b' AS x WHERE y = $1")
  })
})

describe('makeDb (pg driver)', () => {
  let db
  beforeAll(async () => {
    db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: `dbtest_${process.pid}` })
    await db.exec(`CREATE SCHEMA IF NOT EXISTS dbtest_${process.pid}`)
    await db.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v INTEGER)')
    await db.run('DELETE FROM kv')
  })
  afterAll(async () => { await db.exec(`DROP SCHEMA dbtest_${process.pid} CASCADE`); await db.close() })

  it('get/all/run round-trip with ? params', async () => {
    const r = await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['a', 1])
    expect(r.changes).toBe(1)
    expect((await db.get('SELECT v FROM kv WHERE k = ?', ['a'])).v).toBe(1)
    expect(await db.all('SELECT k FROM kv')).toHaveLength(1)
  })

  it('tx commits, and a thrown error rolls back', async () => {
    await db.tx(async () => { await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['c1', 1]) })
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['c1'])).toBeTruthy()
    await expect(db.tx(async () => {
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['r1', 1])
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['r1'])).toBeUndefined()
  })

  it('nested tx = savepoint: inner rollback keeps outer work (the spike scenario)', async () => {
    await db.tx(async () => {
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['outer', 1])
      await expect(db.tx(async () => {
        await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['inner', 2])
        throw new Error('inner-fail')
      })).rejects.toThrow('inner-fail')
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['after', 3])
    })
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['outer'])).toBeTruthy()
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['inner'])).toBeUndefined()
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['after'])).toBeTruthy()
  })

  it('statements inside tx share one connection (temp table visible)', async () => {
    await db.tx(async () => {
      await db.exec('CREATE TEMP TABLE tmp_tx (i INT) ON COMMIT DROP')
      await db.run('INSERT INTO tmp_tx VALUES (?)', [1])
      expect((await db.get('SELECT count(*)::int AS n FROM tmp_tx')).n).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace=server -- db.test.js` → FAIL (`makeDb is not a function` / better-sqlite3 exports gone)

- [ ] **Step 3: Implement `server/src/db.js`**

```js
import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from './config.js'

const als = new AsyncLocalStorage()

// '?' → '$1..$n', skipping single-quoted literals. Route SQL keeps sqlite-style '?'.
export function compileSql(sql) {
  let out = '', n = 0, inStr = false
  for (const c of sql) {
    if (c === "'") { inStr = !inStr; out += c; continue }
    out += (!inStr && c === '?') ? `$${++n}` : c
  }
  return out
}

// Serverless networks drop idle connections; retry exactly once, and never inside a tx.
const isConnErr = (e) => ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01'].includes(e.code)
  || /Connection terminated|socket closed|connection closed/i.test(e.message || '')

export async function makeDb({ url = config.databaseUrl, driver = config.dbDriver, searchPath } = {}) {
  let Pool
  if (driver === 'neon') {
    const neon = await import('@neondatabase/serverless')
    neon.neonConfig.webSocketConstructor = globalThis.WebSocket // node22 native — verified on AppSail
    Pool = neon.Pool
  } else {
    Pool = (await import('pg')).default.Pool
  }
  const pool = new Pool({
    connectionString: url,
    max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {})
  })
  // An idle client dying must not crash the process (pg emits 'error' on the pool).
  pool.on('error', (e) => console.error('db pool idle error (discarded):', e.message))

  async function query(sql, params = []) {
    const store = als.getStore()
    const compiled = compileSql(sql)
    if (store) return store.client.query(compiled, params)
    try { return await pool.query(compiled, params) }
    catch (e) { if (isConnErr(e)) return pool.query(compiled, params); throw e }
  }

  return {
    async all(sql, params) { return (await query(sql, params)).rows },
    async get(sql, params) { return (await query(sql, params)).rows[0] },
    async run(sql, params) { return { changes: (await query(sql, params)).rowCount ?? 0 } },
    async exec(sql) { // multi-statement text, no params (simple-query protocol)
      const store = als.getStore()
      if (store) { await store.client.query(sql); return }
      const client = await pool.connect()
      try { await client.query(sql) } finally { client.release() }
    },
    async tx(fn) {
      const cur = als.getStore()
      if (cur) { // nested: savepoint, mirroring better-sqlite3's nesting semantics
        const name = `sp${++cur.depth}`
        await cur.client.query(`SAVEPOINT ${name}`)
        try { const r = await fn(); await cur.client.query(`RELEASE SAVEPOINT ${name}`); return r }
        catch (e) { await cur.client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {}); throw e }
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const r = await als.run({ client, depth: 0 }, fn)
        await client.query('COMMIT')
        return r
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally { client.release() }
    },
    async close() { await pool.end() }
  }
}
```

- [ ] **Step 4: Extend `server/src/config.js`** — add after `dbPath` (keep `dbPath` for now; Task 13 removes it):

```js
  databaseUrl: process.env.DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test',
  dbDriver: process.env.DB_DRIVER || 'pg',
```

and change the `port:` line so AppSail's injected port wins:

```js
  port: Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT) || Number(process.env.PORT) || portBase + 1,
```

- [ ] **Step 5: Run tests** — `npm run db:up && npm test --workspace=server -- db.test.js` → all PASS. (Every other server test now fails at import — expected; Tasks 3–9 fix them group by group.)

- [ ] **Step 6: Commit** — `git commit -am "feat(db): async makeDb with pg/neon drivers, ?→\$n compiler, ALS tx with savepoint nesting"`

---

### Task 3: Migrations to Postgres + async runner

**Files:**
- Replace: `server/src/migrations/001_init.sql`, `002_organizer_scoping.sql`, `003_checklist_organizer.sql` → single `server/src/migrations/001_init.sql` (fresh-start decision: collapse, in Postgres dialect)
- Rewrite: `server/src/migrate.js`
- Test: `server/test/migrate.test.js` (new)

**Interfaces:**
- Consumes: `db.exec/all/run/tx` from Task 2.
- Produces: `runMigrations(db) → Promise<void>`, idempotent; final schema = current sqlite schema (all three files merged), Postgres dialect.

- [ ] **Step 1: Translate the schema.** Read all three current `.sql` files, merge into one `001_init.sql`, applying exactly these rules (nothing else changes):
  - `DEFAULT (datetime())` → `DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
  - `DEFAULT (date('now'))` → `DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
  - `TEXT/INTEGER/REAL` column types, `CHECK`, `REFERENCES ... ON DELETE CASCADE`, composite PKs: keep verbatim (all valid PG).
  - sqlite `CREATE INDEX IF NOT EXISTS` lines: keep (valid PG).
  - Comments (`-- JSON string[]`): keep.
  - 002/003 are `ALTER TABLE ... ADD COLUMN` + index/backfill steps — fold the end-state columns directly into the 001 `CREATE TABLE`s; skip backfill `UPDATE`s (no data).

- [ ] **Step 2: Write failing test**

```js
// server/test/migrate.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeDb } from '../src/db.js'
import { runMigrations } from '../src/migrate.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
const schema = `mig_${process.pid}`

describe('runMigrations', () => {
  let db
  beforeAll(async () => {
    db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: schema })
    await db.exec(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  })
  afterAll(async () => { await db.exec(`DROP SCHEMA ${schema} CASCADE`); await db.close() })

  it('applies, is idempotent, and creates the core tables', async () => {
    await runMigrations(db)
    await runMigrations(db) // second run: no-op, no throw
    for (const t of ['organizers', 'persons', 'documents', 'trips', 'trip_date_windows', 'participant_links'])
      expect(await db.get('SELECT 1 AS ok FROM ' + t + ' LIMIT 1').then(() => true, () => false), t).toBe(true)
    expect((await db.all('SELECT name FROM _migrations'))).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run to verify failure** — `npm test --workspace=server -- migrate.test.js` → FAIL

- [ ] **Step 4: Rewrite `server/src/migrate.js`**

```js
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
```

- [ ] **Step 5: Run tests** — `npm test --workspace=server -- migrate.test.js` → PASS
- [ ] **Step 6: Commit** — `git commit -am "feat(db): Postgres schema (fresh-start collapse of 3 sqlite migrations), async runner"`

---

### Task 4: Async bootstrap — app, server, test helpers

**Files:**
- Modify: `server/src/app.js` (await migrations, close db on app close)
- Modify: `server/src/server.js`
- Rewrite: `server/test/helpers.js` (schema-per-app; async fixtures)

**Interfaces:**
- Consumes: `makeDb`, `runMigrations`.
- Produces (all tests rely on these exact signatures):
  - `makeTestApp() → Promise<{ app, db }>` (unchanged shape, now Postgres-backed)
  - `createOrganizer(db, fields?) → Promise<{ id, email, name }>`
  - `defaultOrganizer(db) → Promise<{ id, email, name }>`
  - `loginOrganizer(app, db) → Promise<{ cookie, organizer }>`
  - `createPerson(db, fields?) → Promise<row>`, `createTrip(db, fields?) → Promise<row>`
  - `authedInject(app, cookie, opts)` (unchanged)

- [ ] **Step 1: `server/src/app.js`** — two lines change:

```js
export async function buildApp({ db }) {
  await runMigrations(db)
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  app.decorate('db', db)
  app.addHook('onClose', () => db.close())
  // ... rest unchanged
```

- [ ] **Step 2: `server/src/server.js`**

```js
import { buildApp } from './app.js'
import { makeDb } from './db.js'
import { config } from './config.js'
const app = await buildApp({ db: await makeDb() })
app.listen({ port: config.port, host: '0.0.0.0' })
```

- [ ] **Step 3: Rewrite `server/test/helpers.js`** (every fixture goes async; schema-per-app isolates tests exactly like the old temp-file-per-app did):

```js
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { makeDb } from '../src/db.js'
import { buildApp } from '../src/app.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
let n = 0

export async function makeTestApp() {
  const schema = `tp_${process.pid}_${++n}`
  const admin = await makeDb({ url: TEST_URL, driver: 'pg' })
  await admin.exec(`CREATE SCHEMA ${schema}`)
  await admin.close()
  const db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: schema })
  const app = await buildApp({ db }) // migrations land in the schema via search_path
  return { app, db }
}
export async function createOrganizer(db, { email = 'test@x.dev', password = 'pass1234', name = 'Tester' } = {}) {
  const id = randomUUID()
  await db.run('INSERT INTO organizers (id,email,password_hash,name) VALUES (?,?,?,?)',
    [id, email, bcrypt.hashSync(password, 8), name])
  return { id, email, name }
}
export async function defaultOrganizer(db) {
  const row = await db.get("SELECT id, email, name FROM organizers WHERE email = 'test@x.dev'")
  return row || createOrganizer(db)
}
export async function loginOrganizer(app, db) {
  const org = await defaultOrganizer(db)
  return { cookie: `tp_session=${app.signSession(org)}`, organizer: org }
}
export function authedInject(app, cookie, opts) {
  return app.inject({ ...opts, headers: { cookie, ...(opts.headers || {}) } })
}
export async function createPerson(db, fields = {}) {
  const id = randomUUID()
  const organizerId = fields.organizer_id ?? (await defaultOrganizer(db)).id
  await db.run('INSERT INTO persons (id,organizer_id,name) VALUES (?,?,?)', [id, organizerId, fields.name || 'P ' + id.slice(0, 4)])
  for (const [k, v] of Object.entries(fields)) if (k !== 'name' && k !== 'organizer_id')
    await db.run(`UPDATE persons SET ${k} = ? WHERE id = ?`, [v, id])
  return db.get('SELECT * FROM persons WHERE id = ?', [id])
}
export async function createTrip(db, fields = {}) {
  const id = randomUUID()
  const organizerId = fields.organizer_id ?? (await defaultOrganizer(db)).id
  await db.run('INSERT INTO trips (id,organizer_id,name) VALUES (?,?,?)', [id, organizerId, fields.name || 'Trip ' + id.slice(0, 4)])
  for (const [k, v] of Object.entries(fields)) if (k !== 'name' && k !== 'organizer_id')
    await db.run(`UPDATE trips SET ${k} = ? WHERE id = ?`, [v, id])
  return db.get('SELECT * FROM trips WHERE id = ?', [id])
}
```

- [ ] **Step 4: Verify the two infra tests go green** — `npm test --workspace=server -- foundation.test.js static.test.js`. These may still reference helpers synchronously (`loginOrganizer(app, db)` without await, etc.) — fix those call sites in the two test files as part of this task (recipe R6).
Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: async bootstrap — Postgres-backed buildApp, schema-per-app test fixtures"`

---

### Tasks 5–9: Route + test sweeps (apply the Conversion Recipe)

Common shape for all five — per task:
1. `grep -n "prepare(\|\.transaction(\|datetime(\|date('now')\|IFNULL\|OR IGNORE\|OR REPLACE\|group_concat\|json_group_array\|lastInsertRowid" <files>` and convert every hit per the recipe (route files AND their test files).
2. Handlers already `async` stay; any non-async handler that now awaits becomes `async`.
3. Run that group's tests; fix until green.
4. Verify no group regression: previously-green groups still pass.
5. Commit.

### Task 5: Sweep A — plugins + auth/people/health/search

**Files:** Modify: `server/src/plugins/auth.js`, `server/src/plugins/ownership.js`, `server/src/routes/auth.routes.js`, `server/src/routes/people.routes.js`, `server/src/routes/health.routes.js`, `server/src/routes/search.routes.js` + Tests: `server/test/auth.test.js`, `ownership.test.js`, `people.test.js`, `search.test.js`

**Interfaces:** Produces async plugin decorators — every later task's routes call these, so their exact shapes matter: `app.requireOrganizer` / `app.requireParticipant` (Fastify preHandlers, now with awaited db lookups inside) and **`app.ownedPerson(req, personId)` / any `owned*` helper in ownership.js becomes `async` — later sweeps must `await` them** (they already do in `documents.routes.js:66` style call sites — verify each).

- [ ] **Step 1: Convert the two plugins** (recipe R1–R6). `auth.js:14-23` reads cookie/bearer then does db lookups — each `.get()` gains await; the preHandler functions become async.
- [ ] **Step 2: Convert the four route files.** `search.routes.js`: apply R15 (`LIKE` → `ILIKE`) to user-query filters.
- [ ] **Step 3: Convert their test files** (async helpers from Task 4: every `loginOrganizer`/`createPerson`/`createTrip`/direct `db.prepare` call site).
- [ ] **Step 4: Run** — `npm test --workspace=server -- auth.test.js ownership.test.js people.test.js search.test.js` → PASS (plus foundation/static/db/migrate still green).
- [ ] **Step 5: Commit** — `git commit -am "refactor(pg): async sweep — auth+ownership plugins, auth/people/health/search routes"`

### Task 6: Sweep B — trips + destinations

**Files:** Modify: `server/src/routes/trips.routes.js` (tx at :137 — the worked example above), `server/src/routes/destinations.routes.js` (tx at :93) + Tests: `trips.test.js`, `destinations.test.js`

- [ ] Steps 1–3: recipe; the two `db.transaction` sites become `db.tx` (R5).
- [ ] Step 4: Run — `npm test --workspace=server -- trips.test.js destinations.test.js` → PASS.
- [ ] Step 5: Commit — `git commit -am "refactor(pg): async sweep — trips + destinations (2 tx sites)"`

### Task 7: Sweep C — itinerary (the nested-transaction file)

**Files:** Modify: `server/src/routes/itinerary.routes.js` (tx at :80, :175, :209, :243 — and **:78's comment documents that the :80 helper is called from inside other transactions; it becomes a nested `db.tx` → savepoint, which Task 2 supports natively**) + Test: `itinerary.test.js`

- [ ] Steps 1–3: recipe. Preserve the nesting: the inner helper keeps its own `db.tx(...)` wrapper; do NOT flatten it into the callers.
- [ ] Step 4: Run — `npm test --workspace=server -- itinerary.test.js` → PASS.
- [ ] Step 5: Commit — `git commit -am "refactor(pg): async sweep — itinerary (5 tx sites incl. nested savepoint)"`

### Task 8: Sweep D — budget + checklists

**Files:** Modify: `server/src/routes/budget.routes.js` (tx :67, :104), `server/src/routes/checklists.routes.js` (tx :190, :212) + Tests: `budget.test.js`, `checklists.test.js`

- [ ] Steps 1–5 as above. Commit: `git commit -am "refactor(pg): async sweep — budget + checklists (4 tx sites)"`

### Task 9: Sweep E — archive, links, participant, readiness, ai/llm

**Files:** Modify: `server/src/routes/archive.routes.js` (tx :58, :105, :121), `links.routes.js`, `participant.routes.js`, `readiness.routes.js`, `ai.routes.js`, anything under `server/src/llm/` and `server/src/lib/` that touches db (grep first) + Tests: `archive.test.js`, `links.test.js`, `participant.test.js`, `readiness.test.js`, `llm.test.js`, `expiry.test.js`, `no-union-types.test.js`

- [ ] Steps 1–5 as above. After this task **the full server suite must be green**: `npm test --workspace=server`. Commit: `git commit -am "refactor(pg): async sweep — archive/links/participant/readiness/ai; full suite green"`

---

### Task 10: Storage interface + local driver + documents refactor

**Files:**
- Create: `server/src/storage/index.js`, `server/src/storage/local.js`
- Modify: `server/src/routes/documents.routes.js`, `server/src/app.js` (decorate), `server/src/config.js` (storage block)
- Test: `server/test/documents.test.js` (existing, updated), `server/test/storage-local.test.js` (new)

**Interfaces:**
- Produces `app.storage` with the contract both drivers implement:
  - `put(req, key, readableStream) → Promise<{ size }>`
  - `getDownload(req, { key, filename, mime }) → Promise<{ url } | { stream, filename, mime }>` — `url` ⇒ route replies 302; `stream` ⇒ route streams with content-disposition
  - `remove(req, key) → Promise<void>` (never throws on missing object)
- `documents.file_path` column now stores the **storage key** `"<personId>/<docId>"`, not a filesystem path (fresh start — no legacy rows).

- [ ] **Step 1: config** — add to `server/src/config.js`:

```js
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    stratusBucket: process.env.STRATUS_BUCKET || 'tripper'
  },
```

- [ ] **Step 2: failing test for the local driver**

```js
// server/test/storage-local.test.js
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { makeLocalStorage } from '../src/storage/local.js'

describe('local storage driver', () => {
  const storage = makeLocalStorage({ uploadsDir: mkdtempSync(join(tmpdir(), 'tp-store-')) })
  it('put → getDownload(stream) → remove round-trip', async () => {
    const { size } = await storage.put(null, 'p1/d1', Readable.from(Buffer.from('hello')))
    expect(size).toBe(5)
    const dl = await storage.getDownload(null, { key: 'p1/d1', filename: 'x.txt', mime: 'text/plain' })
    expect(dl.url).toBeUndefined()
    let body = ''
    for await (const chunk of dl.stream) body += chunk
    expect(body).toBe('hello')
    await storage.remove(null, 'p1/d1')
    await expect(storage.getDownload(null, { key: 'p1/d1', filename: 'x', mime: 't' })).rejects.toThrow()
  })
})
```

- [ ] **Step 3: implement `server/src/storage/local.js`**

```js
import { createWriteStream, createReadStream, statSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join, dirname } from 'node:path'
import { config } from '../config.js'

export function makeLocalStorage({ uploadsDir = config.uploadsDir } = {}) {
  const abs = (key) => join(uploadsDir, key)
  return {
    async put(_req, key, readable) {
      await mkdir(dirname(abs(key)), { recursive: true })
      await pipeline(readable, createWriteStream(abs(key)))
      return { size: statSync(abs(key)).size }
    },
    async getDownload(_req, { key, filename, mime }) {
      statSync(abs(key)) // throws if missing → route 404s upstream of this in practice
      return { stream: createReadStream(abs(key)), filename, mime }
    },
    async remove(_req, key) { try { await unlink(abs(key)) } catch { /* already gone */ } }
  }
}
```

and `server/src/storage/index.js`:

```js
import { config } from '../config.js'
import { makeLocalStorage } from './local.js'
export async function makeStorage(cfg = config) {
  if (cfg.storage.driver === 'stratus') {
    const { makeStratusStorage } = await import('./stratus.js') // lazy: SDK only loads on AppSail
    return makeStratusStorage(cfg)
  }
  return makeLocalStorage(cfg)
}
```

- [ ] **Step 4:** `app.js` gains `app.decorate('storage', await makeStorage())` (import at top) right after the db decorate.
- [ ] **Step 5: refactor `documents.routes.js`** — `saveUpload` pipes `part.file` to `app.storage.put(req, `${personId}/${id}`, part.file)` and inserts `size` from its return (drop `statSync`/`createWriteStream`/path imports); `sendFile(reply, row)` becomes:

```js
async function sendDoc(req, reply, row) {
  const dl = await app.storage.getDownload(req, { key: row.file_path, filename: row.original_name, mime: row.mime_type })
  if (dl.url) return reply.redirect(dl.url)
  reply.header('content-disposition', `attachment; filename="${dl.filename.replace(/"/g, '')}"`)
  reply.type(dl.mime)
  return reply.send(dl.stream)
}
```

and `removeDoc` calls `app.storage.remove(req, row.file_path)` after the row delete. All four file-serving/deleting routes pass `req` through.
- [ ] **Step 6:** check the web client tolerates a 302 on the file routes: `grep -rn "/file" web/src` — if downloads use `<a href>`/`window.open`, nothing to do (browser follows). If any uses `fetch`, convert that call site to setting `window.location` (same-origin 302 → cross-origin signed URL redirects don't carry CORS for fetch-read, but a navigation download doesn't need CORS).
- [ ] **Step 7: Run** — `npm test --workspace=server -- storage-local.test.js documents.test.js` → PASS; full suite green.
- [ ] **Step 8: Commit** — `git commit -am "feat(storage): driver interface + local driver; documents routes use storage keys"`

---

### Task 11: Stratus driver

**Files:**
- Create: `server/src/storage/stratus.js`
- Modify: `server/package.json` (add `zcatalyst-sdk-node`)

**Interfaces:**
- Consumes: the Task 10 contract. Spike-verified SDK calls: `catalyst.initialize(req)`, `.stratus().bucket(name)`, `bucket.generatePreSignedUrl(key, 'GET', { expiryIn: 300 })` → use `signed.signature`.

- [ ] **Step 1:** `npm install --workspace=server zcatalyst-sdk-node`
- [ ] **Step 2:** inspect the vendored SDK for the exact upload/delete method shapes before writing code: `grep -rn "putObject\|uploadObject\|deleteObject" server/node_modules/zcatalyst-sdk-node/lib/stratus/ | head`. Expected (per design doc's SDK inspection): `putObject(key, body)` and a delete method on the bucket. If names differ, adapt — the contract stays fixed.
- [ ] **Step 3: implement**

```js
// server/src/storage/stratus.js — the ONLY file in the app that imports a Zoho SDK.
import catalyst from 'zcatalyst-sdk-node'

export function makeStratusStorage(cfg) {
  const bucket = (req) => catalyst.initialize(req).stratus().bucket(cfg.storage.stratusBucket)
  return {
    async put(req, key, readable) {
      const chunks = []
      for await (const c of readable) chunks.push(c) // ≤10MB (multipart limit) — buffering is fine
      const buf = Buffer.concat(chunks)
      await bucket(req).putObject(key, buf)
      return { size: buf.length }
    },
    async getDownload(req, { key }) {
      const signed = await bucket(req).generatePreSignedUrl(key, 'GET', { expiryIn: 300 })
      return { url: signed.signature || signed.url }
    },
    async remove(req, key) {
      try { await bucket(req).deleteObject(key) } catch { /* orphan object beats a failed API delete */ }
    }
  }
}
```

- [ ] **Step 4:** no local test can exercise Stratus (SDK needs the Catalyst runtime context) — verification is live in Task 12's smoke. Ensure the full local suite is still green with `STORAGE_DRIVER` unset: `npm test --workspace=server`.
- [ ] **Step 5: Commit** — `git commit -am "feat(storage): Stratus driver (signed-URL reads), lazy-loaded"`

---

### Task 12: AppSail build + deploy + live smoke

**Files:**
- Create: `scripts/build-appsail.mjs`, `scripts/seed-organizer.mjs`, `server/.env.appsail.example`
- Modify: root `package.json` (script `deploy:appsail`)

**Interfaces:**
- Consumes: everything. Produces: the running app at the AppSail URL.

- [ ] **Step 1: env template** (`server/.env.appsail.example`; the real `.env.appsail` is git-ignored — copy the Neon URL from `server/.env.spike`):

```
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-....us-east-2.aws.neon.tech/neondb?sslmode=require
DB_DRIVER=neon
JWT_SECRET=generate-a-long-random-one
STORAGE_DRIVER=stratus
STRATUS_BUCKET=tripper
DEFAULT_CURRENCY=INR
LLM_PROVIDER=none
```

- [ ] **Step 2: build script** (`scripts/build-appsail.mjs`):

```js
#!/usr/bin/env node
// Assemble dist-appsail/: server (prod deps) + built SPA + app-config.json (secrets inlined — dir is git-ignored)
import { execSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-appsail')
rmSync(out, { recursive: true, force: true }); mkdirSync(out)
execSync('npm run build', { cwd: root, stdio: 'inherit' }) // web/dist
for (const p of ['server/src', 'server/package.json', 'server/package-lock.json', 'web/dist'])
  cpSync(join(root, p), join(out, p), { recursive: true })
execSync('npm ci --omit=dev', { cwd: join(out, 'server'), stdio: 'inherit' })
const env = Object.fromEntries(readFileSync(join(root, 'server/.env.appsail'), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
writeFileSync(join(out, 'app-config.json'), JSON.stringify({
  command: 'node server/src/server.js', build_path: '.', stack: 'node22',
  env_variables: env, memory: 256, scripts: {}
}, null, 2))
console.log('dist-appsail/ ready')
```

(`plugins/static.js` resolves `../../../web/dist` from `server/src/plugins` → `dist-appsail/web/dist` ✓; `config.js`'s dotenv miss is harmless — env comes from `env_variables`.)

- [ ] **Step 3: seed script** (`scripts/seed-organizer.mjs` — run locally against Neon; there is no signup endpoint):

```js
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
```

- [ ] **Step 4: deploy.** Catalyst CLI mechanics (verified this session — also in project memory `catalyst-cli-deploy-mechanics`): CLI at `~/.npm/_npx/5ae67a3bbbb048b8/node_modules/.bin/catalyst`; repo root needs one-time `catalyst init --project 97588000000014024 --org 933223382` (skip features with `printf '\n' |`), add `.catalystrc` + `catalyst.json` to `.gitignore`; then:

```bash
node scripts/build-appsail.mjs
printf 'N\n' | catalyst appsail:add --name tripper --source "$PWD/dist-appsail" --command "node server/src/server.js"
catalyst deploy --only appsail:tripper
```

- [ ] **Step 5: live smoke, in order** (URL printed by deploy, `https://tripper-<id>.development.catalystappsail.com`):
  1. `curl -s $URL/api/health` → 200
  2. `DATABASE_URL=<neon url> DB_DRIVER=neon node scripts/seed-organizer.mjs you@example.com <password> "You"`
  3. Login round-trip: `curl -c jar -s -X POST $URL/api/auth/login -H 'content-type: application/json' -d '{"email":"you@example.com","password":"<password>"}'` → 200 + `tp_session` in jar; `curl -b jar $URL/api/auth/me` → 200
  4. Create trip → 201; list trips → the trip comes back (proves Neon writes)
  5. Upload a small PDF via `curl -b jar -F 'file=@x.pdf' -F 'doc_type=other' $URL/api/people/<id>/documents` → 201; `curl -b jar -D - -o /dev/null $URL/api/documents/<docId>/file` → **302 with a `zohostratus.com` signed Location**; fetch that Location → 200 with the bytes (proves Stratus round-trip)
  6. Load `$URL/` in a browser → SPA renders, login works (proves static serving + same-origin cookies)
- [ ] **Step 6: Commit** — `git commit -am "feat(deploy): AppSail build+seed scripts, deployed and smoke-tested live"`

---

### Task 13: Cutover cleanup + full gates

**Files:**
- Modify: `server/package.json` (remove `better-sqlite3`), `server/src/config.js` (remove `dbPath`), root `package.json` `allowScripts` (drop better-sqlite3 entry)
- Delete: nothing else — Dockerfile/docker-compose stay as the VM-fallback (now pointing at Neon+local-disk via env if ever used)
- Modify: `CLAUDE.md` (Build & Test section: `npm run db:up` prerequisite), `README` if it describes sqlite

- [ ] **Step 1:** `npm uninstall --workspace=server better-sqlite3`; grep the tree for `better-sqlite3|openDb|getDb|dbPath` — zero hits outside docs/history.
- [ ] **Step 2: full gates** — `npm run db:up && npm test` (server + web, all green) and the e2e suite (`bd show trip-planner-aa8` has the gate list; run what exists today against a local stack: `npm run db:up && npm run dev` + the e2e script).
- [ ] **Step 3:** update the design doc's §4 table statuses to "shipped" and add a dated postscript: what deployed, the AppSail URL, first GB-hour/Neon-CU readings to check after a month.
- [ ] **Step 4: Commit** — `git commit -am "chore: drop better-sqlite3; docs updated — Neon+AppSail migration complete"`

---

## Self-review notes (done at plan time)

- **Spec coverage**: every §4 architecture-table row maps to tasks (Slate row is intentionally dead — user decision). Auth/LLM rows: no-op by design. Non-goals respected (VM compose untouched).
- **Type consistency**: `makeDb` surface (Task 2) matches every later call site; storage contract (Task 10) matches Task 11's driver and Task 10's route usage; helper signatures (Task 4) match sweep tasks' test edits.
- **Known judgment calls encoded**: TEXT timestamps preserved (API byte-compat); `?` placeholders kept via compiler; savepoint nesting preserved rather than flattened; Stratus buffering capped by the existing 10MB multipart limit.
- **Deliberately out of scope**: Slate, data migration, Oracle VM decommission, `zoho` LLM driver, Neon branching for CI.
