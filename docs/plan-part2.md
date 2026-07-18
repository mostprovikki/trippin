# Trip Planner Implementation Plan — Part 2 of 3 (Wave-2 Domain APIs, Tasks 7–12)

> Read Part 1 (`2026-07-18-trip-planner-part1-foundation.md`) first — its **Global Constraints** and **Parallel Execution Guide** apply to every task here. Part 3 covers Tasks 13–22.

---

## Task 7: Documents API — upload, download, expiry warnings

**Wave 2. Depends on:** T4. Brief §4.2. Files under `UPLOADS_DIR`, never web-served directly; access = organizers OR the owning participant.

**Files:**
- Create: `server/src/routes/documents.routes.js`, `server/src/lib/expiry.js`
- Test: `server/test/documents.test.js`, `server/test/expiry.test.js`

**Interfaces:**
- Document JSON: `{id, person_id, doc_type, doc_number, expiry_date, original_name, mime_type, size_bytes, uploaded_at}` (never expose `file_path`).
- Organizer routes (requireOrganizer): `POST /api/people/:personId/documents` (multipart fields: `file`*, `doc_type`*, `doc_number`, `expiry_date`) → 201 `{document}` | 413 over 10 MB | 400 `BAD_DOC_TYPE`; `GET /api/people/:personId/documents` → `{documents}`; `GET /api/documents/:id/file` → file stream with `content-disposition: attachment; filename="<original_name>"`; `DELETE /api/documents/:id` → 204 (also unlinks file).
- Participant routes (requireParticipant, own person only): `GET /api/participant/documents`, `POST /api/participant/documents` (same multipart), `GET /api/participant/documents/:id/file` (404 if not own), `DELETE /api/participant/documents/:id` (404 if not own).
- `server/src/lib/expiry.js`: `export function expiryWarnings(db, tripId)` → `[{person_id, person_name, document_id, doc_type, expiry_date, level}]` where `level='expired'` if `expiry_date < tripEnd` else `'warning'` if `expiry_date < tripEnd + 6 months`. `tripEnd` = `trips.end_date`, else latest `trip_date_windows.end_date`, else today. Consumed by T19.
- Storage layout: `UPLOADS_DIR/<person_id>/<document_id>` (no extension; mime + original name live in DB). Register `@fastify/multipart` inside this route module with `{ limits: { fileSize: 10 * 1024 * 1024 } }`.

- [ ] **Step 1: Failing tests.** `server/test/expiry.test.js` (pure function):

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, createPerson, createTrip } from './helpers.js'
import { expiryWarnings } from '../src/lib/expiry.js'

