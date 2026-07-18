# Trip Planner Implementation Plan — Part 3 of 3 (UI, Dashboard, Archive, Ship — Tasks 13–22)

> Read Part 1 (`2026-07-18-trip-planner-part1-foundation.md`) first — its **Global Constraints** and **Parallel Execution Guide** apply to every task here. Server API contracts consumed by these tasks are defined in Part 2.

---

# UI task conventions (applies to T13–T18)

All Wave-3 UI tasks follow the same pattern — read this block plus your task:

- **Overwrite only your own placeholder views** (created in T6); add your own store/component files. Never touch `router.js`, `client.js`, `App.vue`, another task's views, or `main.css`.
- Stores: Pinia options API, state + async actions calling `api`/`participantApi` from `web/src/api/client.js`. Every action rethrows `ApiError` after storing `this.error = e.message`; views show `store.error` in a `.card` error box.
- AI buttons: render only when `useAuthStore().aiEnabled`; otherwise show text "AI disabled — set LLM_PROVIDER". While an AI call runs show a disabled "Generating…" state. AI results land in a local `draft` ref rendered as an editable preview with **Apply** / **Discard** buttons — Apply calls the corresponding save endpoint (drafts never auto-save; brief §7 human-in-the-loop).
- Tests: one Vitest file per store, mocking `fetch` (pattern from T6's `auth.test.js`) asserting each action hits the right URL/method and updates state. Component tests not required.
- Verify step (every UI task): `npm test --workspace=web` green, then `npm run dev` + manual walkthrough of the listed acceptance criteria against the real server (seed organizer from T1).
- Commit message given per task.

---

## Task 13: People & documents UI

**Wave 3. Depends on:** T6, T4, T7.

**Files:**
- Overwrite: `web/src/views/PeopleListView.vue`, `web/src/views/PersonDetailView.vue`
- Create: `web/src/stores/people.js`, `web/src/components/PersonForm.vue`, `web/src/components/DocumentList.vue`
- Test: `web/src/stores/people.test.js`

**Store contract** (`usePeopleStore`): state `{people: [], current: null, documents: [], error: null}`; actions `fetchPeople()`, `fetchPerson(id)` (also `fetchDocuments(id)`), `createPerson(fields)` → person, `updatePerson(id, fields)`, `deletePerson(id)`, `uploadDocument(personId, formData)`, `deleteDocument(docId)` — URLs exactly per T4/T7 contracts.

**Acceptance criteria:**
- `/people`: list with name, home city, dietary badge; "Add person" opens `PersonForm` (all §4.1 fields; interests as comma-separated input → array; dietary/pace/budget_band as selects with blank option).
- `/people/:id`: editable form + `DocumentList`: table of docs (type, number, expiry with `.badge-warn` when past), upload form (file input + type select + optional number/expiry), download link (`/api/documents/:id/file`), delete with `confirm()`.
- Delete person surfaces the 409 `TRIP_MEMBER` message inline.

Commit: `git add web && git commit -m "feat: people directory + documents UI"`

---

## Task 14: Trip UI — list, creation wizard, detail, dates, goals, destination

**Wave 3. Depends on:** T6, T5, T12.

**Files:**
- Overwrite: `web/src/views/TripsListView.vue`, `web/src/views/TripNewView.vue`, `web/src/views/TripDetailView.vue`
- Create: `web/src/stores/trips.js`, `web/src/components/TripWizard.vue`, `web/src/components/DateWindowsEditor.vue`, `web/src/components/GoalsEditor.vue`, `web/src/components/DestinationPanel.vue`, `web/src/components/TripTabs.vue`
- Test: `web/src/stores/trips.test.js`

**Store contract** (`useTripsStore`): state `{trips: [], current: null, candidates: [], error: null, aiBusy: false}`; actions `fetchTrips()`, `fetchTrip(id)`, `createTrip(payload)` → trip, `updateTrip(id, partial)`, `setStatus(id, status)`, `saveWindows(id, windows)`, `addGoal(id, goal)` / `updateGoal(goalId, goal)` / `deleteGoal(goalId)`, `addParticipant(id, personId)` / `removeParticipant(id, personId)`, `fetchCandidates(id)`, `addCandidate(id, fields)`, `aiSuggest(id)`, `decide(candidateId)`, `deleteCandidate(candidateId)` — URLs per T5/T12.

**Acceptance criteria:**
- `/` lists trips grouped by status with destination + dates + participant count; card links to `/trips/:id`.
- `/trips/new`: `TripWizard` — 4 steps in one component (Basics: name/description/origin/vibe-tags · Dates: mode radio → confirmed shows start/end, slight shows anchor+flex_days, broad shows `DateWindowsEditor` · Destination: decided (text input) vs open · Participants: checkbox list from people store, link to add new person). Submit → `createTrip` (+ `saveWindows` for broad) → navigate to trip.
- `/trips/:id`: `TripTabs` (Overview | Budget | Itinerary | Checklists | Readiness | Archive → the sibling routes); Overview shows/edits basics + status advance button (Plan → Confirm → Activate) surfacing `NOT_READY`/`BAD_TRANSITION` errors verbatim; `DateWindowsEditor` + `GoalsEditor` inline; `DestinationPanel`: candidate cards (name, rationale, best dates, est budget, caveats, source badge), "Suggest with AI" button (per UI conventions), "Mark decided" per card, manual-add form.
- Participants section: add/remove from directory; per participant a "Create link" button → calls T8 endpoint, shows the raw URL ONCE in a copy-to-clipboard box with warning "shown only once", plus revoke button on active links (list via `GET /api/trips/:id/links`). *(Link management lives here, not in readiness.)* Add store actions `createLink(tripId, personId)`, `fetchLinks(tripId)`, `revokeLink(linkId)`.

Commit: `git add web && git commit -m "feat: trip list, wizard, detail, destination + links UI"`

---

## Task 15: Budget UI

**Wave 3. Depends on:** T6, T9.

**Files:**
- Overwrite: `web/src/views/TripBudgetView.vue`
- Create: `web/src/stores/budget.js`, `web/src/components/BudgetTable.vue`
- Test: `web/src/stores/budget.test.js`

**Store contract** (`useBudgetStore`): state `{lines: [], total: 0, equal_share: 0, participant_count: 0, overrides: [], draft: null, error: null, aiBusy: false}`; actions `fetchBudget(tripId)`, `saveLines(tripId, lines)`, `saveOverrides(tripId, overrides)`, `aiDraft(tripId)` (fills `draft`), `applyDraft(tripId)` (PUT draft lines then clears draft).

**Acceptance criteria:** editable 8-row category table (label, estimate number input, basis text) with live total; per-person panel (count, equal share, override rows with person select + amount + note); "AI draft" per UI conventions — draft renders as a second comparison column with Apply/Discard.

Commit: `git add web && git commit -m "feat: budget UI with AI draft compare"`

---

## Task 16: Itinerary UI

**Wave 3. Depends on:** T6, T10.

**Files:**
- Overwrite: `web/src/views/TripItineraryView.vue`
- Create: `web/src/stores/itinerary.js`, `web/src/components/DayCard.vue`, `web/src/components/ItineraryItemForm.vue`
- Test: `web/src/stores/itinerary.test.js`

**Store contract** (`useItineraryStore`): state `{days: [], draft: null, dayDrafts: {}, error: null, aiBusy: false}`; actions `fetchItinerary(tripId)`, `init(tripId)`, `addItem(dayId, item)`, `updateItem(itemId, item)`, `deleteItem(itemId)`, `reorder(dayId, itemIds)`, `aiDraft(tripId)`, `applyDraft(tripId)`, `aiRegenDay(dayId, instruction)` (fills `dayDrafts[dayId]`), `applyDay(dayId)`.

**Acceptance criteria:** "Initialize days" button when empty (explains it needs confirmed dates; surfaces `NO_DATES`); `DayCard` per day: date header, item list with category icon/time/title/location/cost, add/edit via `ItineraryItemForm`, up/down reorder buttons (call `reorder`); whole-trip "AI draft" preview grouped by day with Apply/Discard; per-day "Regenerate" with optional instruction input ("more relaxed") showing that day's draft with Apply/Discard.

Commit: `git add web && git commit -m "feat: itinerary UI — day editor, AI draft, per-day regen"`

---

## Task 17: Checklists UI

**Wave 3. Depends on:** T6, T11.

**Files:**
- Overwrite: `web/src/views/TripChecklistsView.vue`
- Create: `web/src/stores/checklists.js`, `web/src/components/ChecklistCard.vue`
- Test: `web/src/stores/checklists.test.js`

**Store contract** (`useChecklistsStore`): state `{checklists: [], templates: [], packingDraft: null, error: null, aiBusy: false}`; actions `fetchForTrip(tripId)`, `fetchTemplates()`, `createChecklist(payload)`, `deleteChecklist(id)`, `addItem(checklistId, item)`, `updateItem(itemId, fields)` (incl. done toggle), `deleteItem(itemId)`, `fromTemplate(tripId, templateId)`, `promoteToTemplate(checklistId, name)`, `aiPackingSuggest(checklistId)` (fills `packingDraft`), `applyPackingDraft(checklistId)` (POSTs each title as an item).

**Acceptance criteria:** trip page shows packing + task checklists as `ChecklistCard`s (checkbox items; task items also show assignee select from trip participants + due date, overdue = `.badge-warn`); "New checklist" (kind, name); "From template" picker; "Save as template" on each card; AI packing suggest per UI conventions.

Commit: `git add web && git commit -m "feat: checklists UI with templates + AI packing draft"`

---

## Task 18: Participant self-service pages (`/p/:token`)

**Wave 3. Depends on:** T6, T7, T8, T11. This is what group members see on their phones — keep it single-column, zero-nav, lightweight (brief §8 UX).

**Files:**
- Overwrite: `web/src/views/ParticipantView.vue`
- Create: `web/src/stores/participant.js`, `web/src/components/ParticipantProfileForm.vue`, `web/src/components/ParticipantDocs.vue`, `web/src/components/ParticipantChecklist.vue`
- Test: `web/src/stores/participant.test.js`

**Store contract** (`useParticipantStore`): state `{token: null, trip: null, person: null, profileConfirmed: false, documents: [], packing: [], tasks: [], error: null}`; actions `load(token)` (sets token, GET `/api/participant/me` + `/api/participant/documents` + `/api/participant/checklist` via `participantApi(token)`), `saveProfile(fields)`, `uploadDocument(formData)`, `deleteDocument(id)`, `tickItem(itemId, done)`.

**Acceptance criteria:**
- Route param token → `load()`; invalid/revoked/expired → full-page friendly message "This link is no longer valid — ask your trip organizer for a new one" (from 401), no redirect.
- Sections top-to-bottom: **Trip summary** (name, status, destination or "TBD", dates or windows, vibe tags, goals list — read-only); **Your details** (`ParticipantProfileForm` — all §4.1 fields, save button; success shows "Profile confirmed ✓"); **Your documents** (list + upload + delete, download own files); **Your checklist** (packing checkboxes + assigned tasks with due dates).
- No link/mention of other participants anywhere.

Commit: `git add web && git commit -m "feat: participant self-service page"`

---
## Task 19: Readiness dashboard (server + UI)

**Wave 4. Depends on:** T7, T8, T11, T14. Brief §6.

**Files:**
- Create: `server/src/routes/readiness.routes.js`, `web/src/stores/readiness.js`
- Overwrite: `web/src/views/TripReadinessView.vue`
- Test: `server/test/readiness.test.js`, `web/src/stores/readiness.test.js`

**Interfaces:**
- `GET /api/trips/:id/readiness` (requireOrganizer) →

```json
{
  "participants": [{ "person_id": "...", "name": "...", "profile_confirmed": 1,
    "docs_count": 2, "doc_warnings": [{ "doc_type": "passport", "expiry_date": "2026-09-01", "level": "expired" }],
    "has_active_link": true }],
  "decisions": { "dates_confirmed": false, "destination_decided": true, "budget_drafted": true, "itinerary_days": 4 },
  "checklists": { "total_items": 20, "done_items": 12, "overdue": [{ "title": "Book bus", "due_date": "2026-07-01", "assignee_name": "Asha" }] }
}
```

- `dates_confirmed` = `date_mode='confirmed' AND start_date AND end_date`; `destination_decided` = `destination_mode='decided' AND destination`; `budget_drafted` = any `budget_lines` row with estimate > 0; `doc_warnings` from `expiryWarnings(db, tripId)` (T7) filtered per person; `has_active_link` = non-revoked, non-expired `participant_links` row exists; `overdue` = undone items with `due_date < today` across the trip's checklists.

- [ ] **Step 1: Failing server test** — seed a trip exercising every field (one participant confirmed with healthy docs + active link, one missing everything, an expired doc, an overdue task), assert the exact JSON shape above.
- [ ] **Step 2: Run** `npm test --workspace=server -- readiness` — FAIL.
- [ ] **Step 3: Implement route** (single module; reuse `expiryWarnings`; plain SQL aggregates).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: UI.** Store: `{data: null, error: null}`, action `fetch(tripId)`. View (per T13–T18 UI conventions): decisions row of ✓/✗ `.badge-ok`/`.badge-warn` chips (Dates, Destination, Budget, Itinerary); participant grid table (name | profile ✓ | docs count | doc warnings inline | link active); checklist progress bar (`done/total`) + overdue list. Store test mocks fetch.
- [ ] **Step 6: Verify + commit** — `npm test` both workspaces green; manual walkthrough; `git add . && git commit -m "feat: readiness dashboard"`

---

## Task 20: Archive, actuals, clone-as-template (server + UI)

**Wave 4. Depends on:** T9, T10, T11, T14. Brief §4.9, §5.8.

**Files:**
- Create: `server/src/routes/archive.routes.js`, `web/src/stores/archive.js`
- Overwrite: `web/src/views/TripArchiveView.vue`
- Test: `server/test/archive.test.js`, `web/src/stores/archive.test.js`

**Interfaces:**
- `POST /api/trips/:id/archive {notes?, photo_links?: string[]}` (requireOrganizer) → 200 `{archive}`. Transaction: build `snapshot_json` = `JSON.stringify({trip: tripToJson(db, trip), budget: <GET-budget shape>, itinerary: <GET-itinerary shape>, checklists: <trip checklists with items>})`; insert `archives` row; set trip `status='archived', archived_at=datetime()`; revoke all active participant links. 409 `ALREADY_ARCHIVED` if archive exists. Allowed from any non-archived status.
- `GET /api/trips/:id/archive` → `{archive: {snapshot: <parsed>, notes, photo_links, archived_at}, actuals: [{category, amount}]}` | 404 `NOT_ARCHIVED`.
- `PUT /api/trips/:id/archive {notes?, photo_links?}` → update those two fields only.
- `PUT /api/trips/:id/actuals {actuals: [{category, amount}]}` → replace-all (category must be in T9's `CATEGORIES`) → `{actuals}`.
- `POST /api/trips/:id/clone {name*}` → 201 `{trip}`. Copies from source trip (archived or not): `vibe_tags, origin_city, currency`, goals (title/notes only — no fixed dates/places), participants (`profile_confirmed=0`), budget lines (`estimate` kept as starting point, basis kept), checklists+items (`done=0`, assignees cleared, due dates cleared). New trip: `status='idea'`, `date_mode='broad'`, no dates/windows, `destination_mode='open'`, `destination=NULL`, no links, no itinerary, no candidates.

- [ ] **Step 1: Failing server tests** — archive: snapshot contains budget total + itinerary days, status flips, links revoked, second archive → 409; actuals replace-all + bad category → 400; clone: new trip has copied participants/budget/checklists but no dates/destination/links, source untouched.
- [ ] **Step 2: Run** `npm test --workspace=server -- archive` — FAIL.
- [ ] **Step 3: Implement** (import `tripToJson` from trips routes, `CATEGORIES` from budget routes; whole archive + clone each inside `db.transaction`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: UI.** Store actions: `fetchArchive(tripId)`, `archive(tripId, {notes, photo_links})`, `saveArchiveMeta`, `saveActuals`, `clone(tripId, name)` → returns new trip id for redirect. View: pre-archive → "Archive this trip" form (notes textarea, photo links list input) with `confirm()`; post-archive → read-only snapshot summary (dates, destination, budget est vs actuals table with per-category delta, itinerary day count), editable actuals + notes + photo links, and "Clone as new trip" (name prompt → navigate to `/trips/<newId>`).
- [ ] **Step 6: Verify + commit** — tests green; manual: archive a seeded trip, enter actuals, clone it; `git add . && git commit -m "feat: archive, actuals, clone-as-template"`

---

## Task 21: Deployment packaging — static serving, Docker, docs

**Wave 5. Depends on:** all server tasks. Brief §8.

**Files:**
- Create: `server/src/plugins/static.js`, `Dockerfile`, `docker-compose.yml`, `README.md`, `docs/backup.md`
- Test: `server/test/static.test.js`

**Interfaces:** production mode serves the built SPA from the API server (single port); `docker compose up` is the blessed deployment.

- [ ] **Step 1: Static plugin** — `server/src/plugins/static.js` (autoloaded; no frozen-file edits):

```js
import fp from 'fastify-plugin'
import fstatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist')
export default fp(async function staticPlugin(app) {
  if (!existsSync(dist)) return   // dev/test: Vite serves the SPA
  await app.register(fstatic, { root: dist })
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api') ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No such route' } })
      : reply.sendFile('index.html'))
})
```

Test: with a temp `web/dist/index.html` absent, `/api/nope` → 404 JSON (this is also the SPA-fallback contract test — write it to pass in both modes by asserting the JSON 404 for `/api/*`).

- [ ] **Step 2: Docker.** `Dockerfile` (multi-stage): stage 1 `node:22-slim` → `npm ci` + `npm run build --workspace=web`; stage 2 `node:22-slim` → copy `server/`, `web/dist/`, root `package*.json`, `npm ci --omit=dev --workspace=server`, `CMD ["node","server/src/server.js"]`. `docker-compose.yml`: one service, `ports: ["3000:3000"]`, `env_file: .env`, volume `./data:/app/data`.
- [ ] **Step 3: Docs.** `README.md`: what it is (link `docs/brief.md`), quickstart (bare-node and compose), seeding the first organizer, env var table (every var in `.env.example` explained), HTTPS note (run behind a reverse proxy — the app never does TLS). `docs/backup.md`: everything lives in `data/` (SQLite db + uploads); backup = stop app (or use `sqlite3 .backup`), copy `data/`, restore = put it back; suggest a cron line.
- [ ] **Step 4: Verify** — `npm run build && docker compose up --build` → login, create trip, upload doc, all via `http://localhost:3000` (no Vite). `npm test` green.
- [ ] **Step 5: Commit** `git add . && git commit -m "feat: production static serving, Docker packaging, ops docs"`

---

## Task 22: E2E smoke test — the participant-link flow end-to-end

**Wave 5. Depends on:** everything. Brief §11 ("thin e2e over the participant-link flow is strongly recommended"). API-level (no browser): a Node script that boots the real server on a temp DB and walks the golden path.

**Files:**
- Create: `e2e/smoke.mjs`, plus root `package.json` script (`"e2e": "node e2e/smoke.mjs"` — root package.json is frozen; add this script via `npm pkg set scripts.e2e="node e2e/smoke.mjs"` which is the one sanctioned exception, or ship `e2e/README` saying run directly. Prefer `node e2e/smoke.mjs` documented in README).
- Modify: `README.md` (add "Smoke test" section — T21 created it, T22 runs after; same wave but sequence T21 → T22 within the wave, or merge both into one agent).

**Flow the script must assert (using `fetch` against `http://localhost:<random port>`, `DB_PATH` + `UPLOADS_DIR` pointed at a temp dir, `LLM_PROVIDER=mock` with a tiny helper HTTP-mock? — no: mock driver is in-process. For e2e run with `LLM_PROVIDER=none` and assert the 503 path for AI, all manual paths fully):**

1. Seed organizer via `server/scripts/seed-organizer.js` (child_process) → login → cookie.
2. Create 2 people, one veg. Create trip (broad window, open destination, both participants).
3. Add manual destination candidate → decide → trip fields updated.
4. Set confirmed dates via PUT + status `planning` → `confirmed`.
5. Create participant link → **as participant (bearer)**: GET me (no other participants leaked), PUT profile (confirms), upload a small PDF buffer, GET checklist.
6. Budget: PUT two lines, check `equal_share`. AI draft → expect 503 `AI_DISABLED`.
7. Itinerary init → add item → reorder.
8. Checklist from scratch + tick item as participant.
9. Readiness: assert confirmed profile + doc count + decisions flags.
10. Archive with notes → status archived, link now 401. Clone → new idea trip with participants + budget lines.
11. Print `SMOKE OK` and exit 0; any assertion failure exits 1.

- [ ] **Step 1: Write `e2e/smoke.mjs`** implementing the flow above with plain `node:assert` (each numbered stage in a labeled function; log stage names as they pass).
- [ ] **Step 2: Run** `node e2e/smoke.mjs` — Expected: `SMOKE OK`.
- [ ] **Step 3: Commit** `git add e2e README.md && git commit -m "test: e2e smoke — full organizer + participant golden path"`

---

## Spec Coverage Map (brief § → tasks)

| Brief section | Tasks |
|---|---|
| §3 Roles & access (organizer auth, tokens, participant scope) | T1, T2, T8, T18 |
| §4.1 Person directory / reuse | T4, T13, T18 |
| §4.2 Travel documents, expiry, access control | T7, T13, T18, T19 |
| §4.3 Trip, vibe, goals, lifecycle | T5, T14 |
| §4.4 Dates (organizer-only, 3 modes) | T5, T14 |
| §4.5 Destination (pre-decided / AI candidates / decide) | T12, T14 |
| §4.6 Budget categories, per-person, AI draft, scenario compare (per-candidate `est_budget_per_person`) | T9, T12, T15 |
| §4.7 Itinerary, AI draft, per-day regen, constraints | T10, T16 |
| §4.8 Checklists, templates, AI packing, participant ticks | T11, T17, T18 |
| §4.9 Archive, actuals, photo links, clone | T20 |
| §5 Flows 1–8 | T14 (1,3,4), T8+T18 (2), T15 (5), T16 (6), T17+T19 (7), T20 (8) |
| §6 Readiness dashboard | T19 |
| §7 AI integration (adapter, schemas, degradation, privacy) | T3 + privacy/disabled tests in T9–T12 |
| §8 NFRs (scale, security, backup, deploy, mobile UX) | T1 (secrets/hashing), T7 (file access), T8 (rate limit), T21 (deploy/backup), T6/T18 (mobile) |
| §9 Out of scope | enforced by absence — no chat/polls/notifications/payments anywhere |
| §11 Delegated choices | resolved: Fastify, no ORM (better-sqlite3), no component lib, Pinia, JWT-cookie sessions, 10 MB uploads, Vitest + API-level e2e (T22) |
