# Phase-aware Trip overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Trip overview as the phase-aware Monitor in `docs/design/tripper.md` §2 — "Who's missing what" first (restoring the doc-expiry warnings lost in 0xv.4, bead trip-planner-5p9), then the rest of the before-trip and during-trip layouts — and close the §9 data gaps they need. Then smoke-test every other surface against the identity.

**Architecture:** Server: extend `GET /api/trips/:id/readiness` with per-person gaps; add a change feed (`trip_events`) + per-organizer last-seen (`organizer_trip_views`); add recoverable participant-link tokens; add `booking_ref`/`phone`/`stay` to itinerary items and `emergency_info`/`required_doc_types` to trips. Web: `TripOverviewView.vue` becomes a thin phase switch over one card component per §2 card, each fed by the existing Pinia stores; pure logic (phase, reasons, next-item timing) lives in `web/src/utils/overview.js` with unit tests.

**Tech Stack:** Fastify + Postgres (`server/`, vitest with `makeTestApp`), Vue 3 + PrimeVue + Pinia (`web/`, vitest + happy-dom), Playwright-core browser gates (`e2e/`).

**Spec:** `docs/design/tripper.md` (agreed 2026-09-26) + mockup `docs/mockups/identity/trip-overview.html` Option 2. The mockup's palette (dense-product-ui `system.css`) is NOT a decision (§9); style with PrimeVue + `web/src/assets/main.css` tokens only.

## Decision taken: 5p9 ships as slice 1 of the Overview build, not as an interim list

Why: "Who's missing what" is the card the doc warnings belong in (§2, §6 "Missing"). The data
it needs (`doc_warnings`, `profile_confirmed`) already comes from `/readiness`. An interim row
list on the current Overview would be built once and deleted three tasks later, and would sit
next to the stat grid and Next-actions list that Task 5 removes. Task 1 therefore builds the
real card, at the top of today's Overview, and turns `qa-format-polish` step 4 green. Later
tasks rebuild the rest of the page around it.

## Owner decisions this plan needs (defaults marked; tasks that depend on them say so)