describe('expiryWarnings', () => {
  it('flags expired and <6mo-after-trip docs, ignores healthy ones', async () => {
    const { db } = await makeTestApp()
    const t = createTrip(db, { end_date: '2026-10-06', date_mode: 'confirmed', start_date: '2026-10-02' })
    const p = createPerson(db, { name: 'Asha' })
    db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p.id)
    const ins = db.prepare(`INSERT INTO documents (id,person_id,doc_type,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,'x','x','application/pdf',1)`)
    ins.run('d1', p.id, 'passport', '2026-09-01')   // expired before trip end
    ins.run('d2', p.id, 'visa', '2027-01-01')       // within 6 months after
    ins.run('d3', p.id, 'national_id', '2030-01-01') // fine
    const w = expiryWarnings(db, t.id)
    expect(w.map(x => [x.document_id, x.level])).toEqual([['d1', 'expired'], ['d2', 'warning']])
  })
})
```

`server/test/documents.test.js`: multipart upload via `form-data`-style payload with `app.inject` (build body with `new FormData()` and `Blob` — Node 20 supports both; pass `payload: form` is not supported by inject, so construct multipart manually or use the documented light-my-request FormData support in Fastify 5: `app.inject({method:'POST', url, headers: form.getHeaders?.() , body: form})`. Use the simplest working approach: `payload` = FormData instance is supported by light-my-request ≥6). Tests: organizer upload→201 + list shows metadata without `file_path`; download streams same bytes with attachment header; participant (bearer token seeded like T1's foundation test) can upload/list/download OWN docs, gets 404 for another person's doc id; oversize 11 MB blob → 413; `doc_type:'other'` accepted, `doc_type:'junk'` → 400.

- [ ] **Step 2: Run** `npm test --workspace=server -- documents expiry` — Expected: FAIL.
- [ ] **Step 3: Implement.** `expiry.js`:

```js
export function expiryWarnings(db, tripId) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId)
  if (!trip) return []
  const tripEnd = trip.end_date
    || db.prepare('SELECT max(end_date) e FROM trip_date_windows WHERE trip_id = ?').get(tripId).e
    || new Date().toISOString().slice(0, 10)
  const horizon = new Date(tripEnd); horizon.setMonth(horizon.getMonth() + 6)
  const horizonIso = horizon.toISOString().slice(0, 10)
  return db.prepare(`SELECT d.id document_id, d.doc_type, d.expiry_date, p.id person_id, p.name person_name
    FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
    JOIN documents d ON d.person_id = p.id
    WHERE tp.trip_id = ? AND d.expiry_date IS NOT NULL AND d.expiry_date < ?
    ORDER BY d.expiry_date`).all(tripId, horizonIso)
    .map(r => ({ ...r, level: r.expiry_date < tripEnd ? 'expired' : 'warning' }))
}
```

`documents.routes.js` skeleton — implement fully:

```js
import { randomUUID } from 'node:crypto'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import multipart from '@fastify/multipart'
import { config } from '../config.js'
import { httpError } from '../lib/errors.js'

const DOC_TYPES = ['passport','visa','national_id','driving_license','vaccination','other']

export default async function routes(app) {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

  async function saveUpload(req, personId, reply) {
    const parts = req.parts()
    let file = null; const fields = {}
    for await (const part of parts) {
      if (part.type === 'file') {
        const id = randomUUID()
        const dir = join(config.uploadsDir, personId)
        await mkdir(dir, { recursive: true })
        const path = join(dir, id)
        await pipeline(part.file, createWriteStream(path))   // throws on fileSize limit → 413 via error handler
        file = { id, path, original_name: part.filename, mime_type: part.mimetype }
      } else fields[part.fieldname] = part.value
    }
    if (!file || !DOC_TYPES.includes(fields.doc_type)) { httpError(reply, 400, 'BAD_DOC_TYPE', 'file and valid doc_type required'); return null }
    const { statSync } = await import('node:fs')
    app.db.prepare(`INSERT INTO documents (id,person_id,doc_type,doc_number,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(file.id, personId, fields.doc_type, fields.doc_number ?? null,
      fields.expiry_date ?? null, file.path, file.original_name, file.mime_type, statSync(file.path).size)
    return app.db.prepare(`SELECT id,person_id,doc_type,doc_number,expiry_date,original_name,mime_type,size_bytes,uploaded_at
      FROM documents WHERE id = ?`).get(file.id)
  }
  function sendFile(reply, row) {
    reply.header('content-disposition', `attachment; filename="${row.original_name.replace(/"/g, '')}"`)
    reply.type(row.mime_type)
    return reply.send(createReadStream(row.file_path))
  }
  // organizer: POST/GET /people/:personId/documents, GET /documents/:id/file, DELETE /documents/:id (unlink file, ignore fs errors)
  // participant: same four under /participant/documents*, scoped to req.participant.personId (404 NOT_FOUND if doc.person_id differs)
}
```

- [ ] **Step 4: Run** `npm test --workspace=server -- documents expiry` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: travel documents upload/download + expiry warnings"`

---

## Task 8: Participant links API + participant profile self-service

**Wave 2. Depends on:** T4, T5. Brief §3, flows §5.2. Raw token shown ONCE; only sha256 hash stored.

**Files:**
- Create: `server/src/routes/links.routes.js`, `server/src/routes/participant.routes.js`
- Test: `server/test/links.test.js`, `server/test/participant.test.js`

**Interfaces:**
- Organizer (requireOrganizer):
  - `POST /api/trips/:tripId/participants/:personId/link {expires_in_days?}` → 201 `{token, url}` where `url = "/p/" + token`. Person must be a trip participant (404 otherwise). Creating a new link revokes any previous active link for that (trip, person).
  - `GET /api/trips/:tripId/links` → `{links: [{id, person_id, person_name, created_at, expires_at, revoked_at}]}` (no token/hash ever returned)
  - `POST /api/links/:linkId/revoke` → 204
- Participant (requireParticipant; register `@fastify/rate-limit` scoped in `participant.routes.js`: `max: 30, timeWindow: '1 minute'`):
  - `GET /api/participant/me` → `{trip: {id,name,description,status,vibe_tags,destination,date_mode,start_date,end_date,goals:[{title,fixed_date,fixed_place}]}, person: Person, profile_confirmed}` — trip fields are the participant-safe subset (no other participants' data), Person via `personToJson` from T4.
  - `PUT /api/participant/profile` (same body schema as T4 PUT minus `name`? — no: allow `name` too) → `{person}`; also sets `trip_participants.profile_confirmed = 1` for (tripId, personId).
- Token generation: `crypto.randomBytes(32).toString('base64url')` (43 chars, ≥128-bit per brief §8).

- [ ] **Step 1: Failing tests.** `links.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createPerson, createTrip } from './helpers.js'

function join(db, t, p) { db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p.id) }

describe('participant links', () => {
  it('creates link returning raw token once, stores only hash, /p url', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db); const t = createTrip(db); join(db, t, p)
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })
    expect(res.statusCode).toBe(201)
    const { token, url } = res.json()
    expect(url).toBe(`/p/${token}`); expect(token.length).toBeGreaterThanOrEqual(43)
    const row = db.prepare('SELECT * FROM participant_links').get()
    expect(row.token_hash).toBe(app.hashToken(token))
    expect(JSON.stringify(db.prepare('SELECT * FROM participant_links').all())).not.toContain(token)
  })
  it('new link revokes previous; revoke endpoint kills access; list hides tokens', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db); const t = createTrip(db); join(db, t, p)
    const mk = () => authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })
    const t1 = (await mk()).json().token
    const t2 = (await mk()).json().token
    const me = (tok) => app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${tok}` } })
    expect((await me(t1)).statusCode).toBe(401)
    expect((await me(t2)).statusCode).toBe(200)
    const links = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/links` })).json().links
    expect(links.find(l => !l.revoked_at)).toBeTruthy()
    const active = links.find(l => !l.revoked_at)
    await authedInject(app, cookie, { method: 'POST', url: `/api/links/${active.id}/revoke` })
    expect((await me(t2)).statusCode).toBe(401)
  })
  it('404 when person not on trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db); const t = createTrip(db)
    expect((await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants/${p.id}/link`, payload: {} })).statusCode).toBe(404)
  })
})
```

`participant.test.js`: seed link (insert hash of a known raw token like T1's foundation test); `GET /api/participant/me` returns trip subset (assert NO `participants` key in `trip`) + own person; `PUT /api/participant/profile {dietary:'vegan', interests:['food']}` updates person AND sets `profile_confirmed=1`; expired link (insert `expires_at` in the past) → 401.

- [ ] **Step 2: Run** `npm test --workspace=server -- links participant` — Expected: FAIL.
- [ ] **Step 3: Implement.** `links.routes.js` core:

```js
import { randomUUID, randomBytes } from 'node:crypto'
import { httpError } from '../lib/errors.js'