| # | Question | Default (recommended) | Blocks |
|---|---|---|---|
| D1 | "Copy ⟨name⟩'s link" must be one click (§1, §4), but tokens are stored only as hashes. Copying today means minting a new link, which revokes the one the person already has (People asks "Replace link?"). | **Store each new token encrypted (AES-256-GCM, key in env `LINK_TOKEN_KEY`)** so Copy re-reads it: one click, no revocation. Links minted before this have no recoverable token → Copy mints one (with the existing Replace confirm). Alt: no crypto; Copy only one-click when the person has no active link. | Task 2 |
| D2 | Which profile fields are "required" for §6 Missing? None are today; `profile_confirmed` is set by any save. | **phone, emergency_contact, dietary**, plus "hasn't confirmed their details" while `profile_confirmed = 0`. | Task 1 |
| D3 | "Visa not uploaded" (mockup) needs to know which docs a trip requires. | **Per-trip `required_doc_types` (multi-select of doc types) in Details ▾ Settings** (two clicks, §4). Default empty. Per-destination rules (visa lead time, country-specific 6-month rule) parked → §9 row. | Task 3 |
| D4 | Quick reference source (§9 gap). | **Stays = itinerary items with new category `stay`; "Call" = items with a new `phone`; local emergency numbers = trip text `emergency_info` edited in Details ▾ Destination.** Guides = any item today with a phone. | Task 6, 7 |
| D5 | Budget card "booked vs estimated": Budget has no booked flag. | **Card shows per-person estimate only** (`equal_share`), §9 row + follow-up bead for a booked flag. | Task 5 |
| D6 | "Since you last looked" — when does "last" move? | **On an Overview open more than 1 hour after the previous one** (a refresh doesn't wipe the feed). Feed = participant-originated changes only (profile save, doc upload, checklist tick via `/p/:token`). | Task 4 |

Every default above that changes `tripper.md` is written into §9 by the task that implements it.

## Global Constraints

- Every UI change cites a section of `docs/design/tripper.md` in its bead's design-gate note; any rule it bends gets a §9 changelog row in the same commit.
- Vocabulary (§6): Organizer, Participant, "⟨Name⟩'s link", Draft, Missing. Never: admin/owner/user, member/guest, token/magic link/invite, incomplete/pending.
- Overview: **no button in the page header**; actions live on the row they act on (§5). Never a bulk "copy all links" (§5, §7).
- One number, one place (§6): at rest the Overview shows only people missing `N of M`, days to go (or `Day N of M`), open checklist items, days planned `N of M`, per-person cost.
- Phone: columns stack left then right; during the trip the order is Today → Quick reference → Tomorrow → Before tomorrow (§2). Check at 390px (§4) — measure `scrollWidth`, headless Chrome clamps to 500px (memory note).
- Route SQL uses `?` placeholders only; no jsonb `?` operators (CLAUDE.md).
- Timestamps are TEXT `'YYYY-MM-DD HH24:MI:SS'` UTC, produced in SQL with `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')` — never `.toISOString()` (links.routes.js comment).
- Styling: PrimeVue components + `web/src/assets/main.css` tokens. No new palette.
- Gates per task: `npm run db:up`, `npm test`, `npm run build`. UI tasks also: dev servers up (web `[::1]:43100`, api 43101), `node e2e/qa-aesthetics.mjs`, `qa-dark-mode`, `qa-light-contrast`, `qa-field-rhythm`, `qa-format-polish`, and from Task 8 `qa-overview`.
- Gates log in as `demo@tripper.dev / tripper1234` where they need the seeded flagship (qa-format-polish does); gates that create fixtures use `demo@example.com / demo-pass-123`. New fixtures register a prefix in `server/scripts/purge-qa-data.js`.
- Don't commit without the owner's go-ahead for this plan's execution; commit steps below assume it was given.

## Review Focus

1. **Trip with no end date** (idea trip, date windows only): `expiryWarnings` falls back to max window end, then today. Expect warnings still shown, reason copy not claiming "before the trip ends" when there is no end — Task 1 test `no end date`.
2. **Same-day reload of the Overview** must not empty "Since you last looked" — Task 4 test `reload within the hour keeps since`.
3. **Unparseable `time_range`** ("morning", "", "after lunch"): Today lists the item but never labels it "Next"; no NaN minutes — Task 7 test in `overview.test.js`.
4. **Active trip whose dates don't cover today** (activated early, or end date edited): Overview must not render an empty during-trip page — Task 7 phase test: `active` + today < start → before-layout with "Starts in N days".
5. **Copy link with a pre-encryption link** (D1): must not silently revoke; uses the existing Replace confirm — Task 2 test.

---

## File structure

| File | Responsibility |
|---|---|
| `server/src/lib/missing.js` (new) | per-person missing fields + missing docs for a trip |
| `server/src/lib/events.js` (new) | `recordEvent(db, {...})` — one helper for every feed write |
| `server/src/lib/linkCrypto.js` (new) | encrypt/decrypt participant-link tokens |
| `server/src/routes/readiness.routes.js` | adds `missing_fields`, `missing_docs` |
| `server/src/routes/overview.routes.js` (new) | `POST /trips/:id/seen` (last-seen + feed) |
| `server/src/migrations/003_overview.sql` (new) | `trip_events`, `organizer_trip_views`, link `token_enc`, item `booking_ref`/`phone`/`stay`, trip `emergency_info`/`required_doc_types` |
| `web/src/utils/overview.js` (new) | `overviewPhase`, `missingRows`, `parseStartMinutes`, `todayTimeline`, `emptyDays` |
| `web/src/components/overview/*.vue` (new) | one card per §2 card |
| `web/src/views/trip/TripOverviewView.vue` | phase switch + layout only |
| `e2e/qa-overview.mjs` (new) | browser gate, own fixtures, both phases, 390px |

Migration note: one migration file per task that needs schema, numbered in task order (003, 004, …) — not one combined file — so each task ships alone. Names below.

---

### Task 1: Who's missing what card (closes trip-planner-5p9)

Spec: §1 job 2 (zero clicks), §2 before-trip left column, §6 "Missing", §5 actions on the row.

**Files:**
- Create: `server/src/lib/missing.js`, `server/test/missing.test.js`
- Modify: `server/src/routes/readiness.routes.js` (add fields to each participant)
- Modify: `server/test/readiness.test.js` (shape assertion)
- Create: `web/src/utils/overview.js`, `web/src/utils/overview.test.js`
- Create: `web/src/components/overview/MissingCard.vue`, `MissingCard.test.js`
- Modify: `web/src/views/trip/TripOverviewView.vue` (render MissingCard first, for every non-active trip)
- Modify: `e2e/qa-format-polish.mjs` step 4 (repoint to Overview `[data-doc-level]`)
- Modify: `docs/design/tripper.md` §9 (rows for D2, "expired = by trip end" copy, per-destination rules parked)

**Interfaces:**
- Produces (server): each `participants[]` entry of `/readiness` gains `missing_fields: string[]` (subset of `['phone','emergency_contact','dietary']`, in that order) and `missing_docs: string[]` (always `[]` until Task 3).
- Produces (web): `missingRows(participants, tripEnd) → { rows: Row[], complete: string[], total: number }` where `Row = { personId, name, severity: 'danger'|'warn', pills: {level, label}[], reasons: string[] }`.

- [ ] **Step 1: Failing server test** — `server/test/missing.test.js`

```js
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

describe('readiness missing_fields', () => {
  it('lists absent required profile fields per participant', async () => {
    const { app, db } = await makeTestApp()
    const { cookie } = await loginOrganizer(app, db)
    const t = await createTrip(db, { start_date: '2027-01-10', end_date: '2027-01-15' })
    const full = await createPerson(db, { name: 'Full', phone: '1', emergency_contact: 'x', dietary: 'veg' })
    const bare = await createPerson(db, { name: 'Bare', phone: '' })
    for (const p of [full, bare]) await db.run('INSERT INTO trip_participants (trip_id,person_id,profile_confirmed) VALUES (?,?,1)', [t.id, p.id])
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}/readiness` })
    const byName = Object.fromEntries(res.json().participants.map((p) => [p.name, p]))
    expect(byName.Full.missing_fields).toEqual([])
    expect(byName.Bare.missing_fields).toEqual(['phone', 'emergency_contact', 'dietary'])
    expect(byName.Bare.missing_docs).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npm run db:up && npm test --workspace=server -- missing` → `expected undefined to deeply equal []`.

- [ ] **Step 3: Implement** — `server/src/lib/missing.js`

```js
// tripper.md §6 "Missing": a required profile field absent (owner decision D2,
// 2026-10-01) — blank strings count as absent, a participant typing a space
// shouldn't read as complete.
export const REQUIRED_FIELDS = ['phone', 'emergency_contact', 'dietary']