export default async function routes(app) {
  app.post('/trips/:tripId/participants/:personId/link', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const { tripId, personId } = req.params
    const member = app.db.prepare('SELECT 1 FROM trip_participants WHERE trip_id = ? AND person_id = ?').get(tripId, personId)
    if (!member) return httpError(reply, 404, 'NOT_FOUND', 'Person is not a participant of this trip')
    app.db.prepare('UPDATE participant_links SET revoked_at = datetime() WHERE trip_id = ? AND person_id = ? AND revoked_at IS NULL')
      .run(tripId, personId)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = req.body?.expires_in_days
      ? new Date(Date.now() + req.body.expires_in_days * 86400e3).toISOString() : null
    app.db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash,expires_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(), tripId, personId, app.hashToken(token), expiresAt)
    return reply.code(201).send({ token, url: `/p/${token}` })
  })
  // GET /trips/:tripId/links — join persons for person_name; SELECT id,person_id,created_at,expires_at,revoked_at only
  // POST /links/:linkId/revoke — set revoked_at, 204; 404 if unknown
}
```

`participant.routes.js`: register `@fastify/rate-limit` with `{ max: 30, timeWindow: '1 minute' }` in this plugin scope; `GET /participant/me` and `PUT /participant/profile` per contract, importing `personToJson` from `./people.routes.js` and reading trip + goals directly from db (participant-safe subset — build the object explicitly field-by-field, never spread the trip row).

- [ ] **Step 4: Run** `npm test --workspace=server -- links participant` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: tokenized participant links + participant self-service profile"`

---
## Task 9: Budget API — manual lines, per-person split, AI draft

**Wave 2. Depends on:** T3, T5. Brief §4.6.

**Files:**
- Create: `server/src/routes/budget.routes.js`, `server/src/llm/prompts/budget.js`
- Test: `server/test/budget.test.js`

**Interfaces:**
- `CATEGORIES = ['primary_transport','secondary_transport','stay','food','activities','shopping','leisure','misc']` — defined and exported in `server/src/llm/prompts/budget.js`; `budget.routes.js` imports and **re-exports** it (T20 imports `CATEGORIES` from `budget.routes.js`). One-directional imports only: routes → prompts, never prompts → routes.
- Routes (requireOrganizer; all 404 `NOT_FOUND` on unknown trip):
  - `GET /api/trips/:id/budget` → `{lines:[{category,estimate,basis}] (all 8 categories, zero-filled), total, participant_count, equal_share, overrides:[{person_id,person_name,amount,note}]}` — `equal_share = (total - sum(override amounts)) / max(1, participant_count - overrides.length)`, rounded to 2 decimals.
  - `PUT /api/trips/:id/budget {lines:[{category,estimate,basis?}]}` → upsert listed categories (others untouched) → same shape as GET.
  - `PUT /api/trips/:id/budget/overrides {overrides:[{person_id,amount,note?}]}` → replace-all (person must be trip participant, else 400 `NOT_PARTICIPANT`) → same shape as GET.
  - `POST /api/trips/:id/budget/ai-draft` → `{lines:[{category,estimate,basis}]}` — **draft only, saves nothing**; UI applies via PUT. 503 `AI_DISABLED` when provider none.
- `server/src/llm/prompts/budget.js`: `export function buildBudgetPrompt(trip, participantCount)` → `{system, prompt, schema}`. Prompt includes destination, dates/window, origin_city, group size, vibe_tags, currency. Schema: `{type:'object', required:['lines'], properties:{lines:{type:'array', minItems:8, maxItems:8, items:{type:'object', required:['category','estimate','basis'], properties:{category:{enum:CATEGORIES}, estimate:{type:'number', minimum:0}, basis:{type:'string'}}}}}}`.