export async function missingFieldsByPerson(db, tripId) {
  const rows = await db.all(
    `SELECT p.id, ${REQUIRED_FIELDS.map((f) => `p.${f}`).join(', ')}
     FROM trip_participants tp JOIN persons p ON p.id = tp.person_id WHERE tp.trip_id = ?`, [tripId])
  return new Map(rows.map((r) => [r.id, REQUIRED_FIELDS.filter((f) => !String(r[f] ?? '').trim())]))
}
```

In `readiness.routes.js`, after `people` is loaded: `const missing = await missingFieldsByPerson(app.db, tripId)`, and in the participant mapping add `missing_fields: missing.get(p.person_id) || [], missing_docs: []`.

- [ ] **Step 4: Run, expect PASS**; also `npm test --workspace=server -- readiness` (existing shape test: add `missing_fields`/`missing_docs` to its expected objects if it uses `toEqual`).

- [ ] **Step 5: Failing web util test** — `web/src/utils/overview.test.js`

```js
import { describe, it, expect } from 'vitest'
import { missingRows } from './overview.js'

const base = { person_id: 'p', profile_confirmed: 1, doc_warnings: [], missing_fields: [], missing_docs: [] }

describe('missingRows', () => {
  it('splits complete people from rows, worst first', () => {
    const out = missingRows([
      { ...base, person_id: 'a', name: 'Asha' },
      { ...base, person_id: 'm', name: 'Meena', missing_fields: ['dietary', 'emergency_contact'] },
      { ...base, person_id: 'p', name: 'Priya', doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-06-30' }] }
    ], '2026-11-15')
    expect(out.total).toBe(3)
    expect(out.complete).toEqual(['Asha'])
    expect(out.rows.map((r) => r.name)).toEqual(['Priya', 'Meena'])
    expect(out.rows[0]).toMatchObject({ severity: 'danger', pills: [{ level: 'expired', label: 'Passport expires 30 Jun 2026' }] })
    expect(out.rows[0].reasons).toEqual(['Passport expires before the trip ends'])
    expect(out.rows[1]).toMatchObject({ severity: 'warn', reasons: ['No dietary preference · no emergency contact'] })
  })
  it('warning reason names the 6-month rule', () => {
    const out = missingRows([{ ...base, name: 'Ravi', doc_warnings: [{ doc_type: 'passport', level: 'warning', expiry_date: '2027-01-20' }] }], '2026-11-15')
    expect(out.rows[0].reasons).toEqual(['Passport expires within 6 months of the trip end — many countries refuse entry'])
  })
  it('unconfirmed profile is a reason on its own', () => {
    const out = missingRows([{ ...base, name: 'Arun', profile_confirmed: 0 }], '2026-11-15')
    expect(out.rows[0].reasons).toEqual(["Hasn't confirmed their details"])
  })
  it('no end date: expired copy does not claim a trip end', () => {
    const out = missingRows([{ ...base, name: 'X', doc_warnings: [{ doc_type: 'visa', level: 'expired', expiry_date: '2026-01-01' }] }], null)
    expect(out.rows[0].reasons).toEqual(['Visa expires before the trip'])
  })
})
```

`formatDayDate` output format: check `web/src/utils/dates.js:55` and adjust the expected label (`30 Jun 2026` assumed) to what it actually returns before running — do not change `formatDayDate`.

- [ ] **Step 6: Run, expect FAIL** — `npm test --workspace=web -- overview` → `missingRows is not a function`.

- [ ] **Step 7: Implement** — `web/src/utils/overview.js`

```js
import { formatDayDate } from './dates.js'
import { humanizeEnum } from './format.js'

const FIELD_LABEL = { phone: 'no phone', emergency_contact: 'no emergency contact', dietary: 'no dietary preference' }
const docLabel = (t) => { const s = humanizeEnum(t); return s.charAt(0).toUpperCase() + s.slice(1) }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// tripper.md §2 "Who's missing what" + §6 "Missing". `expired` from the server
// means "expired by the trip end" (server/src/lib/expiry.js), not "expired today",
// so the copy says so instead of "expired".
export function missingRows(participants = [], tripEnd) {
  const rows = []
  const complete = []
  for (const p of participants) {
    const reasons = []
    const pills = (p.doc_warnings || []).map((w) => ({ level: w.level, label: `${docLabel(w.doc_type)} expires ${formatDayDate(w.expiry_date)}` }))
    for (const w of p.doc_warnings || []) {
      reasons.push(w.level === 'expired'
        ? `${docLabel(w.doc_type)} expires before the trip${tripEnd ? ' ends' : ''}`
        : `${docLabel(w.doc_type)} expires within 6 months of the trip end — many countries refuse entry`)
    }
    for (const d of p.missing_docs || []) reasons.push(`${docLabel(d)} not uploaded`)
    if (!p.profile_confirmed) reasons.push("Hasn't confirmed their details")
    else if (p.missing_fields?.length) reasons.push(cap(p.missing_fields.map((f) => FIELD_LABEL[f]).join(' · ')))
    if (!reasons.length) { complete.push(p.name); continue }
    rows.push({ personId: p.person_id, name: p.name, severity: pills.some((x) => x.level === 'expired') ? 'danger' : 'warn', pills, reasons })
  }
  rows.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1))
  return { rows, complete, total: participants.length }
}
```

- [ ] **Step 8: Run, expect PASS.**

- [ ] **Step 9: Failing component test** — `web/src/components/overview/MissingCard.test.js` (mount with `mountWithBase` from `web/src/test-utils.js`, a memory router with route `trip-people`):

```js
it('renders N of M, one row per incomplete person, pills with data-doc-level, complete line', async () => {
  const w = await mountCard({ participants: [
    { person_id: 'a', name: 'Asha', profile_confirmed: 1, doc_warnings: [], missing_fields: [], missing_docs: [] },
    { person_id: 'p', name: 'Priya', profile_confirmed: 1, doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-06-30' }, { doc_type: 'visa', level: 'warning', expiry_date: '2026-12-31' }], missing_fields: [], missing_docs: [] }
  ], tripEnd: '2026-11-15' })
  expect(w.find('h2').text()).toBe("Who's missing what · 1 of 2 people")
  expect(w.findAll('[data-person-row]')).toHaveLength(1)
  expect(w.find('[data-doc-level="expired"]').classes()).toContain('p-tag-danger')
  expect(w.find('[data-doc-level="warning"]').classes()).toContain('p-tag-warn')
  expect(w.text()).toContain('Asha is complete.')
})
it('everyone complete: says so, no rows', async () => { /* participants all complete → text "Everyone's details are in." and h2 "Who's missing what · 0 of 1 people" */ })
it('no participants: points to People', async () => { /* participants [] → text "No participants yet" + RouterLink to trip-people */ })
```

Write the two stub bodies out in full in the same style before running.

- [ ] **Step 10: Implement** — `web/src/components/overview/MissingCard.vue`

```vue
<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { missingRows } from '../../utils/overview.js'

const props = defineProps({ participants: { type: Array, default: () => [] }, tripEnd: { type: String, default: null } })
const view = computed(() => missingRows(props.participants, props.tripEnd))
const completeLine = computed(() => {
  const c = view.value.complete
  if (!c.length) return ''
  return `${c.join(', ')} ${c.length === 1 ? 'is' : 'are'} complete.`
})
</script>

<template>
  <section class="card overview-card missing-card" aria-labelledby="missing-h">
    <h2 id="missing-h">Who's missing what · {{ view.rows.length }} of {{ view.total }} people</h2>
    <p v-if="!view.total" class="muted">No participants yet — <RouterLink :to="{ name: 'trip-people' }">add people</RouterLink>.</p>
    <p v-else-if="!view.rows.length" class="muted">Everyone's details are in.</p>
    <ul v-else class="overview-rows">
      <li v-for="r in view.rows" :key="r.personId" data-person-row :class="['overview-row', `sev-${r.severity}`]">
        <div class="row-main">
          <RouterLink :to="{ name: 'trip-people' }" class="row-name">{{ r.name }}</RouterLink>
          <Tag v-for="pill in r.pills" :key="pill.label" :value="pill.label" :data-doc-level="pill.level"
               :severity="pill.level === 'expired' ? 'danger' : 'warn'" />
          <p class="row-reason">{{ r.reasons.join(' · ') }}</p>
        </div>
        <slot name="row-action" :person-id="r.personId" :name="r.name" />
      </li>
    </ul>
    <p v-if="completeLine && view.rows.length" class="card-foot muted">{{ completeLine }}</p>
  </section>
</template>
```

Card styles (`.overview-card`, `.overview-rows`, `.overview-row`, `.sev-danger` left rail using the existing danger token, `.sev-warn` the warn token, `.row-reason` muted) go in `web/src/assets/main.css` next to the existing `.card` rules, using existing tokens only — grep `main.css` for `--danger`/`--warn` names first.

The row-action slot is where Task 2 puts "Copy ⟨name⟩'s link".

- [ ] **Step 11: Wire into the Overview** — in `TripOverviewView.vue`, import `MissingCard`; render `<MissingCard :participants="participants" :trip-end="trip.end_date" />` as the first child inside `v-if="trip"` when `trip.status !== 'active'`. Leave the rest of the page as is (Task 5 replaces it). Update `TripOverviewView.test.js`: add `missing_fields: [], missing_docs: [], doc_warnings: []` to fixtures and one test that the card renders before the hero for a planning trip.

- [ ] **Step 12: Repoint the gate** — `e2e/qa-format-polish.mjs` step 4: replace the `/readiness` URL with `${BASE}/trips/${TRIP}` and the selector with `[data-doc-level]`; split into `expired` / `warning` by `t.dataset.docLevel`. Update the comment (drop "fails until…", cite tripper.md §2 and 5p9). Keep both arms and their "present" failures — the flagship has Priya passport 2026-06-30 (expired by trip end 2026-11-15), Priya visa 2026-12-31 and Ravi passport 2027-01-20 (warning).

- [ ] **Step 13: Watch it fail first** — do Step 12 before Step 11's wiring lands (no `git stash`: parallel agents share the tree, memory note): `node e2e/qa-format-polish.mjs` → `FAIL - expired pill present`. Then with Step 11 in: `POLISH CHECK OK`. Also break it on purpose: temporarily map `expired` to `warn` in MissingCard → `FAIL - expired pill colour`; revert.

- [ ] **Step 14: tripper.md §9 rows** (append to the changelog table):

```
| 2026-10-01 | Required profile fields = phone, emergency contact, dietary; unconfirmed profile is Missing | owner (D2) | §6 "Missing" had no field list |
| 2026-10-01 | Doc copy says "expires before the trip ends", not "expired" | 5p9 build | server level `expired` means expired by trip end, not today |
| 2026-10-01 | Per-destination doc rules (visa lead time, country 6-month rule) parked; reason copy is generic | 5p9 build | no destination→country data; restore if a trip is refused on a rule we could have shown |
```

- [ ] **Step 15: Gates** — `npm test`, `npm run build`, the five browser gates; 390px check of the card (ui-verify).

- [ ] **Step 16: Commit** — `git commit -m "feat: Overview Who's missing what restores doc-expiry pills (trip-planner-5p9)"`

---

### Task 2: Copy ⟨name⟩'s link on the row, one click (depends on D1)

Spec: §1 "copy a participant's link (one click, on the row that says they're missing something)", §4 one-click tier, §5 never bulk.

**Files:**
- Create: `server/src/migrations/003_link_token_enc.sql`, `server/src/lib/linkCrypto.js`, `server/test/linkCrypto.test.js`
- Modify: `server/src/routes/links.routes.js` (store `token_enc`; new `GET /trips/:tripId/participants/:personId/link`)
- Modify: `server/test/links.test.js` (or create if absent)
- Create: `web/src/composables/useCopyLink.js` (+ test); refactor `TripPeopleView.vue` `copyLink` to use it
- Modify: `TripOverviewView.vue` (fill MissingCard `row-action` slot)
- Modify: `.env.example` / server config docs: `LINK_TOKEN_KEY` (32 bytes base64)

**Interfaces:**
- Produces: `GET /api/trips/:tripId/participants/:personId/link` → `200 {url}` for an active link with a recoverable token; `404 {code:'NO_RECOVERABLE_LINK'}` otherwise.
- Produces: `useCopyLink().copy(tripId, personId, name)` → copies `origin + url`; on 404 falls back to the People "Replace link?" confirm then mint. Never revokes without that confirm.

- [ ] **Step 1: Migration** — `003_link_token_enc.sql`: `ALTER TABLE participant_links ADD COLUMN token_enc TEXT NULL;`
- [ ] **Step 2: Failing crypto test**

```js
import { encryptToken, decryptToken } from '../src/lib/linkCrypto.js'
it('round-trips and rejects tampering', () => {
  const key = Buffer.alloc(32, 7).toString('base64')
  const enc = encryptToken('abc', key)
  expect(enc).not.toContain('abc')
  expect(decryptToken(enc, key)).toBe('abc')
  expect(() => decryptToken(enc.slice(0, -2) + 'AA', key)).toThrow()
})
```

- [ ] **Step 3: Implement** `linkCrypto.js` with `node:crypto` `createCipheriv('aes-256-gcm', key, iv12)`; format `base64url(iv).base64url(tag).base64url(ct)`. Missing/short key → `encryptToken` returns `null` (link still minted, just not recoverable) and logs once; tests set the key in `test/helpers.js` env.
- [ ] **Step 4: Failing route test** — mint via POST, then GET returns the same url; revoke → GET 404; row inserted without `token_enc` → GET 404 `NO_RECOVERABLE_LINK`; other organizer's trip → 404 `NOT_FOUND`. Authorize via the existing `app.ownedTrip` helper (one shared helper per resource, CLAUDE.md).
- [ ] **Step 5: Implement** — POST also writes `token_enc`; GET selects the active link (`revoked_at IS NULL AND (expires_at IS NULL OR expires_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))`), decrypts.
- [ ] **Step 6: Web composable + test** — `useCopyLink` with mocked `api.get` 200 → `navigator.clipboard.writeText` called with origin+url, notify "⟨Name⟩'s link copied"; 404 → `confirm.require` called with the existing Replace copy (move that copy from `TripPeopleView.vue` into the composable). Use `Object.defineProperty` for `navigator.clipboard` in happy-dom (memory note).
- [ ] **Step 7: Overview row button** — in the MissingCard slot: `<Button size="small" outlined :label="`Copy ${name}'s link`" @click="copy(tripId, personId, name)" />`. Test: one button per row, label text exact, none on the complete line, no "copy all" anywhere (`expect(w.text()).not.toMatch(/copy all/i)`).
- [ ] **Step 8: §9 row** — `| 2026-10-01 | Participant-link tokens stored encrypted so Copy is one click without revoking | owner (D1) | hashed-only tokens forced "Replace link" on every copy |`
- [ ] **Step 9: Gates + 390px** (button wraps under the reason, no horizontal scroll). **Commit.**

---

### Task 3: Required docs per trip → "⟨Doc⟩ not uploaded" (depends on D3)

Spec: §6 "Missing … doc absent", §4 two clicks (Details ▾ Settings), §5 one Save per section.

**Files:**
- Create: `server/src/migrations/004_trip_required_docs.sql` — `ALTER TABLE trips ADD COLUMN required_doc_types TEXT NOT NULL DEFAULT '[]';`
- Modify: `server/src/routes/trips.routes.js` (`PUT /trips/:id` accepts `required_doc_types` — array of the six `documents.doc_type` values, validated; `tripToJson` parses it like `vibe_tags`)
- Modify: `server/src/lib/missing.js` — `missingDocsByPerson(db, tripId)`: for each participant, required types with no document of that type (any expiry)
- Modify: `server/src/routes/readiness.routes.js` (`missing_docs` from it)
- Modify: `web/src/views/trip/TripSettingsView.vue` (MultiSelect "Documents every participant needs", in the existing section's Save)
- Tests: server (`required visa, Priya has none → missing_docs ['visa']`; invalid type → 400 before any write), web Settings test, MissingCard already renders `Visa not uploaded` via `missingRows` (add a util test case).

- [ ] Steps: failing server test → implement → pass; failing Settings test → implement → pass; gates; commit. §9 row: `| 2026-10-01 | Per-trip required documents in Settings | owner (D3) | "Visa not uploaded" needs a rule |`

---

### Task 4: Since you last looked (depends on D6)

Spec: §2 "Since you last looked · ⟨date⟩, where each change links to what it affects", §3 collecting session, §9 gap "last seen timestamp per organizer per trip".

**Files:**
- Create: `server/src/migrations/005_trip_events.sql`

```sql
CREATE TABLE trip_events (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('profile_saved','doc_uploaded','checklist_ticked')),
  summary TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('people','checklists')),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX trip_events_trip_created ON trip_events (trip_id, created_at);