- [ ] **Step 1: Failing tests** — `server/test/budget.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'
import { buildBudgetPrompt } from '../src/llm/prompts/budget.js'

describe('budget', () => {
  it('GET zero-fills all 8 categories; PUT upserts; equal_share math with overrides', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = createTrip(db, { destination: 'Goa' })
    const [a, b, c] = [createPerson(db), createPerson(db), createPerson(db)]
    for (const p of [a, b, c]) db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p.id)
    let res = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget` })).json()
    expect(res.lines).toHaveLength(8); expect(res.total).toBe(0)
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/budget`,
      payload: { lines: [{ category: 'stay', estimate: 12000, basis: '4n x 3k' }, { category: 'food', estimate: 6000 }] } })
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/budget/overrides`,
      payload: { overrides: [{ person_id: c.id, amount: 3000, note: 'skipping stay' }] } })
    res = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/budget` })).json()
    expect(res.total).toBe(18000)
    expect(res.equal_share).toBe(7500)   // (18000-3000)/2
  })
  it('ai-draft returns validated lines from mock, saves nothing; 503 when disabled', async () => {
    process.env.LLM_PROVIDER = 'mock'
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const t = createTrip(db, { destination: 'Goa', start_date: '2026-10-02', end_date: '2026-10-06' })
    const CATS = ['primary_transport','secondary_transport','stay','food','activities','shopping','leisure','misc']
    queueMock({ lines: CATS.map(c => ({ category: c, estimate: 1000, basis: 'guess' })) })
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/budget/ai-draft` })
    expect(res.statusCode).toBe(200); expect(res.json().lines).toHaveLength(8)
    expect(app.db.prepare('SELECT count(*) c FROM budget_lines').get().c).toBe(0)
    process.env.LLM_PROVIDER = 'none'
    const off = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/budget/ai-draft` })
    expect(off.statusCode).toBe(503); expect(off.json().error.code).toBe('AI_DISABLED')
  })
  it('privacy: prompt contains no participant PII', async () => {
    const { db } = await makeTestApp()
    const t = createTrip(db, { destination: 'Goa' })
    const { prompt, system } = buildBudgetPrompt(t, 6)
    for (const leak of ['Asha', '@', 'phone']) expect((system + prompt).includes(leak)).toBe(false)
    expect(prompt).toMatch(/6/) // group size present
  })
})
```

- [ ] **Step 2: Run** `npm test --workspace=server -- budget` — Expected: FAIL.
- [ ] **Step 3: Implement** both files per contract. `buildBudgetPrompt` sketch:

```js
export const CATEGORIES = ['primary_transport','secondary_transport','stay','food','activities','shopping','leisure','misc']
export function buildBudgetPrompt(trip, participantCount) {
  const dates = trip.start_date ? `${trip.start_date} to ${trip.end_date}` : 'dates not final (assume typical season)'
  return {
    system: 'You are a travel budget estimator. Output JSON only.',
    prompt: `Estimate a per-trip group budget in ${trip.currency} for:
Destination: ${trip.destination || 'not decided'} | From: ${trip.origin_city || 'unknown'} | Dates: ${dates}
Group size: ${participantCount} | Vibe: ${JSON.parse(trip.vibe_tags || '[]').join(', ') || 'general'}
Return one line per category (exactly these 8: primary_transport, secondary_transport, stay, food, activities, shopping, leisure, misc), each with a numeric total-group "estimate" and a one-line "basis" explaining the math.`,
    schema: { /* schema from Interfaces above */ }
  }
}
```

Route `POST /budget/ai-draft`: `if (aiGuard(reply)) return` → `generate(buildBudgetPrompt(trip, count))` → return `{lines}`; catch `LlmValidationError`/`LlmHttpError` → 502 `AI_FAILED`.

- [ ] **Step 4: Run** `npm test --workspace=server -- budget` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: budget lines, per-person split, AI draft"`

---

## Task 10: Itinerary API — days/items CRUD, AI draft, per-day regen

**Wave 2. Depends on:** T3, T5. Brief §4.7. AI drafts are never auto-saved; explicit apply endpoint.

**Files:**
- Create: `server/src/routes/itinerary.routes.js`, `server/src/llm/prompts/itinerary.js`
- Test: `server/test/itinerary.test.js`