CREATE TABLE organizer_trip_views (
  organizer_id TEXT NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL,
  prev_seen_at TEXT NULL,
  PRIMARY KEY (organizer_id, trip_id)
);
```
Check `trips.id`'s type in `001_init.sql` and match it.

- Create: `server/src/lib/events.js` — `recordEvent(db, { tripId, personId, kind, summary, target })`
- Modify write sites (participant side only): `participant.routes.js` PUT `/participant/profile` (`"⟨first name⟩ updated their details"`), `documents.routes.js` POST `/participant/documents` (`"⟨first name⟩ uploaded their ⟨doc⟩"`), `checklists.routes.js` PUT `/participant/checklist-items/:itemId` when `done` flips to 1 (`"⟨first name⟩ ticked ⟨title⟩"`). Record after the write succeeds (validate → authorize → write → record).
- Create: `server/src/routes/overview.routes.js` — `POST /trips/:id/seen` → `{ since: string|null, events: [{id, summary, target, created_at}] }` (newest first, max 20). Register it where the other routes are registered.
- Create: `web/src/stores/overview.js` (`fetchSeen(tripId)`, same `lastTripId`/token pattern as `readiness.js`), `web/src/components/overview/SinceCard.vue` (+ tests)

Seen logic (one SQL upsert, then read):
```sql
INSERT INTO organizer_trip_views (organizer_id, trip_id, last_seen_at, prev_seen_at)
VALUES (?, ?, to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'), NULL)
ON CONFLICT (organizer_id, trip_id) DO UPDATE SET
  prev_seen_at = CASE WHEN organizer_trip_views.last_seen_at
      < to_char((now() AT TIME ZONE 'UTC') - INTERVAL '1 hour','YYYY-MM-DD HH24:MI:SS')
    THEN organizer_trip_views.last_seen_at ELSE organizer_trip_views.prev_seen_at END,
  last_seen_at = EXCLUDED.last_seen_at
RETURNING prev_seen_at
```
`since = prev_seen_at`; events `WHERE trip_id = ? AND created_at > ?` (when `since` is null: none, card says "Changes from participants will show here.").

- [ ] Server tests (failing first): first visit → `since null, events []`; set `last_seen_at` to 2 h ago, record an event, POST → `since` = that stamp, event listed; **POST again immediately → same `since`, same events** (Review Focus 2); another organizer's trip → 404; participant profile PUT writes exactly one event.
- [ ] Web: SinceCard heading `Since you last looked · ⟨formatDayDate(since)⟩`; each row `⟨date⟩ ⟨summary⟩` as a RouterLink to `trip-people` / `trip-checklists` by `target`; empty state "Nothing new since ⟨date⟩."; render under MissingCard for non-active trips.
- [ ] §9 row (D6) + mark the §9 gap closed. Gates, commit.

---

### Task 5: Before-trip layout — tripline, two columns, Itinerary / Budget / Checklists cards (depends on D5)

Spec: §2 before-trip, §5 no header button + only decision-driving numbers, §6 one number one place, §7 removal log.

**Files:**
- Create: `web/src/components/overview/TripLine.vue`, `ItineraryCard.vue`, `BudgetCard.vue`, `ChecklistsCard.vue` (+ tests)
- Modify: `web/src/utils/overview.js` — `overviewPhase(trip, todayIso)`, `emptyDays(trip, days)`
- Modify: `web/src/views/trip/TripOverviewView.vue` — rewrite template into phase switch; remove hero stepper, vibe tags, stat grid, Readiness %, Next actions
- Modify: `web/src/utils/tripNav.js` — delete `readinessPercent` and `nextActions` if no other importer (`grep -rn` first; run `npm run build` — vitest misses removed exports, memory note)
- Modify: `e2e/qa-format-polish.mjs` step 1 — the Budget stat tile is gone; assert BudgetCard's per-person number equals `formatMoney(equal_share)` read from `/api/trips/:id/budget`, digits separated
- Modify: `docs/design/tripper.md` §7 "Removed" rows; §9 row for D5

**Interfaces:**
- `overviewPhase(trip, todayIso) → 'before'|'during'|'after'`: `archived` → `after`; `active` and `start_date <= today <= end_date` → `during`; everything else → `before` (Review Focus 4).
- `emptyDays(trip, days) → { planned, total, empty: isoDate[] }`: total = days from `start_date` to `end_date` inclusive (0 if either missing); planned = those with ≥1 item in `days` (itinerary store `days[]`, `{day_date, items}`).

Layout:
- TripLine (no buttons): `⟨Status⟩ · ⟨formatDayDate(start)⟩–⟨end⟩ · ⟨N⟩ people · ⟨tripCountdown⟩`; dates missing → `Dates TBD` as a RouterLink to `trip-dates` (that's the old "Decide the dates" next action, now at its §4 tier).
- Left: MissingCard, SinceCard. Right: ItineraryCard `Itinerary · N of M days planned` (rows `⟨date⟩ — nothing planned`, max 5 then `and N more`; foot RouterLink `Open itinerary`; no dates → `Set dates to plan days` → `trip-dates`), BudgetCard `Budget · per person` (hero `formatMoney(equal_share)`, sub "estimate"; foot `Open budget`; zero → "No estimate yet"), ChecklistsCard `Checklists · N open` (open items, unassigned first, max 5, `Unassigned` Tag or assignee name; foot `All N items · unassigned first` → `trip-checklists`).
- Phone: single column, left then right.
- `after` phase: TripLine + ItineraryCard + BudgetCard only (no Missing/Since — nothing to chase). §9 row: `| 2026-10-01 | After the trip the Overview shows trip line, Itinerary, Budget | 5p9 build | §2 "After the trip" said only how a trip leaves active |`
- Data: Overview `load()` additionally fetches `itinerary` and `checklists` (same `lastTripId` guards as today).

§7 Removed rows to add:
```
| 2026-10-01 | Status stepper + vibe tags | Overview hero | status field at rest (§8 avoid); not a §6 number | an organizer asks "what stage is this trip" twice |
| 2026-10-01 | Readiness % stat | Overview | not a §6 number; replaced by Who's missing what | — |
| 2026-10-01 | Next actions list | Overview | dates/destination moved to the trip line and Itinerary card empty states | a decision is missed because nothing pointed at it |
| 2026-10-01 | Budget total + Profiles confirmed stats | Overview | §6: per-person cost and "N of M" replace them | — |
```

- [ ] Steps per card: failing test (exact heading text, empty state, row cap, link target) → implement → pass. View test: planning trip renders left column before right in DOM order; no `button` inside `.trip-line`; `.status-step` gone. Util tests for both functions incl. missing dates and Review Focus 4.
- [ ] Gates incl. updated `qa-format-polish`, 390px. Commit.

---

### Task 6: Itinerary data for the trip — booking ref, phone, stays, emergency info (depends on D4)

Spec: §9 gaps "booking refs on itinerary items", "quick-reference source"; §5 edit in place, no modal; §4 Destination is two clicks.

**Files:**
- Create: `server/src/migrations/006_itinerary_refs.sql`

```sql
ALTER TABLE itinerary_items ADD COLUMN booking_ref TEXT NULL;
ALTER TABLE itinerary_items ADD COLUMN phone TEXT NULL;
ALTER TABLE itinerary_items DROP CONSTRAINT IF EXISTS itinerary_items_category_check;
ALTER TABLE itinerary_items ADD CONSTRAINT itinerary_items_category_check
  CHECK (category IN ('travel','food','activity','rest','logistics','stay'));
ALTER TABLE trips ADD COLUMN emergency_info TEXT NULL;
```
Verify the constraint's real name first: `psql -h 127.0.0.1 -p 43105 -c "\d itinerary_items"`.

- Modify: `server/src/routes/itinerary.routes.js` (`itemBodySchema` + item JSON include `booking_ref`, `phone`; category enum adds `stay`; AI draft import ignores unknown keys as today), `trips.routes.js` (`emergency_info` on PUT)
- Modify: web Itinerary in-place item editor (add two text fields "Booking ref", "Phone", labelled, same focus/Esc behaviour as 0xv.3; `stay` in the category select with label "Stay"); `TripDestinationView.vue` ("Local emergency numbers", textarea, in the existing section Save)
- Modify: `e2e/seed-demo.mjs` — flagship gets 2 stay items, one booking ref, emergency_info, so the during-trip demo is real
- Tests: server round-trip for each field; bad category 400; web editor test that Esc cancels the new fields too.

- [ ] Steps: failing tests → migration + routes → pass; web editor → pass; `qa-field-rhythm` must still pass (new fields in `.field` forms). Mark §9 gaps "booking refs" + "quick-reference source" closed (D4 row). Commit.

---

### Task 7: During-trip layout — Today, Quick reference, Tomorrow, Before tomorrow

Spec: §1 job 5 (zero clicks during trip), §2 during-trip, §5 tick in place, §9 gap "next item timing".

**Files:**
- Modify: `web/src/utils/overview.js` — `parseStartMinutes(timeRange)`, `todayTimeline(items, nowMinutes)`, `tonightStay(days, todayIso)`
- Create: `web/src/components/overview/TodayCard.vue` (replaces the inline Today card in the view), `QuickRefCard.vue`, `TomorrowCard.vue`, `BeforeTomorrowCard.vue` (+ tests)
- Modify: `TripOverviewView.vue` — `during` branch; delete the old inline Today card and its `showTodayCard` (phase util replaces it); move its tests into `TodayCard.test.js`

**Interfaces:**
- `parseStartMinutes('09:30–11:00') → 570`; accepts `H:MM`, `HH:MM`, `9am`, `9.30pm`, first time in the string; anything else → `null`.
- `todayTimeline(items, nowMinutes) → [{...item, start: number|null, state: 'done'|'next'|'later'|'untimed'}]`: sorted by start (untimed last, original order kept); `next` = first timed item with `start >= nowMinutes`; timed items before it = `done`; `minutesToNext` returned alongside.
- `tonightStay(days, todayIso)` = the last `stay` item on the latest day `<= todayIso`, or null.

Cards:
- TodayCard `Today · ⟨dayHeader⟩ · ⟨first location of the day⟩`: done rows dimmed (`.is-done`, opacity via existing token — check light and dark, memory note on 0.6 opacity), the next row has an info rail and `Next · in ⟨N⟩ min` (≥ 60 → `in 1 h 20 min`), `· ref ⟨booking_ref⟩` if set, `Map` link `https://www.google.com/maps/search/?api=1&query=⟨encodeURIComponent(location)⟩` (§7: link out, no embed). Empty: "Nothing planned today — open the itinerary to add something".
- QuickRefCard `Quick reference`: `Tonight: ⟨title⟩` + location + `ref` + `Call` (`tel:`) + `Map`; today's items with a phone as `Call ⟨title⟩`; `emergency_info` as pre-wrapped text under "Emergency"; foot "From the itinerary's stays and bookings · Edit in Itinerary". Nothing at all → "Add a stay in the Itinerary to see it here."
- TomorrowCard `Tomorrow · ⟨dayHeader⟩`: first 3 items with time + booking ref; last day of trip → "Last day — no plan for tomorrow."
- BeforeTomorrowCard `Before tomorrow · N open`: checklist items, `done = 0`, `due_date <= tomorrow` or null-due items assigned to nobody? → **only `due_date <= tomorrow`**; Checkbox ticks in place via `checklists.updateItem(id, {done: true})`; update the row in place, not a full re-render (memory note: innerHTML re-render eats focus — assert `document.activeElement` survives the tick). Foot `All checklists`.
- Hidden during the trip: Missing, Since, Budget, Itinerary cards (§2).
- Order in DOM = phone order: Today, Quick reference, Tomorrow, Before tomorrow; desktop two columns via CSS grid areas.
- Re-render clock: a 60 s `setInterval` updating `nowMinutes`, cleared on unmount (test with fake timers).

- [ ] Util tests first, including Review Focus 3 (`'morning'`, `''`, `null` → `null`; untimed never `next`) and a fake-clock test that `Next` moves when time passes. Then each card. Then view test: active trip covering today renders the four cards in order and none of Missing/Since/Budget.
- [ ] Gates, 390px (stack order measured by `getBoundingClientRect().top`). Mark §9 gap "next item timing" closed. Commit.

---

### Task 8: Browser gate `qa-overview` + ui-verify pass

Spec: §4 (390px), §2 both phases. Global constraint: new gates create their own fixtures.

**Files:**
- Create: `e2e/qa-overview.mjs`
- Modify: `server/scripts/purge-qa-data.js` — add `'Overview QA *'` to `TRIP_PATTERNS`, `'Overview QA Person *'` to `PERSON_PATTERNS`
- Modify: `CLAUDE.md` gate list (add `qa-overview`)

Gate (log in as `demo@example.com / demo-pass-123`, all fixtures via the API, `purgeQaData()` at start and end, same `findExecutable`/proxy args as `qa-format-polish.mjs`):
1. Create `Overview QA Before ⟨ts⟩` (confirmed, dates +30..+40 days) with 3 `Overview QA Person` participants: one complete, one missing dietary, one with a passport expiring before trip end → assert heading `· 2 of 3 people`, red `[data-doc-level=expired]`, one `Copy … link` per row, no button in `.trip-line`.
2. Create `Overview QA During ⟨ts⟩` (dates today-1..today+2, status walked to active), items today at `00:00` and `23:59`, a stay item, a checklist item due tomorrow → assert Today shows `Next · in`, Quick reference shows `Tonight:`, Before tomorrow tick keeps focus and count drops by 1, and Missing card is absent.
3. At 390px width (measure `document.documentElement.scrollWidth <= 390`; headless clamps to 500, so use `page.setViewportSize` and measure, memory note): no horizontal overflow; during-trip card tops ascending in §2 phone order.
4. **Make it fail once**: run against `main` before Task 7 (or comment out the `during` branch) → red; record the failing line in the bead note.

- [ ] Run ui-verify skill over the Overview (both phases, light + dark, 390px) and add any measured finding as a gate assertion here. Run all gates. Commit.

---

### Task 9: Smoke-test every other surface against the identity

Spec: whole of `tripper.md`; method = the 0xv Itinerary smoke test (drive the real app, list rule breaks with section cites).

Surfaces: Trips list `/`, Budget, Checklists, People (trip), `/trips/new`, `/p/:token` (mint a link for a fixture participant), Details ▾ pages (Dates, Destination, Settings).

**Files:**
- Create: `docs/design/smoke-2026-10.md` — one section per surface: archetype (§2), at-rest action count vs §5 budget, reach of each job vs §4, vocabulary breaks (§6), refused items present (§7), 390px result, each finding `surface · rule § · evidence (selector + measured value or screenshot path) · proposed fix`.
- Beads: one bead per finding (or per surface when findings are small), `discovered-from` the epic; conflicts with tripper.md become §9 proposal rows marked "proposed", not fixes.

- [ ] Steps: dev servers up (curl `[::1]:43100` and `:43101` first — background servers get OOM-killed here, memory note); drive each surface with the browser at desktop and 390px; write findings; file beads; show the owner the list. **No code changes in this task.**

---

## Self-review notes

- Spec coverage: §2 before (Tasks 1–5), during (6–7), after (5), phone order (5, 7, 8); §4 zero-click (1, 7), one-click copy (2); §6 numbers (5); §9 gaps: reason (1, 3), last seen (4), quick ref + booking refs (6), next timing (7). §1 job 5 + Itinerary "today" already built (0xv) — not redone.
- 5p9 gate: Task 1 Steps 12–13.
- Not covered on purpose: budget booked-vs-estimated (D5 → follow-up bead), per-destination doc rules (§9 parked), Neon/AppSail (trip-planner-fpm, out of scope).