**Interfaces:**
- Item JSON: `{id, position, title, time_range, location, category('travel'|'food'|'activity'|'rest'|'logistics'), est_cost, notes, link}`. Day JSON: `{id, day_date, position, items: Item[]}`.
- Routes (requireOrganizer):
  - `GET /api/trips/:id/itinerary` → `{days: Day[]}` ordered by position.
  - `POST /api/trips/:id/itinerary/init` → creates one `itinerary_days` row per date from `start_date..end_date` (400 `NO_DATES` if trip dates not confirmed); idempotent (existing days kept, missing added, days outside range + their items deleted) → `{days}`.
  - `POST /api/days/:dayId/items {title*, ...}` → 201 Item (position = max+1); `PUT /api/items/:itemId` (partial) → Item; `DELETE /api/items/:itemId` → 204; `PUT /api/days/:dayId/items/order {item_ids: string[]}` → reorders → `{items}`.
  - `POST /api/trips/:id/itinerary/ai-draft` → `{days:[{day_date, items:[{title,time_range,location,category,est_cost,notes}]}]}` draft only.
  - `POST /api/trips/:id/itinerary/apply-draft {days}` (same shape as draft) → replaces ALL items (init days first if missing; unknown `day_date` in payload → 400 `BAD_DAY`) → `{days}` full.
  - `POST /api/days/:dayId/ai-regen {instruction?}` → `{items:[...]}` draft for ONE day (prompt includes that day's current items + instruction like "more relaxed"); apply via existing item CRUD or `apply-day` — add `POST /api/days/:dayId/apply {items}` → replaces that day's items → `{day}`.
- `server/src/llm/prompts/itinerary.js`: `buildItineraryPrompt(trip, goals, dietSummary, days)` and `buildDayRegenPrompt(trip, day, currentItems, instruction)` → `{system, prompt, schema}`. Prompt MUST: pin goals with `fixed_date` to that exact date ("NON-NEGOTIABLE: <title> on <date> at <place>"), state diet mix as counts only (e.g. "4 of 6 eat veg — every food stop needs a veg option"), include pace. `dietSummary` computed in route: `SELECT dietary, count(*) FROM persons JOIN trip_participants ... GROUP BY dietary` → "2 veg, 1 vegan, 3 non_veg of 6 total".
- Schema for draft: days array, each `{day_date: string(date), items: array of {title*, category* enum, time_range, location, est_cost number, notes}}`.

- [ ] **Step 1: Failing tests** — `server/test/itinerary.test.js` covering: init creates N days for confirmed dates + is idempotent + 400 NO_DATES without dates; item CRUD + reorder round-trip; ai-draft (mock queued with 2 days) returns draft and DB unchanged; apply-draft persists and GET returns it; ai-regen (mock) returns items for one day, apply replaces only that day; privacy test on `buildItineraryPrompt` (no names/emails, diet appears only as counts); goal pinning test: prompt string contains `NON-NEGOTIABLE` + fixed_date. Use the same patterns as T9's tests (mock provider via env + `queueMock`).

- [ ] **Step 2: Run** `npm test --workspace=server -- itinerary` — Expected: FAIL.
- [ ] **Step 3: Implement** per contract. Notable logic — `init`:

```js
function dateRange(start, end) {
  const out = []; const d = new Date(start)
  while (d.toISOString().slice(0, 10) <= end) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
  return out
}
// init: if (!trip.start_date || !trip.end_date) 400 NO_DATES
// wrap in db.transaction: delete days (cascade items) where day_date outside range; insert missing dates with position = index
```

`apply-draft` wraps in `db.transaction`: init-equivalent first, `DELETE FROM itinerary_items WHERE day_id IN (trip's days)`, then insert items per day with positions.

- [ ] **Step 4: Run** `npm test --workspace=server -- itinerary` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: itinerary days/items, AI draft + per-day regen"`

---

## Task 11: Checklists API — packing/tasks, templates, AI packing suggestions, participant ticks

**Wave 2. Depends on:** T3, T4, T5. Brief §4.8.

**Files:**
- Create: `server/src/routes/checklists.routes.js`, `server/src/llm/prompts/packing.js`
- Test: `server/test/checklists.test.js`

**Interfaces:**
- Checklist JSON: `{id, trip_id, is_template(0|1), kind('packing'|'tasks'), name, trip_type_tags: string[], items: [{id, title, assignee_person_id, assignee_name, due_date, done(0|1), position}]}`.
- Organizer routes (requireOrganizer):
  - `GET /api/checklists?template=1` → templates; `GET /api/trips/:tripId/checklists` → trip's checklists (both `{checklists}` with items).
  - `POST /api/checklists {kind*, name*, trip_id | is_template:1, trip_type_tags?}` → 201.
  - `PUT /api/checklists/:id {name?, trip_type_tags?}` → checklist; `DELETE /api/checklists/:id` → 204.
  - `POST /api/checklists/:id/items {title*, assignee_person_id?, due_date?}` → 201 item; `PUT /api/checklist-items/:itemId {title?, assignee_person_id?, due_date?, done?}`; `DELETE /api/checklist-items/:itemId` → 204.
  - `POST /api/trips/:tripId/checklists/from-template {template_id}` → 201 copy (items copied, `done=0`, assignees cleared).
  - `POST /api/checklists/:id/promote-to-template {name}` → 201 new template (copies items, strips assignee/done/due).
  - `POST /api/checklists/:id/ai-packing-suggest` → `{items:[{title}]}` draft (400 `NOT_PACKING` if kind≠packing; 404 if template — needs trip context). Prompt from `buildPackingPrompt(trip, durationDays, checklistName)`: destination, month/season, duration, vibe tags. Privacy rule applies.
- Participant routes (requireParticipant):
  - `GET /api/participant/checklist` → `{packing: [items assigned to me or unassigned from my trip's packing lists], tasks: [items assigned to me]}` (each item includes `checklist_name`).
  - `PUT /api/participant/checklist-items/:itemId {done}` → item; 404 if item not in participant's trip or (for tasks) not assigned to them.

- [ ] **Step 1: Failing tests** covering: create trip checklist + items + tick via organizer PUT; from-template copies with done=0/assignees cleared; promote-to-template strips per-trip fields; ai-packing-suggest with mock returns titles + 400 on tasks-kind + 503 disabled; participant sees own packing items and can tick, cannot tick an item from another trip (404); privacy test on `buildPackingPrompt`.
- [ ] **Step 2: Run** `npm test --workspace=server -- checklists` — Expected: FAIL.
- [ ] **Step 3: Implement** per contract (CRUD patterns identical to T4/T5; copies wrapped in `db.transaction`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: checklists, templates, AI packing suggestions, participant ticks"`

---

## Task 12: Destination candidates API + AI suggestions

**Wave 2. Depends on:** T3, T5. Brief §4.5.

**Files:**
- Create: `server/src/routes/destinations.routes.js`, `server/src/llm/prompts/destinations.js`
- Test: `server/test/destinations.test.js`

**Interfaces:**
- Candidate JSON = `destination_candidates` row (id, trip_id, name, rationale, best_dates, est_budget_per_person, caveats, source, decided, created_at).
- Routes (requireOrganizer):
  - `GET /api/trips/:id/candidates` → `{candidates}` (decided first, then created_at).
  - `POST /api/trips/:id/candidates {name*, rationale?, best_dates?, est_budget_per_person?, caveats?}` → 201 (source `manual`).
  - `POST /api/trips/:id/candidates/ai-suggest` → generates 3–7 candidates and **saves them** (source `ai`) → `{candidates}` (all for trip). Repeat calls append (organizer deletes unwanted).
  - `POST /api/candidates/:id/decide` → transaction: set all trip's candidates `decided=0`, this one `decided=1`, update trip: `destination = candidate.name`, `destination_mode='decided'` → `{trip}` (via `tripToJson`).
  - `DELETE /api/candidates/:id` → 204 (400 `DECIDED` if decided=1).
- `buildDestinationPrompt(trip, participantCount, prefSummary)` → `{system, prompt, schema}`. `prefSummary` computed in route from participants: diet counts, top interests (aggregated tag counts), pace mix, budget-band mix — **counts only, no names**. Prompt includes vibe, goals (with fixed dates/places as constraints), date windows/season, origin, group size, currency. Schema: `{candidates: array 3..7 of {name*, rationale*, best_dates, est_budget_per_person number, caveats}}`.

- [ ] **Step 1: Failing tests** covering: manual candidate CRUD + list order; ai-suggest with mock saves rows with source='ai'; decide flips trip.destination/destination_mode and un-decides others; delete decided → 400; 503 when disabled; privacy test (seed persons with distinctive names/emails as trip participants, assert prompt lacks them but contains aggregate like "2 of 3").
- [ ] **Step 2: Run** `npm test --workspace=server -- destinations` — Expected: FAIL.
- [ ] **Step 3: Implement** per contract.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat: destination candidates + AI suggestions + decide"`

---
