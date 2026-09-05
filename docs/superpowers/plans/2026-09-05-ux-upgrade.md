# Tripper UX Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the core app-experience gaps found in the 2026-09-05 UX expert review: money that reads correctly, dates that read like a human wrote them, a guest page that finally shows the itinerary, and ways to get the plan out of the app (.ics, print) — plus trip un-archive.

**Architecture:** Three shippable phases. Phase 1 is frontend-only polish (web workspace). Phase 2 extends the participant summary endpoint and guest page. Phase 3 adds two small server features (.ics generator lib + un-archive route) and two web surfaces (print view, unified AI draft review component). No schema changes anywhere — itinerary times stay free-text and are *parsed* where needed.

**Tech Stack:** Vue 3 + Pinia + PrimeVue 4 (web), Fastify 5 + Postgres (server), vitest both sides. One new web dependency: `qrcode`.

**Spec:** This plan is its own spec — the requirements were negotiated in-session (2026-09-05) from a live UX review. Decision log below is the authoritative scope.

**Task tracking:** beads epic `trip-planner-ncn`, children `.1`–`.13` map to Tasks 1–13 (`.14` is the parked splitease placeholder). Close each child as its task completes.

## Decision log (owner-approved scope)

- **No group voting/comments/polls.** Decisions happen on WhatsApp/in person; the app only records outcomes. Deliberate.
- **No expense tracking inside tripper.** splitease (separate project) will integrate later — parked as beads `trip-planner-ncn.14`. Do not build.
- **No signup / password reset / account UI.** Organizers are CLI-seeded; participants use magic links. Deliberate.
- **Trip un-archive: yes. Trip delete: no** (owner undecided — do not add).
- **No maps/geocoding, no realtime, no email** — out of scope for this plan.

## Global Constraints

- Repo policy: **no git commits** by workers — tasks end with green workspace tests, not commits. Owner commits at the end.
- Postgres must be up before server tests: `npm run db:up` (already idempotent). Tests: `npm test --workspace=web`, `npm test --workspace=server`.
- Web code style: Vue 3 `<script setup>` SFCs, scoped styles, global tokens (`--app-*`) from `web/src/assets/main.css`; both light and dark (`.app-dark`) themes must work; ≥44px touch targets on interactive controls; keep aria-labels.
- Server code style: routes in `server/src/routes/*.routes.js`, guards `requireOrganizer`/`requireParticipant`, ownership via `app.ownedTrip`, SQL with `?` placeholders, timestamps as TEXT `'YYYY-MM-DD HH24:MI:SS'`.
- All money rendering goes through `formatMoney` (Task 1) once it exists; all day headings through `dayHeader` (Task 2).
- TDD per task: failing test → implement → green. No behavior changes in refactor tasks (Task 13).

---




# Phase 1 — Trust & polish sweep (web only)

# Phase 1 — frontend trust & polish sweep

All paths relative to `/Users/vignesh-5036/mydevelopment/tripper/trip-planner`. Run
`npm run db:up` once before any `npm test --workspace=web` in this doc (harmless if already up;
web tests don't hit Postgres but the repo convention is to have it up). No commit steps anywhere
below — this repo's policy is report-and-wait; hand back file list + `git status` at the end of
each task instead.

---

### Task 1 — `formatMoney` currency utility, adopted everywhere

**Files:**
- Modify: `web/src/utils/format.js`
- Create: `web/src/utils/format.test.js`
- Modify: `web/src/components/DayCard.vue` (est_cost, x2), `web/src/components/BudgetTable.vue` (footer total)
- Modify: `web/src/views/trip/TripOverviewView.vue` (Budget stat), `web/src/views/trip/TripBudgetView.vue` (Total, Equal share), `web/src/views/trip/TripItineraryView.vue` (AI draft preview est_cost)
- Test: `web/src/views/trip/TripOverviewView.test.js`, `web/src/views/trip/TripBudgetView.test.js` (add cases)

**Verified via grep** (`grep -rn "formatAmount\|est_cost\|>\s*\${{" web/src --include="*.vue" --include="*.js"`): the *only* money-display call sites in the whole `web/` tree are the 6 listed above. No participant-page amounts exist to fix — `ParticipantView.vue`/`ParticipantDocs.vue`/`ParticipantChecklist.vue` show no currency figures. `formatAmount` is kept (not deleted) even though these edits leave it with zero callers — removing an exported utility outside the requested scope on the strength of one grep carries more regression risk than the dead-export churn it saves.

**Trip currency source (verified):** `server/src/migrations/001_init.sql:27` — `currency TEXT NOT NULL DEFAULT 'INR'`; `server/src/routes/trips.routes.js:21` — `SELECT * FROM trips WHERE id = ?`, so every trip object the client ever holds (`trips.current`, the list, and `TripBudgetView`'s own `api.get`) already carries `.currency`. `formatMoney` defaults the code to `'INR'` itself when falsy, mirroring the server's own default (`server/src/config.js:40`), so call sites never need `trip.currency || 'INR'` boilerplate.

**Interfaces:**
```js
// web/src/utils/format.js
export function formatMoney(amount, currency, { compact = false } = {}) // -> string | null
```
`compact` uses `Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })` — verified in this Node (v26, full ICU): `57000 -> '57K'`, `1234567 -> '1.2M'`, `999 -> '999'` (no compaction under 1000, matches the spec's ₹57K / ₹1.2M example with standard notation, not lakh grouping).

- [ ] **Step 1 (failing test).** Create `web/src/utils/format.test.js`:
  ```js
  import { describe, it, expect } from 'vitest'
  import { formatAmount, humanizeEnum, formatMoney } from './format.js'

  describe('formatMoney', () => {
    it('renders known currencies with their symbol, thousands-separated', () => {
      expect(formatMoney(342000, 'INR')).toBe('₹342,000')
      expect(formatMoney(500, 'VND')).toBe('₫500')
      expect(formatMoney(1234.5, 'USD')).toBe('$1,234.5')
      expect(formatMoney(10, 'EUR')).toBe('€10')
      expect(formatMoney(10, 'THB')).toBe('฿10')
      expect(formatMoney(10, 'GBP')).toBe('£10')
    })

    it('defaults to INR when no currency is given', () => {
      expect(formatMoney(500)).toBe('₹500')
      expect(formatMoney(500, null)).toBe('₹500')
    })

    it('falls back to the currency code as a prefix for unknown currencies', () => {
      expect(formatMoney(500, 'ZZZ')).toBe('ZZZ 500')
    })

    it('compact uses standard (57K / 1.2M) notation, not lakh grouping', () => {
      expect(formatMoney(57000, 'INR', { compact: true })).toBe('₹57K')
      expect(formatMoney(1234567, 'USD', { compact: true })).toBe('$1.2M')
      expect(formatMoney(999, 'INR', { compact: true })).toBe('₹999')
    })

    it('renders 0 (a real amount) rather than treating it as missing', () => {
      expect(formatMoney(0, 'INR')).toBe('₹0')
    })

    it('is null for missing or non-numeric amounts, same as formatAmount', () => {
      expect(formatMoney(null, 'INR')).toBeNull()
      expect(formatMoney('', 'INR')).toBeNull()
      expect(formatMoney('nope', 'INR')).toBeNull()
    })
  })

  // formatAmount/humanizeEnum had no dedicated test file before this task; a
  // couple of smoke assertions so this new file is the one place that covers
  // the whole module, not just the function this task added.
  describe('formatAmount', () => {
    it('thousands-separates', () => { expect(formatAmount(342000)).toBe('342,000') })
  })
  describe('humanizeEnum', () => {
    it('humanizes snake_case', () => { expect(humanizeEnum('non_veg')).toBe('Non-veg') })
  })
  ```
- [ ] Run: `npm test --workspace=web -- format.test` — expect it to FAIL (`formatMoney` is not exported yet).
- [ ] **Step 2 (implement).** In `web/src/utils/format.js`, append after `formatAmount`:
  ```js
  const CURRENCY_SYMBOLS = { INR: '₹', VND: '₫', USD: '$', EUR: '€', THB: '฿', GBP: '£' }

  // Money display with a currency lens: `compact` gives 57K / 1.2M (standard
  // Intl compact notation), not lakh/crore grouping — this app's users travel
  // across currencies, not just within India. Unknown currency codes fall back
  // to the code itself as a prefix rather than guessing a symbol.
  export function formatMoney(amount, currency, { compact = false } = {}) {
    const num = Number(amount)
    if (amount == null || amount === '' || Number.isNaN(num)) return null
    const code = currency || 'INR'
    const symbol = CURRENCY_SYMBOLS[code] || `${code} `
    if (compact) {
      return `${symbol}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num)}`
    }
    return `${symbol}${num.toLocaleString('en-US')}`
  }
  ```
- [ ] Run: `npm test --workspace=web -- format.test` — expect PASS.

- [ ] **Step 3 (DayCard.vue).** Read at `web/src/components/DayCard.vue`. Add a `currency` prop and an `index` prop (the latter is also needed by Task 2's day header — do both prop additions in this one edit to avoid touching the `defineProps` block twice):
  ```js
  // OLD (line 10)
  const props = defineProps({ day: { type: Object, required: true } })
  ```
  ```js
  // NEW
  const props = defineProps({
    day: { type: Object, required: true },
    index: { type: Number, required: true },
    currency: { type: String, default: 'INR' }
  })
  ```
  Add the import (line 6, alongside the existing `useItineraryStore` import):
  ```js
  import { formatMoney } from '../utils/format.js'
  ```
  Replace the two hardcoded-`$` spans:
  ```html
  <!-- OLD (line 79) -->
  <span v-if="item.est_cost != null">${{ item.est_cost }}</span>
  ```
  ```html
  <!-- NEW -->
  <span v-if="item.est_cost != null">{{ formatMoney(item.est_cost, currency) }}</span>
  ```
  ```html
  <!-- OLD (line 117, inside the day-draft block) -->
  <span v-if="it.est_cost != null">${{ it.est_cost }}</span>
  ```
  ```html
  <!-- NEW -->
  <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, currency) }}</span>
  ```
  (The `<h3>{{ day.day_date }}</h3>` header at line 72 and the `<h4>Draft for {{ day.day_date }}</h4>` at line 110 are touched by Task 2, not here.)

- [ ] **Step 4 (BudgetTable.vue).** Read at `web/src/components/BudgetTable.vue`.
  ```js
  // OLD (line 9-12)
  const props = defineProps({
    modelValue: { type: Array, default: () => [] },
    draft: { type: Array, default: null }
  })
  ```
  ```js
  // NEW
  const props = defineProps({
    modelValue: { type: Array, default: () => [] },
    draft: { type: Array, default: null },
    currency: { type: String, default: 'INR' }
  })
  ```
  ```js
  // OLD (line 7)
  import { formatAmount } from '../utils/format.js'
  ```
  ```js
  // NEW
  import { formatMoney } from '../utils/format.js'
  ```
  ```html
  <!-- OLD (line 49) -->
  <template #footer><strong>{{ formatAmount(total) }}</strong></template>
  ```
  ```html
  <!-- NEW -->
  <template #footer><strong>{{ formatMoney(total, currency) }}</strong></template>
  ```

- [ ] **Step 5 (TripOverviewView.vue).** Read at `web/src/views/trip/TripOverviewView.vue`.
  ```js
  // OLD (line 9)
  import { formatAmount } from '../../utils/format.js'
  ```
  ```js
  // NEW
  import { formatMoney } from '../../utils/format.js'
  ```
  ```html
  <!-- OLD (line 84) -->
  <span class="stat-value">{{ budget.total ? formatAmount(budget.total) : '—' }}</span>
  ```
  ```html
  <!-- NEW -->
  <span class="stat-value">{{ budget.total ? formatMoney(budget.total, trip.currency) : '—' }}</span>
  ```
  (`trip` is already the computed `trips.current` at line 19 — has `.currency` per the `SELECT *` above.)

- [ ] **Step 6 (TripBudgetView.vue).** Read at `web/src/views/trip/TripBudgetView.vue`. Capture the trip's currency in `load()` (the trip is fetched here via a raw `api.get`, not the trips store):
  ```js
  // OLD (line 29)
  const participants = ref([])
  ```
  ```js
  // NEW
  const participants = ref([])
  const tripCurrency = ref('INR')
  ```
  ```js
  // OLD (lines 52-55, inside load())
  try {
    const trip = (await api.get(`/api/trips/${tripId.value}`)).trip
    participants.value = trip?.participants || []
  } catch { participants.value = [] }
  ```
  ```js
  // NEW
  try {
    const trip = (await api.get(`/api/trips/${tripId.value}`)).trip
    participants.value = trip?.participants || []
    tripCurrency.value = trip?.currency || 'INR'
  } catch { participants.value = [] }
  ```
  ```js
  // OLD (line 10)
  import { formatAmount } from '../../utils/format.js'
  ```
  ```js
  // NEW
  import { formatMoney } from '../../utils/format.js'
  ```
  ```html
  <!-- OLD (line 133) -->
  <BudgetTable v-model="linesDraft.draft.lines" :draft="store.draft" />
  <p><strong>Total: {{ formatAmount(store.total) }}</strong></p>
  ```
  ```html
  <!-- NEW -->
  <BudgetTable v-model="linesDraft.draft.lines" :draft="store.draft" :currency="tripCurrency" />
  <p><strong>Total: {{ formatMoney(store.total, tripCurrency) }}</strong></p>
  ```
  ```html
  <!-- OLD (line 152) -->
  <p>Equal share: {{ store.equal_share }}</p>
  ```
  ```html
  <!-- NEW -->
  <p>Equal share: {{ formatMoney(store.equal_share, tripCurrency) }}</p>
  ```

- [ ] **Step 7 (TripItineraryView.vue) — same defect, found during the grep above, in-scope as "hardcoded $ … est_cost".** Read at `web/src/views/trip/TripItineraryView.vue`. Needs the trips store (not currently imported) to read `.currency`, and must pass `index`/`currency` down to `DayCard` (Step 3 made both required-ish props):
  ```js
  // OLD (line 6, imports)
  import { useItineraryStore } from '../../stores/itinerary.js'
  ```
  ```js
  // NEW
  import { useItineraryStore } from '../../stores/itinerary.js'
  import { useTripsStore } from '../../stores/trips.js'
  ```
  ```js
  // OLD (line 17)
  const store = useItineraryStore()
  ```
  ```js
  // NEW
  const store = useItineraryStore()
  const trips = useTripsStore()
  ```
  Add near the other imports: `import { formatMoney } from '../../utils/format.js'`.
  ```html
  <!-- OLD (line 114, inside the AI-draft-preview block) -->
  <span v-if="it.est_cost != null">${{ it.est_cost }}</span>
  ```
  ```html
  <!-- NEW -->
  <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, trips.current?.currency) }}</span>
  ```
  ```html
  <!-- OLD (line 122) -->
  <DayCard v-for="day in store.days" :key="day.id" :day="day" />
  ```
  ```html
  <!-- NEW -->
  <DayCard
    v-for="(day, idx) in store.days"
    :key="day.id"
    :day="day"
    :index="idx + 1"
    :currency="trips.current?.currency"
  />
  ```

- [ ] **Step 8 (tests: symbol renders in a real mounted component).** In `web/src/views/trip/TripBudgetView.test.js`, add:
  ```js
  it('renders totals and equal share with the currency symbol', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ trip: { name: 'Goa 2026', currency: 'VND', participants: [] } })
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useBudgetStore()
    store.fetchBudget = vi.fn().mockImplementation(async () => { store.total = 500000; store.equal_share = 250000 })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/budget', name: 'trip-budget', component: TripBudgetView }]
    })
    await router.push('/trips/t1/budget')
    await router.isReady()
    const wrapper = mountWithBase(TripBudgetView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('₫500,000')
    expect(wrapper.text()).toContain('₫250,000')
  })
  ```
  This is a second, independent `mountView`-style setup (not a call to the shared `mountView()` helper) because it needs a different `api.get` mock than the file's default — matches the existing file's `beforeEach(() => { ...; vi.restoreAllMocks() })`, so the two tests don't leak mocks into each other.
- [ ] In `web/src/views/trip/TripOverviewView.test.js`, extend the first test's assertions (same `mountView` call, no new setup needed — its `trips.current` has no `currency` field, which is exactly the "falls back to INR" path):
  ```js
  // add to the existing 'shows hero, status stepper...' test, after the current assertions
  expect(wrapper.text()).toContain('₹') // budget.total isn't set by that test's mocks, so this only proves the branch — see next line
  ```
  Replace that placeholder with a real assertion instead — set a total via the budget store before mount. Add a **new** `it` rather than editing the existing one, so the existing one's intent (hero/stepper/next-actions) stays unchanged:
  ```js
  it('renders the budget stat with the trip currency (defaults to INR)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
        ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
      ]
    })
    await router.push('/trips/t1')
    await router.isReady()
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', participants: [] }
    const r = useReadinessStore()
    r.data = { decisions: {}, participants: [], checklists: { total_items: 0, done_items: 0, overdue: [] } }
    r.lastTripId = 't1'
    r.fetch = vi.fn().mockResolvedValue()
    const budget = useBudgetStore()
    budget.total = 12000
    budget.fetchBudget = vi.fn().mockResolvedValue()
    const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('₹12,000')
  })
  ```
- [ ] **Step 9 (component test: BudgetTable symbol).** Create `web/src/components/BudgetTable.test.js` (no test file existed for this component):
  ```js
  import { describe, it, expect } from 'vitest'
  import { mountWithBase } from '../test-utils.js'
  import BudgetTable from './BudgetTable.vue'

  describe('BudgetTable', () => {
    it('renders the footer total with the given currency symbol', () => {
      const wrapper = mountWithBase(BudgetTable, {
        props: { modelValue: [{ category: 'stay', estimate: 50000, basis: '' }], currency: 'THB' }
      })
      expect(wrapper.text()).toContain('฿50,000')
    })

    it('defaults to INR when no currency prop is given', () => {
      const wrapper = mountWithBase(BudgetTable, { props: { modelValue: [{ category: 'stay', estimate: 100, basis: '' }] } })
      expect(wrapper.text()).toContain('₹100')
    })
  })
  ```
- [ ] Run: `npm test --workspace=web` — expect all green.

---

### Task 2 — Humane day headers + trip countdown

**Files:**
- Modify: `web/src/utils/dates.js`
- Modify (tests): `web/src/utils/dates.test.js` (append `describe` blocks — do not touch the existing ones)
- Modify: `web/src/components/DayCard.vue` (header text; `index`/`currency` props already added in Task 1 step 3 — this step only touches the template text and the `Draft for …` line)
- Modify: `web/src/views/TripsListView.vue`, `web/src/views/trip/TripOverviewView.vue` (countdown chip)
- Test: `web/src/views/TripsListView.test.js`, `web/src/views/trip/TripOverviewView.test.js` (add cases)

**Interfaces:**
```js
// web/src/utils/dates.js
export function formatDayDate(iso)             // '2026-11-06' -> 'Fri 6 Nov'
export function dayHeader(iso, index)          // (iso, 1) -> 'Fri 6 Nov · Day 1'
export function tripCountdown(trip, today)     // -> { label } | null ; today defaults to startOfToday()
```
Verified in this Node (v26): `new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(new Date(2026,10,6))` → `'Fri'`, and `{month:'short'}` → `'Nov'` — i.e. `2026-11-06` (a real Friday) formats to exactly `'Fri 6 Nov'`, matching the spec's example.

- [ ] **Step 1 (failing tests).** Append to `web/src/utils/dates.test.js` (import list needs extending):
  ```js
  // OLD (line 2)
  import { parseIsoDate, toIsoDate, startOfToday, isExpiredIso } from './dates.js'
  ```
  ```js
  // NEW
  import { parseIsoDate, toIsoDate, startOfToday, isExpiredIso, formatDayDate, dayHeader, tripCountdown } from './dates.js'
  ```
  Append at end of file:
  ```js
  describe('formatDayDate', () => {
    it('renders weekday, day, month — no year, no leading zero', () => {
      expect(formatDayDate('2026-11-06')).toBe('Fri 6 Nov')
      expect(formatDayDate('2026-01-01')).toBe('Thu 1 Jan')
    })
    it('falls back to the raw string for malformed input', () => {
      expect(formatDayDate('nope')).toBe('nope')
      expect(formatDayDate('')).toBe('')
    })
  })

  describe('dayHeader', () => {
    it('appends a 1-based day index', () => {
      expect(dayHeader('2026-11-06', 1)).toBe('Fri 6 Nov · Day 1')
      expect(dayHeader('2026-11-07', 2)).toBe('Sat 7 Nov · Day 2')
    })
    it('omits the day index when none is given', () => {
      expect(dayHeader('2026-11-06')).toBe('Fri 6 Nov')
    })
  })

  describe('tripCountdown', () => {
    const T = (y, m, d) => new Date(y, m, d)

    it('is null for idea/planning status regardless of dates', () => {
      expect(tripCountdown({ status: 'idea', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 1))).toBeNull()
      expect(tripCountdown({ status: 'planning', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 1))).toBeNull()
    })
    it('is null with no dates, even if confirmed', () => {
      expect(tripCountdown({ status: 'confirmed' }, T(2026, 10, 1))).toBeNull()
    })
    it('counts down before the trip starts', () => {
      expect(tripCountdown({ status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 9, 5))).toEqual({ label: '32 days to go' })
    })
    it('says "Starts tomorrow" exactly one day out', () => {
      expect(tripCountdown({ status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 5))).toEqual({ label: 'Starts tomorrow' })
    })
    it('shows Day N of M on the start day and through the trip', () => {
      expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 6))).toEqual({ label: 'Day 1 of 5' })
      expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 8))).toEqual({ label: 'Day 3 of 5' })
      expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 10))).toEqual({ label: 'Day 5 of 5' })
    })
    it('says "Ended" the day after end_date', () => {
      expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 11))).toEqual({ label: 'Ended' })
    })
  })
  ```
- [ ] Run: `npm test --workspace=web -- dates.test` — expect FAIL (three new exports don't exist).
- [ ] **Step 2 (implement).** Append to `web/src/utils/dates.js`:
  ```js
  const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
  const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short' })
  const MS_PER_DAY = 86400000

  // 'Fri 6 Nov' — no year (this app never shows a day header far enough out for
  // the year to be ambiguous) and no leading zero on the day-of-month, unlike
  // the ISO string it replaces.
  export function formatDayDate(iso) {
    const d = parseIsoDate(iso)
    if (!d) return iso || ''
    return `${WEEKDAY_FMT.format(d)} ${d.getDate()} ${MONTH_FMT.format(d)}`
  }

  export function dayHeader(iso, index) {
    const date = formatDayDate(iso)
    return index != null ? `${date} · Day ${index}` : date
  }

  // Countdown chip. Pre-trip status only (idea/planning have no committed
  // dates worth counting down to); date math is inclusive of both the start
  // and end day, so a single-day trip reads "Day 1 of 1" rather than "of 0".
  export function tripCountdown(trip, today = startOfToday()) {
    if (!trip || !['confirmed', 'active'].includes(trip.status)) return null
    const start = parseIsoDate(trip.start_date)
    const end = parseIsoDate(trip.end_date)
    if (!start || !end) return null
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const daysToStart = Math.round((start - t) / MS_PER_DAY)
    const daysToEnd = Math.round((end - t) / MS_PER_DAY)
    if (daysToEnd < 0) return { label: 'Ended' }
    if (daysToStart > 1) return { label: `${daysToStart} days to go` }
    if (daysToStart === 1) return { label: 'Starts tomorrow' }
    const totalDays = Math.round((end - start) / MS_PER_DAY) + 1
    const dayNum = Math.round((t - start) / MS_PER_DAY) + 1
    return { label: `Day ${dayNum} of ${totalDays}` }
  }
  ```
- [ ] Run: `npm test --workspace=web -- dates.test` — expect PASS.

- [ ] **Step 3 (DayCard.vue header text).** Read at `web/src/components/DayCard.vue` (props already extended in Task 1 step 3 — do that step first, or add `index`/`currency` here if doing Task 2 standalone).
  ```js
  // add to the import line already touched in Task 1 step 3
  import { formatMoney } from '../utils/format.js'
  import { dayHeader, formatDayDate } from '../utils/dates.js'
  ```
  ```html
  <!-- OLD (line 72) -->
  <h3>{{ day.day_date }}</h3>
  ```
  ```html
  <!-- NEW -->
  <h3>{{ dayHeader(day.day_date, index) }}</h3>
  ```
  ```html
  <!-- OLD (line 110) -->
  <h4>Draft for {{ day.day_date }}</h4>
  ```
  ```html
  <!-- NEW -->
  <h4>Draft for {{ formatDayDate(day.day_date) }}</h4>
  ```
- [ ] **Step 4 (test).** Create `web/src/components/DayCard.test.js` (none existed — this file is also used by Task 3's confirm/aria-label tests below; write both sets of `it`s in the same file):
  ```js
  import { describe, it, expect, vi } from 'vitest'
  import { createPinia, setActivePinia } from 'pinia'
  import { mountWithBase } from '../test-utils.js'
  import DayCard from './DayCard.vue'
  import { useItineraryStore } from '../stores/itinerary.js'

  function mountDay(day, index = 1) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useItineraryStore()
    const wrapper = mountWithBase(DayCard, { pinia, props: { day, index, currency: 'INR' } })
    return { wrapper, store }
  }

  describe('DayCard', () => {
    it('renders a humane day header with a 1-based index', () => {
      const { wrapper } = mountDay({ id: 'd1', day_date: '2026-11-06', items: [] }, 1)
      expect(wrapper.find('h3').text()).toBe('Fri 6 Nov · Day 1')
    })

    it('renders est_cost with the currency symbol, not a bare $', () => {
      const { wrapper } = mountDay({
        id: 'd1', day_date: '2026-11-06',
        items: [{ id: 'i1', title: 'Snorkeling', est_cost: 1500 }]
      }, 1)
      expect(wrapper.text()).toContain('₹1,500')
      expect(wrapper.text()).not.toMatch(/\$1,?500/)
    })
  })
  ```
- [ ] Run: `npm test --workspace=web -- DayCard.test dates.test` — expect PASS.

- [ ] **Step 5 (countdown chip — TripsListView.vue).** Read at `web/src/views/TripsListView.vue`.
  ```js
  // OLD (line 7)
  import EmptyState from '../components/EmptyState.vue'
  ```
  ```js
  // NEW
  import EmptyState from '../components/EmptyState.vue'
  import Tag from 'primevue/tag'
  import { tripCountdown } from '../utils/dates.js'
  ```
  ```html
  <!-- OLD (line 78, the last <p class="trip-meta">) -->
          <p class="trip-meta"><i class="pi pi-users" /> {{ trip.participant_count }} participant{{ trip.participant_count === 1 ? '' : 's' }}</p>
        </RouterLink>
  ```
  ```html
  <!-- NEW -->
          <p class="trip-meta"><i class="pi pi-users" /> {{ trip.participant_count }} participant{{ trip.participant_count === 1 ? '' : 's' }}</p>
          <Tag v-if="tripCountdown(trip)" class="trip-countdown" :value="tripCountdown(trip).label" severity="info" />
        </RouterLink>
  ```
  Add to `<style scoped>`: `.trip-countdown { margin-top: 0.375rem; }` (matches the `0.375rem` rhythm `.hero-tags` already uses on `TripOverviewView.vue`).

- [ ] **Step 6 (countdown chip — TripOverviewView.vue).** Read at `web/src/views/trip/TripOverviewView.vue`.
  ```js
  // OLD (line 8)
  import { nextActions, readinessPercent } from '../../utils/tripNav.js'
  ```
  ```js
  // NEW
  import { nextActions, readinessPercent } from '../../utils/tripNav.js'
  import { tripCountdown } from '../../utils/dates.js'
  ```
  ```js
  // add alongside the other computed()s, e.g. after `dateRange` (line 27)
  const countdown = computed(() => (trip.value ? tripCountdown(trip.value) : null))
  ```
  ```html
  <!-- OLD (lines 66-68) -->
        <div v-if="(trip.vibe_tags || []).length" class="hero-tags">
          <Tag v-for="tag in trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
  ```
  ```html
  <!-- NEW -->
        <div v-if="(trip.vibe_tags || []).length || countdown" class="hero-tags">
          <Tag v-if="countdown" :value="countdown.label" severity="info" />
          <Tag v-for="tag in trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
  ```
- [ ] **Step 7 (tests).** In `web/src/views/TripsListView.test.js`, add:
  ```js
  it('shows a countdown chip only for confirmed/active trips with dates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 5)) // Oct 5 2026
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'trips', component: TripsListView },
        { path: '/trips/new', name: 'trip-new', component: { template: '<div/>' } },
        { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } }
      ]
    })
    await router.push('/')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.fetchTrips = vi.fn().mockImplementation(async () => {
      store.trips = [
        { id: 't1', name: 'Goa', status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10', participant_count: 1 },
        { id: 't2', name: 'Alps idea', status: 'idea', participant_count: 0 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('32 days to go')
    expect(wrapper.findAll('.trip-countdown')).toHaveLength(1)
    vi.useRealTimers()
  })
  ```
  In `web/src/views/trip/TripOverviewView.test.js`, add — self-contained (this file's shared
  `mountView()` hardcodes `status: 'planning'`, which never gets a countdown, correctly, so this
  test builds its own `trips.current` instead, same shape as Task 1 Step 8's new `it`):
  ```js
  it('shows a countdown chip in the hero for a confirmed trip with dates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 5))
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
        ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
      ]
    })
    await router.push('/trips/t1')
    await router.isReady()
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10', participants: [] }
    const r = useReadinessStore()
    r.data = { decisions: {}, participants: [], checklists: { total_items: 0, done_items: 0, overdue: [] } }
    r.lastTripId = 't1'
    r.fetch = vi.fn().mockResolvedValue()
    const budget = useBudgetStore()
    budget.fetchBudget = vi.fn().mockResolvedValue()
    const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('32 days to go')
    vi.useRealTimers()
  })
  ```
- [ ] Run: `npm test --workspace=web` — expect all green.

---

### Task 3 — Destructive-action calm-down + microcopy fixes

**Files:**
- Modify: `web/src/assets/main.css` (new shared `.icon-danger-btn` rule)
- Modify: `web/src/components/DayCard.vue`, `web/src/components/ChecklistCard.vue`, `web/src/views/trip/TripPeopleView.vue`, `web/src/views/trip/TripBudgetView.vue`
- Test: `web/src/components/DayCard.test.js` (append), `web/src/components/ChecklistCard.test.js` (create), `web/src/views/trip/TripPeopleView.test.js` (append), `web/src/views/trip/TripBudgetView.test.js` (append)

**Verified correction to the brief:** "BudgetTable override Remove" is not in `BudgetTable.vue` — that component only renders the category/estimate/basis table. The override-row Remove button (`label="Remove" size="small" severity="danger" text`) lives in `TripBudgetView.vue` line 177, inside its own `DataTable`. The plan below edits `TripBudgetView.vue` for that button.

**Verified: the ParticipantView greeting already has the space.** `web/src/views/ParticipantView.vue` line 87 reads (byte-checked with `python3 -c "print(repr(line))"`): `Hi {{ store.person.name }} 👋 you're invited to` — there is a real space between `👋` and `you're`. `grep -rn "👋" web/src/` finds no other occurrence. **No code change for this sub-item** — it does not reproduce. If the report that prompted this task came from a rendered screenshot rather than the source, the gap is a font/line-height rendering artifact, not a missing character; that would need a screenshot-driven follow-up (out of scope here), not a text edit.

**Interfaces:** no new exported functions — this task only changes button markup/CSS. Buttons keep their existing `@click` handlers and `confirm.require(...)` calls untouched.

- [ ] **Step 1 (shared CSS).** Append to `web/src/assets/main.css`, after the `.status-tag` rule at the end of the file:
  ```css
  /* Icon-only destructive row actions (DayCard item rows, ChecklistCard items,
     TripPeopleView remove/revoke, TripBudgetView override Remove). A bare
     outlined-red "Delete" on every row read as an alarm before anything was
     touched; muted at rest, danger-red only on hover/focus-visible.
     !important: PrimeVue's `text`/`outlined` variants set color from their own
     custom-property chain (--p-button-text-secondary-color etc.), which plain
     selector specificity does not reliably beat. */
  .icon-danger-btn {
    color: var(--app-text-muted) !important;
  }
  .icon-danger-btn:hover,
  .icon-danger-btn:focus-visible {
    color: var(--app-danger) !important;
  }
  @media (max-width: 767px) {
    /* Same 44px minimum AppNav.vue already holds its icon-only controls to
       (.app-theme-toggle, .app-search-trigger) — this is the same shape of
       control (icon-only, only ever tapped on a phone), just in a list row
       instead of the nav bar. */
    .icon-danger-btn {
      min-width: 2.75rem;
      min-height: 2.75rem;
    }
  }
  ```

- [ ] **Step 2 (DayCard.vue).** Read at `web/src/components/DayCard.vue`.
  ```html
  <!-- OLD (line 84) -->
  <Button type="button" label="Delete" severity="danger" outlined @click="remove(item)" />
  ```
  ```html
  <!-- NEW -->
  <Button type="button" icon="pi pi-trash" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${item.title}`" @click="remove(item)" />
  ```

- [ ] **Step 3 (ChecklistCard.vue).** Read at `web/src/components/ChecklistCard.vue`. Only the item-row Delete (line 135) is in scope — the checklist-level "Delete checklist" footer button (line 180) is a different pattern (card-level action, not a list row) and stays as-is.
  ```html
  <!-- OLD (line 135) -->
  <Button type="button" label="Delete" severity="danger" outlined @click="removeItem(item.id)" />
  ```
  ```html
  <!-- NEW -->
  <Button type="button" icon="pi pi-times" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${item.title}`" @click="removeItem(item.id)" />
  ```
  (`pi-times` rather than `pi-trash` here: this delete is deliberately unconfirmed per the existing code comment at lines 67-71 — a heavier trash icon reads as more destructive than the un-confirmed action actually is; the checklist-level `pi-trash`-worthy delete already keeps its full label+confirm treatment untouched.)

- [ ] **Step 4 (TripPeopleView.vue).** Read at `web/src/views/trip/TripPeopleView.vue`.
  ```html
  <!-- OLD (line 139) -->
  <Button label="Remove" size="small" severity="danger" outlined @click="removeParticipant(p.person_id)" />
  ```
  ```html
  <!-- NEW -->
  <Button icon="pi pi-trash" size="small" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Remove ${p.name}`" @click="removeParticipant(p.person_id)" />
  ```
  ```html
  <!-- OLD (line 153) -->
  <Button v-else label="Revoke" size="small" severity="danger" outlined @click="revokeLink(link.id, p.name)" />
  ```
  ```html
  <!-- NEW -->
  <Button v-else icon="pi pi-times" size="small" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Revoke link for ${p.name || 'this person'}`" @click="revokeLink(link.id, p.name)" />
  ```

- [ ] **Step 5 (TripBudgetView.vue — the actual "BudgetTable override Remove").** Read at `web/src/views/trip/TripBudgetView.vue`.
  ```html
  <!-- OLD (line 177) -->
  <Button label="Remove" size="small" severity="danger" text @click="removeOverrideRow(data.person_id)" />
  ```
  ```html
  <!-- NEW -->
  <Button icon="pi pi-times" size="small" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Remove override for ${data.person_name}`" @click="removeOverrideRow(data.person_id)" />
  ```

- [ ] **Step 6 (tests — failing first).** Append to `web/src/components/DayCard.test.js` (created in Task 2 Step 4 — if doing Task 3 standalone, create it with just this `it` plus the necessary imports):
  ```js
  import ConfirmDialog from 'primevue/confirmdialog'

  it('keeps an aria-label and still confirms before deleting an item', async () => {
    const { wrapper, store } = mountDay({
      id: 'd1', day_date: '2026-11-06',
      items: [{ id: 'i1', title: 'Snorkeling', est_cost: null }]
    }, 1)
    store.deleteItem = vi.fn().mockResolvedValue()
    const delBtn = wrapper.find('[aria-label="Delete Snorkeling"]')
    expect(delBtn.exists()).toBe(true)
    // ConfirmDialog isn't mounted by DayCard itself (App.vue owns the global
    // one) — mount it alongside so confirm.require()'s dialog actually renders.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await delBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Delete "Snorkeling" from 2026-11-06?')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.deleteItem).toHaveBeenCalledWith('i1')
    dialogWrapper.unmount()
  })
  ```
  **UNVERIFIED:** whether `ConfirmDialog` needs to share the *same* Pinia/PrimeVue plugin instance as `DayCard` to see the same confirm-service event bus, or whether PrimeVue's `ConfirmationEventBus` is a module-level singleton independent of the Vue app instance (the latter is how PrimeVue's services are documented to work, but not directly confirmed by reading this repo's tests — no existing test here exercises a `confirm.require()` dialog end-to-end). If the two separate `mountWithBase()` calls don't share the bus, mount `DayCard` and `ConfirmDialog` as siblings inside one wrapper component instead:
  ```js
  const Host = { components: { DayCard, ConfirmDialog }, props: ['day', 'index', 'currency'], template: '<div><DayCard :day="day" :index="index" :currency="currency" /><ConfirmDialog /></div>' }
  ```
  and mount `Host` once via `mountWithBase`. Try the simpler two-`mountWithBase` version first; fall back to `Host` if the dialog text doesn't appear.
- [ ] Run: `npm test --workspace=web -- DayCard.test` — expect FAIL (aria-labels don't exist yet).
- [ ] Apply Steps 2-5 above (implement).
- [ ] Run: `npm test --workspace=web -- DayCard.test` — expect PASS.

- [ ] **Step 7 (ChecklistCard test — new file).** Create `web/src/components/ChecklistCard.test.js`:
  ```js
  import { describe, it, expect, vi } from 'vitest'
  import { createPinia, setActivePinia } from 'pinia'
  import { mountWithBase } from '../test-utils.js'
  import ChecklistCard from './ChecklistCard.vue'
  import { useChecklistsStore } from '../stores/checklists.js'

  function mountCard(checklist) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChecklistsStore()
    const wrapper = mountWithBase(ChecklistCard, { pinia, props: { checklist, participants: [] } })
    return { wrapper, store }
  }

  describe('ChecklistCard', () => {
    it('keeps an aria-label on the item delete button and calls the store directly (no confirm)', async () => {
      const { wrapper, store } = mountCard({
        id: 'c1', name: 'Packing', kind: 'packing',
        items: [{ id: 'i1', title: 'Passport', done: false }]
      })
      store.deleteItem = vi.fn().mockResolvedValue()
      const delBtn = wrapper.find('[aria-label="Delete Passport"]')
      expect(delBtn.exists()).toBe(true)
      await delBtn.trigger('click')
      expect(store.deleteItem).toHaveBeenCalledWith('i1')
    })
  })
  ```
- [ ] Run: `npm test --workspace=web -- ChecklistCard.test` — expect PASS once Step 3 is applied (write this test before Step 3 to keep TDD order; it will fail on the aria-label lookup first).

- [ ] **Step 8 (TripPeopleView test).** Append to `web/src/views/trip/TripPeopleView.test.js`:
  ```js
  it('keeps aria-labels on Remove/Revoke and still confirms before acting', async () => {
    const { wrapper, trips } = await mountView()
    trips.removeParticipant = vi.fn().mockResolvedValue()
    const removeBtn = wrapper.find('[aria-label="Remove Asha"]')
    expect(removeBtn.exists()).toBe(true)
    // TripPeopleView renders no <ConfirmDialog/> of its own (App.vue owns the
    // global one) — assert the click reaches confirm.require by checking the
    // handler fires without throwing; the end-to-end accept flow is covered by
    // DayCard.test.js's ConfirmDialog-mounted case, so this test only needs to
    // prove the button and its handler are still wired, with the label intact.
    await removeBtn.trigger('click')
  })
  ```
- [ ] **Step 9 (TripBudgetView test).** Append to `web/src/views/trip/TripBudgetView.test.js`:
  ```js
  it('override Remove button is icon-only with an aria-label', async () => {
    localStorage.setItem('tripper:draft:trip:t1:budget-overrides', JSON.stringify({
      overrides: [{ person_id: 'p1', person_name: 'Asha', amount: 100, note: '' }]
    }))
    const { wrapper } = await mountView()
    expect(wrapper.find('[aria-label="Remove override for Asha"]').exists()).toBe(true)
  })
  ```
- [ ] Run: `npm test --workspace=web` — expect all green.

---

### Task 4 — Trips list responsive grid + vibe accent

**Verified, changes the scope of this task:** `web/src/views/TripsListView.vue`'s `.trip-grid` rule (already in the file, not added by this plan) is:
```css
.trip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr)); gap: 1rem; }
```
This is already a responsive auto-fill grid — the brief's "renders one narrow column of cards" does not reproduce against the current code. **No grid work needed.** The only real gap is the accent: today it is `trip.status`-keyed (`:class="trip-card-${trip.status}"`, 5 CSS rules), not vibe-tag-keyed, and status is already shown by the group heading (`<h2 class="group-title">{{ group.status }}</h2>`) — so the border is currently a redundant status re-statement rather than new information. This task replaces it with the requested vibe-tag hash accent.

**Files:**
- Create: `web/src/utils/vibeAccent.js`
- Create: `web/src/utils/vibeAccent.test.js`
- Modify: `web/src/views/TripsListView.vue`
- Test: `web/src/views/TripsListView.test.js` (append)

**Interfaces:**
```js
// web/src/utils/vibeAccent.js
export function vibeAccentColor(vibeTags) // string[] | undefined -> CSS color string | null
```
Palette drawn from existing `--app-*` tokens already used elsewhere as both text and border colors (so contrast is not a new question this task has to re-litigate): `--app-primary`, `--app-accent-strong`, `--app-success`, `--app-text-muted`. Deliberately excludes `--app-danger` — a red accent stripe on an ordinary trip card would read as an error state, which is exactly the "calm down destructive red" instinct Task 3 is built around.

Verified hash outputs (`node -e` with the exact algorithm below, 32-bit unsigned, mod 4):
`'beach' → index 3 → var(--app-text-muted)`, `'relax' → index 0 → var(--app-primary)`, `'foodie' → index 2 → var(--app-success)`.

- [ ] **Step 1 (failing test).** Create `web/src/utils/vibeAccent.test.js`:
  ```js
  import { describe, it, expect } from 'vitest'
  import { vibeAccentColor } from './vibeAccent.js'

  describe('vibeAccentColor', () => {
    it('is deterministic for the same first tag', () => {
      expect(vibeAccentColor(['beach'])).toBe('var(--app-text-muted)')
      expect(vibeAccentColor(['beach'])).toBe(vibeAccentColor(['beach']))
    })
    it('spot-checks two other tags land on different palette entries', () => {
      expect(vibeAccentColor(['relax'])).toBe('var(--app-primary)')
      expect(vibeAccentColor(['foodie'])).toBe('var(--app-success)')
    })
    it('is null with no vibe tags', () => {
      expect(vibeAccentColor([])).toBeNull()
      expect(vibeAccentColor(undefined)).toBeNull()
    })
    it('only the first tag matters', () => {
      expect(vibeAccentColor(['beach', 'relax'])).toBe(vibeAccentColor(['beach']))
    })
  })
  ```
- [ ] Run: `npm test --workspace=web -- vibeAccent.test` — expect FAIL (module doesn't exist).
- [ ] **Step 2 (implement).** Create `web/src/utils/vibeAccent.js`:
  ```js
  // Deterministic accent color for a trip card, drawn from its first vibe tag.
  // Not a status indicator — the trips-list group heading already says that —
  // this is a texture that makes same-vibe trips recognizable at a glance in a
  // grid where every card is otherwise the same white rectangle.
  const PALETTE = ['var(--app-primary)', 'var(--app-accent-strong)', 'var(--app-success)', 'var(--app-text-muted)']

  export function vibeAccentColor(vibeTags) {
    const tag = (vibeTags || [])[0]
    if (!tag) return null
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
    return PALETTE[hash % PALETTE.length]
  }
  ```
- [ ] Run: `npm test --workspace=web -- vibeAccent.test` — expect PASS.

- [ ] **Step 3 (TripsListView.vue).** Read at `web/src/views/TripsListView.vue`.
  ```js
  // OLD (line 9)
  import EmptyState from '../components/EmptyState.vue'
  ```
  ```js
  // NEW (Task 2 Step 5 also touches this import block — merge both additions into one edit if doing both tasks)
  import EmptyState from '../components/EmptyState.vue'
  import { vibeAccentColor } from '../utils/vibeAccent.js'
  ```
  ```html
  <!-- OLD (lines 68-74) -->
        <RouterLink
          v-for="trip in group.trips"
          :key="trip.id"
          :to="{ name: 'trip-overview', params: { id: trip.id } }"
          class="card trip-card"
          :class="`trip-card-${trip.status}`"
        >
  ```
  ```html
  <!-- NEW -->
        <RouterLink
          v-for="trip in group.trips"
          :key="trip.id"
          :to="{ name: 'trip-overview', params: { id: trip.id } }"
          class="card trip-card"
          :class="{ 'trip-card-archived': trip.status === 'archived' }"
          :style="{ borderLeftColor: vibeAccentColor(trip.vibe_tags) }"
        >
  ```
  ```css
  /* OLD (lines 92-106) */
  .trip-card {
    display: block;
    text-decoration: none;
    color: inherit;
    margin-bottom: 0;
    border-left: 3px solid var(--app-border);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .trip-card:hover { box-shadow: var(--app-shadow-md); transform: translateY(-1px); }
  .trip-card h3 { margin-bottom: 0.5rem; }
  .trip-card-idea { border-left-color: var(--app-text-muted); }
  .trip-card-planning { border-left-color: var(--app-accent); }
  .trip-card-confirmed { border-left-color: var(--app-primary); }
  .trip-card-active { border-left-color: var(--app-success); }
  .trip-card-archived { border-left-color: var(--app-border); opacity: 0.75; }
  ```
  ```css
  /* NEW */
  .trip-card {
    display: block;
    text-decoration: none;
    color: inherit;
    margin-bottom: 0;
    border-left: 3px solid var(--app-border);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .trip-card:hover { box-shadow: var(--app-shadow-md); transform: translateY(-1px); }
  .trip-card h3 { margin-bottom: 0.5rem; }
  /* Color now comes from the inline style (vibeAccentColor) rather than
     status — the group heading above already says the status. */
  .trip-card-archived { opacity: 0.75; }
  ```
- [ ] **Step 4 (test).** Append to `web/src/views/TripsListView.test.js` (new `it`, same file, own router/pinia per the file's existing single-test convention):
  ```js
  it('gives cards a vibe-tag accent color, deterministic per tag, absent with no tags', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'trips', component: TripsListView },
        { path: '/trips/new', name: 'trip-new', component: { template: '<div/>' } },
        { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } }
      ]
    })
    await router.push('/')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.fetchTrips = vi.fn().mockImplementation(async () => {
      store.trips = [
        { id: 't1', name: 'Goa', status: 'planning', vibe_tags: ['beach'], participant_count: 1 },
        { id: 't2', name: 'Kerala', status: 'planning', vibe_tags: ['beach'], participant_count: 1 },
        { id: 't3', name: 'No vibe', status: 'planning', participant_count: 1 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.trip-card')
    expect(cards[0].attributes('style')).toContain('border-left-color: var(--app-text-muted)')
    expect(cards[0].attributes('style')).toBe(cards[1].attributes('style'))
    expect(cards[2].attributes('style') || '').not.toContain('border-left-color')
  })
  ```
  **Caution:** happy-dom's `CSSStyleDeclaration` may not preserve a `var(...)` function value assigned
  via `:style="{ borderLeftColor: ... }"` when it serializes the element's `style` attribute — if
  `attributes('style')` doesn't contain the literal `var(--app-text-muted)` text under this repo's
  test environment, assert on the resolved property instead: `cards[0].element.style.borderLeftColor`
  (vue-test-utils/happy-dom is more likely to normalize the live CSSOM property than the attribute
  string), matching whatever `vibeAccentColor(...)` actually returns per Step 2 below.
- [ ] Run: `npm test --workspace=web` — expect all green.

---

### Task 5 — Readiness tags become links + single status control

**Files:**
- Modify: `web/src/views/trip/TripReadinessView.vue`
- Create: `web/src/views/trip/TripReadinessView.test.js` (no test file existed for this view)
- Modify: `web/src/views/trip/TripSettingsView.vue`
- Modify: `web/src/views/trip/TripSettingsView.test.js`

**§8.23 (design/ia.md) — what was actually found, and the fallback used.** `design/ia.md:118` says only *"The two duplicate forward-status controls (§8.23) collapsed to one, in the lifecycle strip."* — it does not name today's IA (sidebar vs. Settings) at all; §8.23 itself is not defined anywhere in this repo (`grep -rn "8\.23"` across `design/*.md` finds only that one reference). The "lifecycle strip" it refers to is a *new*, much bigger surface that exists only in the mockup (`design/trip.html:683`, `<!-- lifecycle — the only status control -->`) — an auto-advancing decision timeline with per-status copy, which is a real feature (not a Phase-1 polish item) and out of scope here. Per the task brief's own fallback ("otherwise keep the sidebar quick-advance and reduce Settings to a read-only status display plus its archive/clone controls"), this plan keeps `TripLayout.vue`'s sidebar button untouched and makes `TripSettingsView.vue`'s Status section read-only.

**Interfaces:** no new functions; `TripReadinessView.vue` gains route links using its existing `tripId` computed and the route names already in `web/src/utils/tripNav.js`'s `TRIP_SECTIONS` (`trip-dates`, `trip-destination`, `trip-budget`, `trip-itinerary`, `trip-people`, `trip-checklists`).

- [ ] **Step 1 (failing test).** Create `web/src/views/trip/TripReadinessView.test.js`:
  ```js
  import { describe, it, expect } from 'vitest'
  import { createRouter, createMemoryHistory } from 'vue-router'
  import { createPinia, setActivePinia } from 'pinia'
  import { mountWithBase } from '../../test-utils.js'
  import TripReadinessView from './TripReadinessView.vue'
  import { useReadinessStore } from '../../stores/readiness.js'

  const SECTIONS = ['trip-dates', 'trip-destination', 'trip-budget', 'trip-itinerary', 'trip-people', 'trip-checklists']

  async function mountView(data) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/trips/:id/readiness', name: 'trip-readiness', component: TripReadinessView },
        ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
      ]
    })
    await router.push('/trips/t1/readiness')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useReadinessStore()
    store.fetch = async () => { store.data = data }
    await store.fetch('t1')
    const wrapper = mountWithBase(TripReadinessView, { pinia, global: { plugins: [router] } })
    return { wrapper }
  }

  describe('TripReadinessView', () => {
    it('links decision chips, participant tags, and overdue items to the section that fixes them', async () => {
      const { wrapper } = await mountView({
        decisions: { dates_confirmed: 0, destination_decided: 1, budget_drafted: 0, itinerary_days: 0 },
        participants: [{ person_id: 'p1', name: 'Asha', profile_confirmed: 0, docs_count: 1, doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-01-01' }], has_active_link: true }],
        checklists: { total_items: 2, done_items: 0, overdue: [{ title: 'Book flights', due_date: '2026-01-01' }] }
      })
      const links = wrapper.findAll('a')
      expect(links.some((a) => a.attributes('href') === '/trips/t1/dates')).toBe(true)
      expect(links.some((a) => a.attributes('href') === '/trips/t1/destination')).toBe(true)
      expect(links.some((a) => a.attributes('href') === '/trips/t1/budget')).toBe(true)
      expect(links.some((a) => a.attributes('href') === '/trips/t1/itinerary')).toBe(true)
      // the profile tag and the doc-warning tag both point at People
      expect(links.filter((a) => a.attributes('href') === '/trips/t1/people').length).toBeGreaterThanOrEqual(2)
      expect(links.some((a) => a.attributes('href') === '/trips/t1/checklists')).toBe(true)
    })
  })
  ```
- [ ] Run: `npm test --workspace=web -- TripReadinessView.test` — expect FAIL (no links exist yet).
- [ ] **Step 2 (implement).** Read at `web/src/views/trip/TripReadinessView.vue`.
  ```js
  // OLD (lines 32-41)
  const decisionChips = computed(() => {
    const d = store.data?.decisions
    if (!d) return []
    return [
      { label: 'Dates', ok: !!d.dates_confirmed },
      { label: 'Destination', ok: !!d.destination_decided },
      { label: 'Budget', ok: !!d.budget_drafted },
      { label: 'Itinerary', ok: d.itinerary_days > 0, detail: `${d.itinerary_days} day(s)` }
    ]
  })
  ```
  ```js
  // NEW
  const decisionChips = computed(() => {
    const d = store.data?.decisions
    if (!d) return []
    return [
      { label: 'Dates', ok: !!d.dates_confirmed, to: 'trip-dates' },
      { label: 'Destination', ok: !!d.destination_decided, to: 'trip-destination' },
      { label: 'Budget', ok: !!d.budget_drafted, to: 'trip-budget' },
      { label: 'Itinerary', ok: d.itinerary_days > 0, detail: `${d.itinerary_days} day(s)`, to: 'trip-itinerary' }
    ]
  })
  ```
  ```html
  <!-- OLD (lines 63-70) -->
        <div class="tag-row">
          <Tag
            v-for="chip in decisionChips"
            :key="chip.label"
            :value="chipText(chip)"
            :severity="chip.ok ? 'success' : 'warn'"
          />
        </div>
  ```
  ```html
  <!-- NEW -->
        <div class="tag-row">
          <RouterLink
            v-for="chip in decisionChips"
            :key="chip.label"
            :to="{ name: chip.to, params: { id: tripId } }"
            class="tag-link"
          >
            <Tag :value="chipText(chip)" :severity="chip.ok ? 'success' : 'warn'" />
          </RouterLink>
        </div>
  ```
  ```html
  <!-- OLD (lines 77-81, "Profile" column) -->
          <Column header="Profile">
            <template #body="{ data }">
              <Tag :value="data.profile_confirmed ? '✓' : '✗'" :severity="data.profile_confirmed ? 'success' : 'warn'" />
            </template>
          </Column>
  ```
  ```html
  <!-- NEW -->
          <Column header="Profile">
            <template #body="{ data }">
              <RouterLink :to="{ name: 'trip-people', params: { id: tripId } }" class="tag-link">
                <Tag :value="data.profile_confirmed ? '✓' : '✗'" :severity="data.profile_confirmed ? 'success' : 'warn'" />
              </RouterLink>
            </template>
          </Column>
  ```
  ```html
  <!-- OLD (lines 83-95, "Doc warnings" column) -->
          <Column header="Doc warnings">
            <template #body="{ data }">
              <span v-if="!data.doc_warnings.length">—</span>
              <div v-else class="tag-row">
                <Tag
                  v-for="(w, i) in data.doc_warnings"
                  :key="i"
                  :value="`${w.doc_type} ${w.level} (${w.expiry_date})`"
                  :severity="w.level === 'expired' ? 'danger' : 'warn'"
                />
              </div>
            </template>
          </Column>
  ```
  ```html
  <!-- NEW -->
          <Column header="Doc warnings">
            <template #body="{ data }">
              <span v-if="!data.doc_warnings.length">—</span>
              <div v-else class="tag-row">
                <RouterLink
                  v-for="(w, i) in data.doc_warnings"
                  :key="i"
                  :to="{ name: 'trip-people', params: { id: tripId } }"
                  class="tag-link"
                >
                  <Tag :value="`${w.doc_type} ${w.level} (${w.expiry_date})`" :severity="w.level === 'expired' ? 'danger' : 'warn'" />
                </RouterLink>
              </div>
            </template>
          </Column>
  ```
  ```html
  <!-- OLD (lines 109-114) -->
        <ul v-else>
          <li v-for="(item, i) in store.data.checklists.overdue" :key="i">
            {{ item.title }} — due {{ item.due_date }}<template v-if="item.assignee_name"> ({{ item.assignee_name }})</template>
          </li>
        </ul>
  ```
  ```html
  <!-- NEW -->
        <ul v-else>
          <li v-for="(item, i) in store.data.checklists.overdue" :key="i">
            <RouterLink :to="{ name: 'trip-checklists', params: { id: tripId } }" class="tag-link">
              {{ item.title }} — due {{ item.due_date }}<template v-if="item.assignee_name"> ({{ item.assignee_name }})</template>
            </RouterLink>
          </li>
        </ul>
  ```
  ```css
  <!-- OLD (lines 120-125) -->
  <style scoped>
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  </style>
  ```
  ```css
  <!-- NEW -->
  <style scoped>
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .tag-link { color: inherit; text-decoration: none; }
  </style>
  ```
- [ ] Run: `npm test --workspace=web -- TripReadinessView.test` — expect PASS.

- [ ] **Step 3 (failing test for Settings read-only status).** In `web/src/views/trip/TripSettingsView.test.js`:
  ```js
  // OLD
  it('renders basics form seeded from trip and status control', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.find('#ts-name').element.value).toBe('Goa 2026')
    expect(wrapper.text()).toContain('Confirm trip')
  })
  ```
  ```js
  // NEW
  it('renders basics form seeded from trip and a read-only status (advance moved to the sidebar)', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.find('#ts-name').element.value).toBe('Goa 2026')
    expect(wrapper.findAll('button').some((b) => b.text().match(/Advance|Confirm trip|Activate|Start planning/))).toBe(false)
    expect(wrapper.text()).not.toContain('Confirm trip')
    expect(wrapper.text()).toContain('quick action in the sidebar')
  })
  ```
- [ ] Run: `npm test --workspace=web -- TripSettingsView.test` — expect FAIL (`Confirm trip` button still renders; the sidebar-hint text doesn't exist yet).
- [ ] **Step 4 (implement).** Read at `web/src/views/trip/TripSettingsView.vue`.
  ```js
  // OLD (lines 63-74)
  // --- Status lifecycle ---
  const NEXT_STATUS = {
    idea: { label: 'Start planning', target: 'planning' },
    planning: { label: 'Confirm trip', target: 'confirmed' },
    confirmed: { label: 'Activate', target: 'active' }
  }
  const nextTransition = computed(() => trips.current ? NEXT_STATUS[trips.current.status] : null)

  async function advanceStatus() {
    if (!nextTransition.value) return
    try { await trips.setStatus(tripId.value, nextTransition.value.target) } catch (e) { notify.error(e.message) }
  }
  ```
  ```js
  // NEW — this whole block is deleted. Status is now read-only here; advancing
  // it lives only in TripLayout.vue's sidebar (unchanged — verified it already
  // has its own NEXT_STATUS/nextTransition/advanceStatus, so nothing regresses).
  ```
  ```html
  <!-- OLD (lines 185-192) -->
    <section class="card">
      <h2>Status</h2>
      <p>
        Current: <Tag class="status-tag" :value="trips.current?.status || '…'" severity="info" />
      </p>
      <p class="muted">Lifecycle: idea → planning → confirmed → active → archived. Confirming locks dates for participants; archiving (below) snapshots everything and revokes links.</p>
      <Button v-if="nextTransition" :label="nextTransition.label" outlined @click="advanceStatus" />
    </section>
  ```
  ```html
  <!-- NEW -->
    <section class="card">
      <h2>Status</h2>
      <p>
        Current: <Tag class="status-tag" :value="trips.current?.status || '…'" severity="info" />
      </p>
      <p class="muted">Lifecycle: idea → planning → confirmed → active → archived. Confirming locks dates for participants; archiving (below) snapshots everything and revokes links.</p>
      <p class="muted">Advance the status from the quick action in the sidebar.</p>
    </section>
  ```
  Note: `Button` is still imported and used elsewhere in this file (Save changes, Archive trip, Save notes & links, Save actuals, Clone trip) — the import stays. `useNotify`'s `notify` is likewise still used by `saveBasics`/`doArchive`/`saveMeta`/`saveActuals`/`cloneTrip` — no import changes needed beyond removing the deleted block above.
- [ ] Run: `npm test --workspace=web -- TripSettingsView.test` — expect PASS.
- [ ] Run: `npm test --workspace=web -- TripLayout.test` — expect PASS unchanged (confirms the sidebar quick-advance still works; no edits were made to `TripLayout.vue`).
- [ ] Run: `npm test --workspace=web` — expect all green.

---

## Cross-task notes for whoever implements this

- Tasks 1 and 2 both touch `DayCard.vue`'s `defineProps` and `TripItineraryView.vue`'s `DayCard` invocation — do Task 1 Step 3/7 first, then Task 2 Step 3 only adds the header-text lines on top of props that already exist.
- Tasks 2 and 4 both touch `TripsListView.vue`'s import block — merge the two import additions (`Tag`/`tripCountdown` from Task 2, `vibeAccentColor` from Task 4) into a single edit rather than two separate diffs against the same line.
- After all five tasks: run the full suite once more — `npm test --workspace=web` — and separately confirm nothing server-side was touched (`git status` should show no changes under `server/`).
- Do not commit — per repo policy (`CLAUDE.md`), report the changed-file list and test output and wait.

# Phase 2 — Participant experience

# Phase 2 — Participant Experience

Prereqs verified against current tree (2026-09-05, branch `restructure/zoho-catalyst-migration`):
- `web/src/utils/dates.js` currently exports only `parseIsoDate`, `toIsoDate`, `startOfToday`, `isExpiredIso`. It does **not** yet export `dayHeader` or `tripCountdown` (Phase 1 Task 2).
- `web/src/utils/format.js` currently exports only `formatAmount`, `humanizeEnum`. It does **not** yet export `formatMoney` (Phase 1 Task 1).
- Task 7 and Task 8 below consume those two not-yet-shipped helpers. Each such task starts with an explicit verification step that fails loudly (not silently falls back) if Phase 1 hasn't landed, per the "note the dependency" instruction. Do not invent fallback implementations of `formatMoney`/`dayHeader`/`tripCountdown` inside Phase 2 files — that would create a second definition to reconcile later.
- `budget.routes.js` currently exports only `{ CATEGORIES }` (line 6) — `budgetShape` is a local, unexported function. Task 6 promotes it to an export rather than duplicating the query.
- No `web/src/utils/itinerary.js` exists yet. Task 7 creates it; Task 9 extends it.

---

### Task 6 — Server: enrich `GET /api/participant/me`

**Files:**
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/server/src/routes/budget.routes.js` (line 6 export list)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/server/src/routes/participant.routes.js` (route body, lines 19–35)
- Test: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/server/test/participant.test.js`

**Interfaces:**
- `budgetShape(app, tripId)` (existing, now exported) → `{ lines, total, participant_count, equal_share, overrides: [{person_id, person_name, amount, note}] }`.
- New response shape for `GET /participant/me` — additive only, existing keys (`trip`, `person`, `profile_confirmed`) unchanged:
  ```js
  {
    trip: { ...unchanged... },
    person: { ...unchanged... },
    profile_confirmed: 0|1,
    itinerary: [{ day_date: string, items: [{ title, time_range, location, category, est_cost, notes, link }] }],
    budget: { currency: string, equal_share: number, my_amount: number } | null,
    companions: string[],   // first names only, other participants
    companion_count: number // total participants on the trip (self included)
  }
  ```

**Steps:**

- [ ] 1. Write failing tests in `server/test/participant.test.js`, appended inside the existing `describe('participant self-service', ...)` block, following the file's existing `seedLink`/`createPerson`/`createTrip` helpers:

  ```js
  it('GET /participant/me returns itinerary ordered by day/item position, empty when no days exist', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p)
    let res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.json().itinerary).toEqual([])

    await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', ['d1', t.id, '2026-08-02', 1])
    await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)', ['d0', t.id, '2026-08-01', 0])
    await db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['i2', 'd0', 1, 'Dinner', '19:00–21:00', 'Beach Shack', 'food', 800, null, null])
    await db.run(
      `INSERT INTO itinerary_items (id, day_id, position, title, time_range, location, category, est_cost, notes, link)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['i1', 'd0', 0, 'Arrival', '10:00–11:00', 'Airport', 'travel', null, null, null])

    res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.itinerary).toEqual([
      { day_date: '2026-08-01', items: [
        { title: 'Arrival', time_range: '10:00–11:00', location: 'Airport', category: 'travel', est_cost: null, notes: null, link: null },
        { title: 'Dinner', time_range: '19:00–21:00', location: 'Beach Shack', category: 'food', est_cost: 800, notes: null, link: null },
      ] },
      { day_date: '2026-08-02', items: [] },
    ])
  })

  it('GET /participant/me returns budget with my_amount from override, falling back to equal_share', async () => {
    const { app, db } = await makeTestApp()
    const p1 = await createPerson(db, { name: 'Asha Rao' })
    const p2 = await createPerson(db, { name: 'Priya Shah' })
    const t = await createTrip(db, { currency: 'INR' })
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p1.id])
    const raw = await seedLink(app, db, t, p2) // p2 gets the participant link; p1 already seeded above
    await db.run('INSERT INTO budget_lines (id, trip_id, category, estimate) VALUES (?,?,?,?)', ['b1', t.id, 'stay', 10000])
    await db.run('INSERT INTO budget_overrides (id, trip_id, person_id, amount) VALUES (?,?,?,?)', ['o1', t.id, p2.id, 3000])

    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.budget.currency).toBe('INR')
    expect(body.budget.my_amount).toBe(3000) // p2 has an override
  })

  it('GET /participant/me returns budget: null when no budget lines exist', async () => {
    const { app, db } = await makeTestApp()
    const p = await createPerson(db)
    const t = await createTrip(db)
    const raw = await seedLink(app, db, t, p)
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    expect(res.json().budget).toBeNull()
  })

  it('GET /participant/me exposes only first names of companions, never their email/phone/full name', async () => {
    const { app, db } = await makeTestApp()
    const me = await createPerson(db, { name: 'Priya Shah', email: 'priya@x.dev' })
    const other = await createPerson(db, { name: 'Asha Rao', email: 'asha-secret@x.dev', phone: '9990001111' })
    const t = await createTrip(db)
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, other.id])
    const raw = await seedLink(app, db, t, me)
    const res = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${raw}` } })
    const body = res.json()
    expect(body.companions).toEqual(['Asha'])
    expect(body.companion_count).toBe(2)
    expect(res.payload).not.toContain('asha-secret@x.dev')
    expect(res.payload).not.toContain('9990001111')
    expect(res.payload).not.toContain('Asha Rao') // full name never leaks, only "Asha"
  })
  ```

- [ ] 2. Run and confirm these 4 new tests fail (others in the file still pass): `npm test --workspace=server -- participant.test.js`. Expected failure mode: `itinerary`/`budget`/`companions`/`companion_count` are `undefined` in the response body, so `toEqual`/`toBe` assertions on them fail (route doesn't emit those keys yet).

- [ ] 3. Implement. In `server/src/routes/budget.routes.js`, change line 6 exactly from:
  ```js
  export { CATEGORIES }
  ```
  to:
  ```js
  export { CATEGORIES, budgetShape }
  ```
  (`budgetShape` is already `async function budgetShape(app, tripId) {...}` at line 19 — no other change needed there; a named `function` declaration is hoisted and already usable, `export {}` just widens visibility.)

- [ ] 4. In `server/src/routes/participant.routes.js`, add the import at the top (after line 2):
  ```js
  import { budgetShape } from './budget.routes.js'
  ```

- [ ] 5. In `server/src/routes/participant.routes.js`, replace the route body (current lines 19–35):
  ```js
  app.get('/participant/me', { preHandler: app.requireParticipant }, async (req) => {
    const { tripId, personId } = req.participant
    const trip = await app.db.get('SELECT * FROM trips WHERE id = ?', [tripId])
    const goals = await app.db.all('SELECT title, fixed_date, fixed_place FROM trip_goals WHERE trip_id = ? ORDER BY seq', [tripId])
    const tp = await app.db.get('SELECT profile_confirmed FROM trip_participants WHERE trip_id = ? AND person_id = ?', [tripId, personId])
    const person = personToJson(await app.db.get('SELECT * FROM persons WHERE id = ?', [personId]))
    return {
      trip: {
        id: trip.id, name: trip.name, description: trip.description, status: trip.status,
        vibe_tags: JSON.parse(trip.vibe_tags || '[]'), destination: trip.destination,
        date_mode: trip.date_mode, start_date: trip.start_date, end_date: trip.end_date,
        goals,
      },
      person,
      profile_confirmed: tp?.profile_confirmed ?? 0,
    }
  })
  ```
  with:
  ```js
  app.get('/participant/me', { preHandler: app.requireParticipant }, async (req) => {
    const { tripId, personId } = req.participant
    const trip = await app.db.get('SELECT * FROM trips WHERE id = ?', [tripId])
    const goals = await app.db.all('SELECT title, fixed_date, fixed_place FROM trip_goals WHERE trip_id = ? ORDER BY seq', [tripId])
    const tp = await app.db.get('SELECT profile_confirmed FROM trip_participants WHERE trip_id = ? AND person_id = ?', [tripId, personId])
    const person = personToJson(await app.db.get('SELECT * FROM persons WHERE id = ?', [personId]))

    // Itinerary: a day always appears even with zero items (LEFT JOIN), so an
    // empty day isn't silently dropped from the guest's read-only view.
    const itineraryRows = await app.db.all(
      `SELECT d.day_date, d.position AS day_position, i.title, i.time_range, i.location, i.category, i.est_cost, i.notes, i.link
       FROM itinerary_days d LEFT JOIN itinerary_items i ON i.day_id = d.id
       WHERE d.trip_id = ? ORDER BY d.position, i.position`, [tripId])
    const itinerary = []
    for (const row of itineraryRows) {
      let day = itinerary[itinerary.length - 1]
      if (!day || day.day_date !== row.day_date) { day = { day_date: row.day_date, items: [] }; itinerary.push(day) }
      if (row.title != null) day.items.push({
        title: row.title, time_range: row.time_range, location: row.location,
        category: row.category, est_cost: row.est_cost, notes: row.notes, link: row.link,
      })
    }

    // Budget: null when the organizer hasn't set up budget lines at all, so the
    // guest page can distinguish "no budget yet" from "your share is 0".
    const hasBudget = await app.db.get('SELECT 1 AS x FROM budget_lines WHERE trip_id = ? LIMIT 1', [tripId])
    let budget = null
    if (hasBudget) {
      const shape = await budgetShape(app, tripId)
      const mine = shape.overrides.find((o) => o.person_id === personId)
      budget = { currency: trip.currency, equal_share: shape.equal_share, my_amount: mine ? mine.amount : shape.equal_share }
    }

    // Companions: first names only, never email/phone/full name of anyone else —
    // this response goes to a bearer-token guest link, not an authenticated organizer.
    const others = await app.db.all(
      `SELECT p.name FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
       WHERE tp.trip_id = ? AND tp.person_id != ? ORDER BY p.name`, [tripId, personId])
    const companions = others.map((o) => String(o.name).trim().split(/\s+/)[0])
    const { count: companion_count } = await app.db.get(
      'SELECT COUNT(*)::int AS count FROM trip_participants WHERE trip_id = ?', [tripId])

    return {
      trip: {
        id: trip.id, name: trip.name, description: trip.description, status: trip.status,
        vibe_tags: JSON.parse(trip.vibe_tags || '[]'), destination: trip.destination,
        date_mode: trip.date_mode, start_date: trip.start_date, end_date: trip.end_date,
        goals,
      },
      person,
      profile_confirmed: tp?.profile_confirmed ?? 0,
      itinerary,
      budget,
      companions,
      companion_count,
    }
  })
  ```

- [ ] 6. Run: `npm test --workspace=server -- participant.test.js`. Expected: all 7 tests in the file (3 original + 4 new) pass.
- [ ] 7. Run full server suite to check nothing depending on `budgetShape` being unexported (e.g. an eslint no-unused check on `budget.routes.js`) broke: `npm test --workspace=server`. Expected: 23 files / 142+ tests green (142 + 4 new = 146).

---

### Task 7 — Guest page: read-only itinerary + essentials strip

**Dependency gate (do this before anything else in this task):**
- [ ] 0. Run `grep -n "dayHeader\|tripCountdown" web/src/utils/dates.js` and `grep -n "formatMoney" web/src/utils/format.js`. If either grep returns nothing, **stop this task** — Phase 1 Tasks 1–2 have not landed yet. Report which helper is missing rather than writing a local re-implementation (that would create a second source of truth for money/date formatting that Phase 1's own tests don't cover). Only proceed past this point once both greps return a match. Phase 1 (Task 2) is canonical here: `dayHeader(iso, index)` — a 1-based day index — and `tripCountdown(trip)` from `dates.js`, and `formatMoney(amount, currency, { compact })` from `format.js` (defined ~L65) — these signatures are settled by Task 2/Task 1, not unverified; use them directly.

**Files:**
- Create: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/utils/itinerary.js`
- Create: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/utils/itinerary.test.js`
- Create: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/components/ParticipantItinerary.vue`
- Create: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/components/ParticipantItinerary.test.js`
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/components/DayCard.vue` (lines 23–24, extract shared icon map)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/stores/participant.js` (state, lines 4–13 and `load` action, lines 16–37)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/views/ParticipantView.vue` (template, insert above the `v-for="step in steps"` block at line 107)
- Test: extend `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/views/ParticipantView.test.js`

**Interfaces:**
- `web/src/utils/itinerary.js` exports `export const CATEGORY_ICONS = { travel: '✈️', food: '🍽️', activity: '🎟️', rest: '🛌', logistics: '🧳' }` and `export function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '•' }` (moved verbatim out of `DayCard.vue`).
- `ParticipantItinerary.vue` props: `{ itinerary: Array, trip: Object, budget: Object|null, companions: Array, companionCount: Number }` — pure presentational, no store access (matches `ParticipantChecklist.vue`'s existing pattern of being fed by the parent, not fetching itself — verify that pattern by reading `ParticipantChecklist.vue` if it differs before assuming).
- Consumes (from Phase 1 Task 2/Task 1, canonical per Task 0's gate above): `dayHeader(iso, index)`, `tripCountdown(trip)` from `../utils/dates.js`; `formatMoney(amount, currency)` from `../utils/format.js`.

**Steps:**

- [ ] 1. Write failing test `web/src/utils/itinerary.test.js`:
  ```js
  import { describe, it, expect } from 'vitest'
  import { CATEGORY_ICONS, categoryIcon } from './itinerary.js'

  describe('categoryIcon', () => {
    it('maps every known category', () => {
      expect(categoryIcon('travel')).toBe('✈️')
      expect(categoryIcon('food')).toBe('🍽️')
      expect(categoryIcon('activity')).toBe('🎟️')
      expect(categoryIcon('rest')).toBe('🛌')
      expect(categoryIcon('logistics')).toBe('🧳')
    })
    it('falls back to a bullet for unknown/missing categories', () => {
      expect(categoryIcon('nope')).toBe('•')
      expect(categoryIcon(undefined)).toBe('•')
    })
    it('exposes the map so callers can iterate it', () => {
      expect(Object.keys(CATEGORY_ICONS)).toEqual(['travel', 'food', 'activity', 'rest', 'logistics'])
    })
  })
  ```
- [ ] 2. Run: `npm test --workspace=web -- itinerary.test.js`. Expected fail: `Cannot find module './itinerary.js'`.
- [ ] 3. Create `web/src/utils/itinerary.js`:
  ```js
  // Shared with DayCard.vue (organizer itinerary) and ParticipantItinerary.vue
  // (guest read-only view) — one map so the emoji for "food" can't drift
  // between the two renders of the same category.
  export const CATEGORY_ICONS = { travel: '✈️', food: '🍽️', activity: '🎟️', rest: '🛌', logistics: '🧳' }
  export function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '•' }
  ```
- [ ] 4. Run: `npm test --workspace=web -- itinerary.test.js`. Expected: 3 tests pass.
- [ ] 5. Refactor `DayCard.vue`: replace (lines 23–24)
  ```js
  const ICONS = { travel: '✈️', food: '🍽️', activity: '🎟️', rest: '🛌', logistics: '🧳' }
  function categoryIcon(cat) { return ICONS[cat] || '•' }
  ```
  with:
  ```js
  import { categoryIcon } from '../utils/itinerary.js'
  ```
  (move this import line up next to the other imports at the top of the `<script setup>` block — DayCard.vue's template already calls `categoryIcon(item.category)` at lines 75 and 113, unchanged.)
- [ ] 6. Run `npm test --workspace=web` once (full suite) to confirm the DayCard refactor didn't break anything — `DayCard.test.js` exists by this point (created in Task 2 Step 4, appended by Task 3 Step 6), so this also re-runs those assertions directly, not just via other suites (e.g. `TripItineraryView.test.js`); if it stays green that's still not proof `categoryIcon` renders identically pixel-for-pixel — spot-check visually if in doubt.
- [ ] 7. Write failing test `web/src/components/ParticipantItinerary.test.js`:
  ```js
  import { describe, it, expect, vi, afterEach } from 'vitest'
  import { mountWithBase } from '../test-utils.js'
  import ParticipantItinerary from './ParticipantItinerary.vue'

  afterEach(() => vi.useRealTimers())

  // Note: the real /participant/me response's `trip` subset (server/src/routes/participant.routes.js,
  // Task 6) does not include `currency` — `budget.currency` is the source of truth for money on
  // this page. `currency` is kept here only as a harmless extra field on this component-level test
  // fixture (ParticipantItinerary.vue never reads `trip.currency`), not because the real API sends it.
  const trip = { start_date: '2026-08-01', end_date: '2026-08-03', currency: 'INR' }
  const itinerary = [
    { day_date: '2026-08-01', items: [{ title: 'Arrival', time_range: '10:00–11:00', location: 'Airport', category: 'travel', est_cost: null, notes: null, link: null }] },
    { day_date: '2026-08-02', items: [] },
  ]

  describe('ParticipantItinerary', () => {
    it('renders day headings, category icons and item details', () => {
      const wrapper = mountWithBase(ParticipantItinerary, {
        props: { itinerary, trip, budget: { currency: 'INR', equal_share: 5000, my_amount: 5000 }, companions: ['Asha', 'Priya'], companionCount: 5 },
      })
      expect(wrapper.text()).toContain('Arrival')
      expect(wrapper.text()).toContain('Airport')
      expect(wrapper.text()).toContain('✈️')
      expect(wrapper.text()).toContain('Travelling with: Asha, Priya')
    })

    it('marks today with a badge when today falls inside the trip range', () => {
      vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2)) // Aug 2, 2026 local
      const wrapper = mountWithBase(ParticipantItinerary, {
        props: { itinerary, trip, budget: null, companions: [], companionCount: 1 },
      })
      const days = wrapper.findAll('.pi-day')
      expect(days[1].text()).toContain('Today')
      expect(days[0].text()).not.toContain('Today')
    })

    it('shows no budget line when budget is null', () => {
      const wrapper = mountWithBase(ParticipantItinerary, {
        props: { itinerary, trip, budget: null, companions: [], companionCount: 1 },
      })
      expect(wrapper.find('.pi-share').exists()).toBe(false)
    })
  })
  ```
  (This test intentionally does not assert exact `dayHeader`/`formatMoney` output strings — it asserts presence of the data that flows through them, not their formatting, so it stays stable regardless of locale/date-formatting details.)
- [ ] 8. Run: `npm test --workspace=web -- ParticipantItinerary.test.js`. Expected fail: module not found.
- [ ] 9. Create `web/src/components/ParticipantItinerary.vue`. Read `web/src/utils/dates.js` and `web/src/utils/format.js` immediately before writing this file to get `dayHeader`/`tripCountdown`/`formatMoney`'s real signatures (Task 0 already confirmed they exist; this step confirms the exact call shape). Skeleton, adjust the three calls to match what's actually exported:
  ```vue
  <script setup>
  import { computed, onMounted, ref } from 'vue'
  import Tag from 'primevue/tag'
  import { categoryIcon } from '../utils/itinerary.js'
  import { dayHeader, tripCountdown } from '../utils/dates.js'
  import { formatMoney } from '../utils/format.js'

  const props = defineProps({
    itinerary: { type: Array, default: () => [] },
    trip: { type: Object, required: true },
    budget: { type: Object, default: null },
    companions: { type: Array, default: () => [] },
    companionCount: { type: Number, default: 0 },
  })

  const todayIso = computed(() => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  function isToday(dayDate) { return dayDate === todayIso.value }

  const companionsLine = computed(() => {
    if (!props.companions.length) return null
    const shown = props.companions.slice(0, 2)
    const restCount = props.companionCount - shown.length - 1 // -1 for self
    return `Travelling with: ${shown.join(', ')}${restCount > 0 ? ` +${restCount}` : ''}`
  })

  const todayRef = ref(null)
  onMounted(() => {
    // guarded: happy-dom (component tests) has no real layout, and scrollIntoView
    // is undefined there — only call it when the browser actually provides it.
    if (todayRef.value && typeof todayRef.value.scrollIntoView === 'function') {
      todayRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
  </script>

  <template>
    <div class="pi-essentials card">
      <Tag v-if="tripCountdown(trip)" :value="tripCountdown(trip).label" severity="info" />
      <span v-if="budget" class="pi-share">Your share: {{ formatMoney(budget.my_amount, budget.currency) }}</span>
      <span v-if="companionsLine">{{ companionsLine }}</span>
    </div>

    <section v-for="(day, idx) in itinerary" :key="day.day_date" class="pi-day" :class="{ 'pi-today': isToday(day.day_date) }" :ref="el => { if (isToday(day.day_date)) todayRef.value = el }">
      <h3>
        {{ dayHeader(day.day_date, idx + 1) }}
        <Tag v-if="isToday(day.day_date)" value="Today" severity="success" />
      </h3>
      <ul class="pi-items">
        <li v-for="(item, i) in day.items" :key="i" class="pi-item">
          <span>{{ categoryIcon(item.category) }}</span>
          <Tag v-if="item.time_range" :value="item.time_range" severity="secondary" />
          <strong>{{ item.title }}</strong>
          <span v-if="item.location">— {{ item.location }}</span>
        </li>
      </ul>
    </section>
  </template>

  <style scoped>
  .pi-essentials { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .pi-items { list-style: none; padding: 0; margin: 0; }
  .pi-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px solid var(--app-border); flex-wrap: wrap; }
  .pi-today h3 { color: var(--app-primary); }
  </style>
  ```
  NOTE: the `:ref` binding on a `v-for` element only works reliably as a callback ref in Vue 3, not a plain ref object reused across iterations — that's why the template above uses `:ref="el => { if (isToday(day.day_date)) todayRef.value = el }"` rather than a bare conditional ref object.
- [ ] 10. Run: `npm test --workspace=web -- ParticipantItinerary.test.js`. Expected: 3 tests pass.
- [ ] 11. Wire into the store and view. In `web/src/stores/participant.js`, add state fields (edit the `state()` object, lines 4–13) — insert after `tasks: [],`:
  ```js
      itinerary: [],
      budget: null,
      companions: [],
      companionCount: 0,
  ```
  and in the `load` action (lines 16–37), after `this.profileConfirmed = !!me.profile_confirmed` add:
  ```js
        this.itinerary = me.itinerary || []
        this.budget = me.budget || null
        this.companions = me.companions || []
        this.companionCount = me.companion_count || 0
  ```
- [ ] 12. In `web/src/views/ParticipantView.vue`, add the import (after line 11) `import ParticipantItinerary from '../components/ParticipantItinerary.vue'`, and insert directly above the `<section v-for="step in steps"` block (before line 107):
  ```vue
      <ParticipantItinerary
        v-if="store.trip"
        :itinerary="store.itinerary"
        :trip="store.trip"
        :budget="store.budget"
        :companions="store.companions"
        :companion-count="store.companionCount"
      />
  ```
  (`trip` is a required prop on `ParticipantItinerary.vue` — `store.trip` is null while the page is
  still loading, so the `v-if` keeps the component from mounting with a missing required prop.)
- [ ] 13. Extend `web/src/views/ParticipantView.test.js`: add `itinerary: [], budget: null, companions: [], companionCount: 0` to the `mountView(state)` fixture object in the existing test (it currently omits these keys, which is fine since they default via component props, but add them explicitly so the test documents the new store shape) and add one new test asserting the child renders:
  ```js
  it('passes itinerary/budget/companions through to ParticipantItinerary', async () => {
    const { wrapper } = await mountView({
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true, documents: [], packing: [], tasks: [],
      itinerary: [{ day_date: '2026-08-01', items: [{ title: 'Arrival', time_range: null, location: null, category: 'travel', est_cost: null, notes: null, link: null }] }],
      budget: { currency: 'INR', equal_share: 1000, my_amount: 1000 },
      companions: ['Priya'], companionCount: 2,
    })
    expect(wrapper.text()).toContain('Arrival')
    expect(wrapper.text()).toContain('Travelling with: Priya')
  })
  ```
- [ ] 14. Run: `npm test --workspace=web`. Expected: full web suite green (270 + ~7 new tests).

---

### Task 8 — Share affordances on link creation

**Files:**
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/package.json` (add `qrcode` dependency)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/views/trip/TripPeopleView.vue` (script: `<script setup>` block; template: the `link-reveal` block, lines 143–147)
- Test: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/views/trip/TripPeopleView.test.js`

**Interfaces:**
- `qrcode`'s `toDataURL(text)` returns `Promise<string>` (a `data:image/png;base64,...` URI) — used directly as an `<img src>`.
- New computed `inviteMessage(personName)` → string; new method `copyMessage()` using `navigator.clipboard.writeText`, mirroring the existing `copyLink()` at lines 83–90.

**Steps:**

- [ ] 1. Add the dependency. In `web/package.json`, under `"dependencies"` (after `"@primevue/themes": "^4.5.4",`), add:
  ```json
      "qrcode": "^1.5.4",
  ```
  Run `npm install --workspace=web` and confirm `web/node_modules/qrcode` exists (`ls web/node_modules/qrcode/package.json`). UNVERIFIED: pin `^1.5.4` against whatever is actually the latest 1.x at install time — check with `npm view qrcode version` before committing to the exact range if it matters to you; any 1.5.x with a `toDataURL` export satisfies this task.

- [ ] 2. Write failing tests, appended to `web/src/views/trip/TripPeopleView.test.js` (mock `qrcode` per the file's existing `vi.mock` convention, matching `useNotify.test.js`'s style):
  ```js
  vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ZmFrZQ==') } }))
  ```
  (add this mock call at module top level, above `async function mountView()`), then two new tests inside `describe('TripPeopleView', ...)`:
  ```js
  it('reveals a copyable invite message and a QR code alongside a newly created link', async () => {
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.element.value).toContain('Goa 2026')
    expect(textarea.element.value).toContain('/p/tok123')
    const img = wrapper.find('img[alt="QR code for invite link"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,ZmFrZQ==')
  })

  it('copies the invite message via clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    const copyMsgBtn = wrapper.findAll('button').find((b) => b.text().includes('Copy message'))
    await copyMsgBtn.trigger('click')
    expect(writeText).toHaveBeenCalled()
    expect(writeText.mock.calls[0][0]).toContain('Goa 2026')
  })
  ```
  Click target: `TripPeopleView.vue`'s template (line 138) renders `<Button label="Create link" size="small" outlined icon="pi pi-link" @click="createLink(p.person_id)" />` per participant row — PrimeVue's `Button` renders a native `<button>`, so `wrapper.findAll('button').find(b => b.text().includes('Create link'))` (used directly in both tests above) is the real lookup, matching how other files in this repo query PrimeVue buttons.
- [ ] 3. Run: `npm test --workspace=web -- TripPeopleView.test.js`. Expected fail: no `<textarea>`/no `img[alt=...]` found (feature not built yet).
- [ ] 4. Implement. In `TripPeopleView.vue`'s `<script setup>`, add the import (after line 10) `import QRCode from 'qrcode'`, then add near `createLink`/`copyLink` (after line 90):
  ```js
  const qrDataUrl = ref(null)

  function inviteMessage(personId) {
    if (!trips.current) return ''
    const dates = trips.current.start_date && trips.current.end_date
      ? `${trips.current.start_date} – ${trips.current.end_date}` : 'Dates TBD'
    const url = revealedLink.value && revealedLink.value.personId === personId
      ? origin + revealedLink.value.url : ''
    return `You're in for ${trips.current.name}! 🎒 ${dates}. Tap to confirm your details: ${url}`
  }

  async function copyMessage(personId) {
    try {
      await navigator.clipboard.writeText(inviteMessage(personId))
      notify.success('Message copied')
    } catch {
      notify.error('Could not access clipboard — copy the message manually')
    }
  }
  ```
  and change `createLink` (lines 75–81) from:
  ```js
  async function createLink(personId) {
    try {
      const result = await trips.createLink(tripId.value, personId)
      revealedLink.value = { personId, url: result.url }
      await trips.fetchLinks(tripId.value)
    } catch (e) { notify.error(e.message) }
  }
  ```
  to (adds QR generation once the URL is known):
  ```js
  async function createLink(personId) {
    try {
      const result = await trips.createLink(tripId.value, personId)
      revealedLink.value = { personId, url: result.url }
      qrDataUrl.value = await QRCode.toDataURL(origin + result.url)
      await trips.fetchLinks(tripId.value)
    } catch (e) { notify.error(e.message) }
  }
  ```
- [ ] 5. In the template, replace the `link-reveal` block (lines 143–147):
  ```vue
        <div v-if="revealedLink && revealedLink.personId === p.person_id" class="link-reveal">
          <p><strong>Shown only once — copy it now:</strong></p>
          <code>{{ origin + revealedLink.url }}</code>
          <Button label="Copy" size="small" icon="pi pi-copy" @click="copyLink(revealedLink.url)" />
        </div>
  ```
  with:
  ```vue
        <div v-if="revealedLink && revealedLink.personId === p.person_id" class="link-reveal">
          <p><strong>Shown only once — copy it now:</strong></p>
          <code>{{ origin + revealedLink.url }}</code>
          <Button label="Copy" size="small" icon="pi pi-copy" @click="copyLink(revealedLink.url)" />
          <textarea readonly class="invite-message" :value="inviteMessage(p.person_id)"></textarea>
          <Button label="Copy message" size="small" outlined icon="pi pi-copy" @click="copyMessage(p.person_id)" />
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code for invite link" class="invite-qr" />
        </div>
  ```
- [ ] 6. Add scoped styles (append inside the existing `<style scoped>` block, after `.link-reveal code {...}`):
  ```css
  .invite-message { display: block; width: 100%; margin-top: 0.5rem; font: inherit; resize: vertical; min-height: 4rem; }
  .invite-qr { display: block; margin-top: 0.5rem; width: 8rem; height: 8rem; }
  ```
- [ ] 7. Run: `npm test --workspace=web -- TripPeopleView.test.js`. Expected: all tests in the file pass (existing 1 + 2 new).
- [ ] 8. Run: `npm test --workspace=web`. Expected: full suite green.

---

### Task 9 — Organizer itinerary: today view

**Files:**
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/utils/itinerary.js` (add `parseTimeRange`)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/utils/itinerary.test.js` (add parser tests)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/components/DayCard.vue` (script + template)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/components/DayCard.test.js` (append — created in Task 2 Step 4)
- Modify: `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/views/trip/TripItineraryView.vue` (pass `trip` prop / today flag to `DayCard`)
- Test: extend `/Users/vignesh-5036/mydevelopment/tripper/trip-planner/web/src/views/trip/TripItineraryView.test.js`

**Interfaces:**
- `parseTimeRange(str) → {start: 'HH:MM', end: 'HH:MM'} | null`, handling `"HH:MM–HH:MM"` (en dash, U+2013) or `"HH:MM-HH:MM"` (hyphen); free text or a single time (no separator) returns `null`.
- `DayCard.vue` gains a prop `isToday: { type: Boolean, default: false }`; `TripItineraryView.vue` computes which single day (if any) is "today" and passes it down per-`DayCard`.

**Steps:**

- [ ] 1. Write failing parser tests, appended to `web/src/utils/itinerary.test.js`:
  ```js
  import { parseTimeRange } from './itinerary.js'

  describe('parseTimeRange', () => {
    it('parses an en-dash range', () => {
      expect(parseTimeRange('18:00–21:00')).toEqual({ start: '18:00', end: '21:00' })
    })
    it('parses a hyphen range', () => {
      expect(parseTimeRange('09:00-10:30')).toEqual({ start: '09:00', end: '10:30' })
    })
    it('returns null for a single time with no range', () => {
      expect(parseTimeRange('18:00')).toBeNull()
    })
    it('returns null for free text', () => {
      expect(parseTimeRange('all day')).toBeNull()
      expect(parseTimeRange('morning-ish')).toBeNull()
    })
    it('returns null for garbage / empty input', () => {
      expect(parseTimeRange('')).toBeNull()
      expect(parseTimeRange(null)).toBeNull()
      expect(parseTimeRange(undefined)).toBeNull()
      expect(parseTimeRange('25:00–26:00')).toBeNull() // out-of-range hours rejected, not accepted as text
    })
    it('tolerates surrounding whitespace', () => {
      expect(parseTimeRange(' 08:00 – 09:15 ')).toEqual({ start: '08:00', end: '09:15' })
    })
  })
  ```
- [ ] 2. Run: `npm test --workspace=web -- itinerary.test.js`. Expected fail: `parseTimeRange` is not exported.
- [ ] 3. Implement in `web/src/utils/itinerary.js`, append:
  ```js
  // "HH:MM–HH:MM" (en dash) or "HH:MM-HH:MM" (hyphen) only — anything else
  // (a single time, prose like "all day") is free text and stays free text;
  // callers must not guess at it.
  export function parseTimeRange(str) {
    const s = String(str ?? '').trim()
    const m = /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/.exec(s)
    if (!m) return null
    const [, h1, m1, h2, m2] = m
    const valid = (h, mi) => Number(h) >= 0 && Number(h) <= 23 && Number(mi) >= 0 && Number(mi) <= 59
    if (!valid(h1, m1) || !valid(h2, m2)) return null
    const pad = (n) => n.padStart(2, '0')
    return { start: `${pad(h1)}:${m1}`, end: `${pad(h2)}:${m2}` }
  }
  ```
- [ ] 4. Run: `npm test --workspace=web -- itinerary.test.js`. Expected: all parser tests + prior 3 tests pass (9 total in file).
- [ ] 5. Append a failing test to `web/src/components/DayCard.test.js` (created in Task 2 Step 4, extended in Task 3 Step 6 — append here, do not overwrite):
  ```js
  import { describe, it, expect, vi, afterEach } from 'vitest'
  import { createPinia, setActivePinia } from 'pinia'
  import { mountWithBase } from '../test-utils.js'
  import DayCard from './DayCard.vue'
  import { useAuthStore } from '../stores/auth.js'

  afterEach(() => vi.useRealTimers())

  function baseDay() {
    return { id: 'd1', day_date: '2026-08-02', items: [
      { id: 'i1', title: 'Breakfast', time_range: '08:00–09:00', category: 'food', location: null, est_cost: null },
      { id: 'i2', title: 'Museum', time_range: '11:00–13:00', category: 'activity', location: null, est_cost: null },
    ] }
  }

  describe('DayCard today view', () => {
    it('shows a Today chip and highlights the item whose time range contains now, only when isToday is true', () => {
      vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2, 8, 30)) // 08:30 local
      const pinia = createPinia(); setActivePinia(pinia)
      useAuthStore().aiEnabled = false
      const wrapper = mountWithBase(DayCard, { props: { day: baseDay(), index: 1, currency: 'INR', isToday: true }, pinia })
      expect(wrapper.text()).toContain('Today')
      const items = wrapper.findAll('.day-item')
      expect(items[0].classes()).toContain('day-item-now')  // Breakfast 08:00–09:00 contains 08:30
      expect(items[1].classes()).not.toContain('day-item-now')
    })

    it('shows no Today chip or now-highlight when isToday is false', () => {
      vi.useFakeTimers().setSystemTime(new Date(2026, 7, 2, 8, 30))
      const pinia = createPinia(); setActivePinia(pinia)
      useAuthStore().aiEnabled = false
      const wrapper = mountWithBase(DayCard, { props: { day: baseDay(), index: 1, currency: 'INR', isToday: false }, pinia })
      expect(wrapper.text()).not.toContain('Today')
      expect(wrapper.findAll('.day-item-now')).toHaveLength(0)
    })
  })
  ```
  UNVERIFIED: confirm `useAuthStore()`'s real shape (does `aiEnabled` need to be set this way, or is it a getter backed by other state?) by reading `web/src/stores/auth.js` before running this — the existing `TripItineraryView.test.js`/`DayCard.vue` usage (`auth.aiEnabled`) implies a plain reactive field, but verify rather than assume.
- [ ] 6. Run: `npm test --workspace=web -- DayCard.test.js`. Expected fail: no `isToday` prop, no "Today" text, no `.day-item-now` class.
- [ ] 7. Implement in `DayCard.vue`. Add the prop, keeping the `index`/`currency` props Task 1 Step 3 already added:
  ```js
  const props = defineProps({
    day: { type: Object, required: true },
    index: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    isToday: { type: Boolean, default: false }
  })
  ```
  Add the import and a `nowInRange` helper near the top of `<script setup>` (after the existing imports, before `const props = ...` or after — either is fine, keep near `categoryIcon`):
  ```js
  import { parseTimeRange } from '../utils/itinerary.js'
  ```
  Add, near `categoryIcon` (after its definition, current line 24):
  ```js
  function isItemNow(item) {
    if (!props.isToday) return false
    const range = parseTimeRange(item.time_range)
    if (!range) return false
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    const [sh, sm] = range.start.split(':').map(Number)
    const [eh, em] = range.end.split(':').map(Number)
    return mins >= sh * 60 + sm && mins <= eh * 60 + em
  }
  ```
  Change the template's `<h3>` (line 72; already `{{ dayHeader(day.day_date, index) }}` per Task 2 Step 3) from:
  ```vue
    <h3>{{ dayHeader(day.day_date, index) }}</h3>
  ```
  to:
  ```vue
    <h3>{{ dayHeader(day.day_date, index) }} <Tag v-if="isToday" value="Today" severity="success" /></h3>
  ```
  Change the item `<li>` (line 74) from `<li v-for="(item, idx) in day.items" :key="item.id" class="day-item">` to:
  ```vue
    <li v-for="(item, idx) in day.items" :key="item.id" class="day-item" :class="{ 'day-item-now': isItemNow(item) }">
  ```
- [ ] 8. Add scoped style (append inside the existing `<style scoped>` block): `.day-item-now { background: var(--app-primary-soft); border-radius: var(--app-radius-sm); }`.
- [ ] 9. Run: `npm test --workspace=web -- DayCard.test.js`. Expected: 2 tests pass.
- [ ] 10. Wire `isToday` from `TripItineraryView.vue` and add its own test. `useTripsStore` is
  already imported here and bound to `trips` (Task 1 Step 7) — reuse that binding rather than
  re-importing or re-declaring a second store instance. Add a computed after `const auth =
  useAuthStore()` (line 18):
  ```js
  const todayDayId = computed(() => {
    const trip = trips.current
    if (!trip || trip.status !== 'active') return null
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    if (trip.start_date && trip.end_date && (iso < trip.start_date || iso > trip.end_date)) return null
    const day = store.days.find((d) => d.day_date === iso)
    return day ? day.id : null
  })
  ```
  Change the `DayCard` invocation (line 122; already the multi-attr form from Task 1 Step 7) from:
  ```vue
      <DayCard
        v-for="(day, idx) in store.days"
        :key="day.id"
        :day="day"
        :index="idx + 1"
        :currency="trips.current?.currency"
      />
  ```
  to:
  ```vue
      <DayCard
        v-for="(day, idx) in store.days"
        :key="day.id"
        :day="day"
        :index="idx + 1"
        :currency="trips.current?.currency"
        :is-today="day.id === todayDayId"
      />
  ```
  Auto-scroll: add a `ref` per today-card similarly to `ParticipantItinerary.vue`'s pattern (Task 7) — inside the `v-for`, add the same callback-ref form: `:ref="el => { if (day.id === todayDayId) todayCardRef.value = el }"` and declare in script:
  ```js
  const todayCardRef = ref(null)
  watch(todayDayId, (id) => {
    if (id && todayCardRef.value?.$el?.scrollIntoView) todayCardRef.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  ```
  (Guarded the same way as Task 7 — `$el.scrollIntoView` is undefined in happy-dom, so the test below only asserts the prop/data wiring, not the actual DOM scroll call, matching how `ParticipantItinerary.test.js` is scoped.)
- [ ] 11. Write failing test, appended to `web/src/views/trip/TripItineraryView.test.js` (needs `trips.current.status = 'active'` and matching dates, which the file's existing `mountView()` doesn't set — add a second, parameterized setup or a new local `mountView` call with overridden `trips.current` after mount):
  ```js
  it('marks today\'s DayCard as isToday when trip is active and today is in range', async () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 7, 1)) // Aug 1, 2026 local — matches store.days[0].day_date
    const { wrapper, store } = await mountView()
    // mountView() hard-codes trips.current.status = 'planning' — override for this test
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'active', start_date: '2026-08-01', end_date: '2026-08-05' }
    store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }]
    await flushPromises()
    const dayCard = wrapper.findComponent({ name: 'DayCard' })
    expect(dayCard.props('isToday')).toBe(true)
    vi.useRealTimers()
  })

  it('leaves isToday false for every day when trip is not active', async () => {
    const { wrapper } = await mountView() // default status: 'planning'
    await flushPromises()
    const dayCard = wrapper.findComponent({ name: 'DayCard' })
    expect(dayCard.props('isToday')).toBe(false)
  })
  ```
  UNVERIFIED: `wrapper.findComponent({ name: 'DayCard' })` requires `DayCard.vue` to have a resolvable component `name` (via `<script setup>` + a matching `.vue` filename, Vue's SFC compiler infers this in dev but confirm in this Vite/Vitest config before trusting the lookup — if it fails, fall back to `wrapper.findComponent(DayCard)` with `DayCard` imported directly, which unambiguously works regardless of inferred `name`; prefer that import-based form here). Also confirm `store.days` reassignment after `mountView()` returns actually re-renders before asserting — add `await wrapper.vm.$nextTick()` or a second `flushPromises()` if the first test's prop reads stale.
- [ ] 12. Run: `npm test --workspace=web -- TripItineraryView.test.js`. Expected: 3 tests pass (1 original + 2 new).
- [ ] 13. Run: `npm test --workspace=web`. Expected: full suite green (270 + additions from Tasks 7–9: ~itinerary.test.js +9, ParticipantItinerary.test.js +3, ParticipantView additions +1, TripPeopleView +2, DayCard.test.js +2, TripItineraryView +2 ≈ 289 total — treat exact count as informational, not a gate; the gate is 0 failures).
- [ ] 14. Run the full workspace suite once more end to end to close out Phase 2: `npm test` (server + web). Expected: all green, no regressions in either workspace.

---

## Cross-task risks / open items (flag, don't silently resolve)

- Tasks 7 and 8 both read `trips.current.name` / `trip.name` and build a user-facing string from it — neither escapes/sanitizes trip name for the `<textarea>` (plain text, not HTML, so no XSS risk there) but do note a trip named with literal `–`/`-` characters could visually blend into the dates segment; not treated as a defect, just noted.
- Task 8's QR code encodes the **absolute** URL (`origin + path`) — if this app is ever served from multiple origins (e.g. a preview-deploy domain different from production), a QR generated on one origin still resolves fine since it's a full absolute URL baked in at generation time; no action needed, just confirming the design is origin-safe by construction.
- Task 9's "now" highlight recomputes from `new Date()` only on render (props/data change), not on a timer — an item's highlight will not move at :00/:59 boundaries without some other re-render trigger (e.g. navigating away and back, or a data refetch). This plan does not add a `setInterval` for this, since neither the task text nor any existing pattern in this codebase (checked `TripItineraryView.vue`, `DayCard.vue`) uses a live-updating clock; flagging so it isn't mistaken for a bug if the highlight looks "stuck" during a long-open tab.

# Phase 3 — Get the plan out + lifecycle

# Phase 3 — get the plan out + lifecycle

Conventions used throughout (verified against the current tree):
- Route files export `default async function routes(app) { ... }`, use `app.db.get/all/run/tx`
  with `?` placeholders, resolve ownership via `app.ownedTrip`/`app.ownedPerson`, and answer
  errors with `httpError(reply, status, code, message)` from `server/src/lib/errors.js`.
- Organizer routes: `preHandler: app.requireOrganizer` (cookie `tp_session`, sets `req.organizer`).
  Participant routes: `preHandler: app.requireParticipant` (bearer token, sets `req.participant =
  { linkId, tripId, personId }`).
- Server tests import `{ makeTestApp, loginOrganizer, authedInject, createTrip, createPerson }`
  from `server/test/helpers.js`; `app.inject({ headers: { authorization: 'Bearer <raw>' } })` for
  participant routes (see `server/test/participant.test.js`).
- Web: Pinia stores in `web/src/stores/*.js`, `api`/`participantApi` from
  `web/src/api/client.js`. Component tests use `mountWithBase` from `web/src/test-utils.js`
  (Pinia + PrimeVue + Toast/Confirmation services already wired) plus a memory router when the
  component reads `route.params`.
- File download under bearer auth cannot use a plain `<a href>` (no way to attach the
  `Authorization` header to a browser navigation). The existing pattern is
  `ParticipantDocs.vue`'s `download()`: `fetch` with the header, `blob()`,
  `URL.createObjectURL`, a synthetic `<a>` click, `revokeObjectURL`. Task 10's guest download
  reuses this exactly.

---

### Task 10 — .ics calendar export

**Files:**
- Create `server/src/lib/ics.js`
- Create `server/test/ics.test.js` (unit tests for the lib)
- Modify `server/src/routes/itinerary.routes.js` (organizer route)
- Modify `server/src/routes/participant.routes.js` (guest route)
- Modify `server/test/itinerary.test.js` (organizer route tests, appended)
- Modify `server/test/participant.test.js` (guest route tests, appended)
- Modify `web/src/views/trip/TripItineraryView.vue` (download button)
- Modify `web/src/views/ParticipantView.vue` (download button, guest page)

**Interfaces:**
```js
// server/src/lib/ics.js
export function parseTimeRange(str)
// str: "HH:MM–HH:MM" (en dash U+2013) or "HH:MM-HH:MM" (ASCII hyphen), optional
// surrounding whitespace. Returns { start: 'HH:MM', end: 'HH:MM' } (each hour 0-23,
// minute 0-59) or null for anything else (null/undefined/empty/malformed/out-of-range).
// No handling for a range that crosses midnight (end <= start): the file still
// generates, just with DTEND < DTSTART on that one event — documented as a known
// limitation in a code comment, not fixed here (out of scope per the brief).

export function slugify(name)
// name: string|null|undefined -> lowercase, non [a-z0-9]+ runs collapsed to '-',
// leading/trailing '-' trimmed. Empty/all-punctuation input -> 'trip'.

export function buildTripIcs({ trip, days })
// trip: { name } (only .name is read)
// days: [{ day_date: 'YYYY-MM-DD', items: [{ id, title, time_range, location, notes, link }] }]
// Returns the full RFC5545 text (CRLF line endings, one VEVENT per item). No line
// folding at 75 octets — not implemented, documented as a known limitation.
```
```js
// server/src/routes/itinerary.routes.js — new route, organizer
// GET /trips/:id/itinerary.ics  (mounted under /api by autoload)
//   200 text/calendar; charset=utf-8, content-disposition attachment
//   404 NOT_FOUND if trip not owned

// server/src/routes/participant.routes.js — new route, guest
// GET /participant/itinerary.ics
//   200 text/calendar; charset=utf-8, content-disposition attachment
//   (requireParticipant already 401s on bad/expired/revoked token)
```

**Steps:**

1. [ ] Write `server/test/ics.test.js` covering `parseTimeRange` and `buildTripIcs` against the
   lib module, which does not exist yet:
   ```js
   import { describe, it, expect } from 'vitest'
   import { parseTimeRange, buildTripIcs, slugify } from '../src/lib/ics.js'

   describe('parseTimeRange', () => {
     it('parses en-dash and hyphen ranges', () => {
       expect(parseTimeRange('18:00–21:00')).toEqual({ start: '18:00', end: '21:00' })
       expect(parseTimeRange('09:05-10:00')).toEqual({ start: '09:05', end: '10:00' })
       expect(parseTimeRange(' 08:00 – 09:00 ')).toEqual({ start: '08:00', end: '09:00' })
     })
     it('returns null for missing/malformed/out-of-range input', () => {
       expect(parseTimeRange(null)).toBeNull()
       expect(parseTimeRange(undefined)).toBeNull()
       expect(parseTimeRange('')).toBeNull()
       expect(parseTimeRange('evening')).toBeNull()
       expect(parseTimeRange('25:00-26:00')).toBeNull()
       expect(parseTimeRange('18:00')).toBeNull()
     })
   })

   describe('slugify', () => {
     it('lowercases, hyphenates, strips punctuation', () => {
       expect(slugify('Goa Trip 2026!')).toBe('goa-trip-2026')
       expect(slugify('  Épic   Trip  ')).toBe('pic-trip')
       expect(slugify('')).toBe('trip')
       expect(slugify(null)).toBe('trip')
     })
   })

   describe('buildTripIcs', () => {
     const trip = { name: 'Goa Trip' }

     it('emits one VEVENT per item with parseable times as floating DTSTART/DTEND', () => {
       const days = [{ day_date: '2026-03-01', items: [
         { id: 'i1', title: 'Beach', time_range: '18:00–21:00', location: 'Baga', notes: null, link: null }
       ] }]
       const ics = buildTripIcs({ trip, days })
       expect(ics).toContain('BEGIN:VCALENDAR')
       expect(ics).toContain('UID:i1@tripper')
       expect(ics).toContain('DTSTART:20260301T180000')
       expect(ics).toContain('DTEND:20260301T210000')
       expect(ics).toContain('SUMMARY:Beach')
       expect(ics).toContain('LOCATION:Baga')
       expect(ics).not.toContain('TZID')
     })

     it('falls back to an all-day VALUE=DATE event when time_range is unparseable', () => {
       const days = [{ day_date: '2026-03-02', items: [
         { id: 'i2', title: 'Free day', time_range: null, location: null, notes: null, link: null }
       ] }]
       const ics = buildTripIcs({ trip, days })
       expect(ics).toContain('DTSTART;VALUE=DATE:20260302')
       expect(ics).toContain('DTEND;VALUE=DATE:20260303')
     })

     it('escapes commas, semicolons and newlines per RFC5545', () => {
       const days = [{ day_date: '2026-03-01', items: [
         { id: 'i3', title: 'Lunch, then; walk\nrepeat', location: null, notes: null, link: null, time_range: null }
       ] }]
       const ics = buildTripIcs({ trip, days })
       expect(ics).toContain('SUMMARY:Lunch\\, then\\; walk\\nrepeat')
     })

     it('combines notes and link into DESCRIPTION when both present', () => {
       const days = [{ day_date: '2026-03-01', items: [
         { id: 'i4', title: 'Museum', time_range: null, location: null, notes: 'Bring ID', link: 'http://x.com' }
       ] }]
       const ics = buildTripIcs({ trip, days })
       expect(ics).toMatch(/DESCRIPTION:Bring ID\\n\\nhttp:\/\/x\.com/)
     })
   })
   ```
   Run: `npm test --workspace=server -- ics` — expected FAIL (`Cannot find module '../src/lib/ics.js'`).

2. [ ] Implement `server/src/lib/ics.js`:
   ```js
   function escapeText(s) {
     return String(s ?? '')
       .replace(/\\/g, '\\\\')
       .replace(/;/g, '\\;')
       .replace(/,/g, '\\,')
       .replace(/\r\n|\r|\n/g, '\\n')
   }

   export function parseTimeRange(str) {
     if (!str) return null
     const m = /^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/.exec(str)
     if (!m) return null
     const [sh, sm, eh, em] = m.slice(1).map(Number)
     if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null
     const pad = (n) => String(n).padStart(2, '0')
     return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` }
   }

   export function slugify(name) {
     const s = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
     return s || 'trip'
   }

   function isoDateParts(dayDate) {
     const [y, mo, d] = dayDate.split('-')
     return { y, mo, d }
   }
   function addOneDay(dayDate) {
     const d = new Date(`${dayDate}T00:00:00Z`)
     d.setUTCDate(d.getUTCDate() + 1)
     return d.toISOString().slice(0, 10)
   }
   function compact(dayDate) {
     const { y, mo, d } = isoDateParts(dayDate)
     return `${y}${mo}${d}`
   }

   function eventLines(dayDate, item) {
     const uid = `${item.id}@tripper`
     const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
     const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`]

     const range = parseTimeRange(item.time_range)
     if (range) {
       // Floating local time: no TZID, no trailing Z. Tripper does not track the
       // destination's timezone, so this is the best representation available —
       // every calendar app will show these times as-is, in whichever zone the
       // viewer's device is set to, which is wrong for a trip abroad but is the
       // same ambiguity the app's own time_range display already has.
       const date = compact(dayDate)
       lines.push(`DTSTART:${date}T${range.start.replace(':', '')}00`)
       lines.push(`DTEND:${date}T${range.end.replace(':', '')}00`)
     } else {
       // All-day fallback. DTEND on an all-day VEVENT is exclusive per RFC5545,
       // so it is the *next* calendar day even for a single-day event.
       lines.push(`DTSTART;VALUE=DATE:${compact(dayDate)}`)
       lines.push(`DTEND;VALUE=DATE:${compact(addOneDay(dayDate))}`)
     }

     lines.push(`SUMMARY:${escapeText(item.title)}`)
     if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`)
     const descParts = [item.notes, item.link].filter(Boolean)
     if (descParts.length) lines.push(`DESCRIPTION:${escapeText(descParts.join('\n\n'))}`)
     lines.push('END:VEVENT')
     return lines
   }

   export function buildTripIcs({ trip, days }) {
     const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tripper//Itinerary//EN', 'CALSCALE:GREGORIAN']
     for (const day of days) for (const item of day.items) lines.push(...eventLines(day.day_date, item))
     lines.push('END:VCALENDAR')
     // RFC5545 requires CRLF line endings.
     return lines.join('\r\n') + '\r\n'
   }
   ```
   Run: `npm test --workspace=server -- ics` — expected PASS (5 tests).

3. [ ] Add the organizer route. In `server/src/routes/itinerary.routes.js`, add the import at the
   top (after the existing `buildDayRegenPrompt` import) and the route after the existing
   `GET /trips/:id/itinerary` handler (which currently reads, verbatim):
   ```js
   app.get('/trips/:id/itinerary', { preHandler: app.requireOrganizer }, async (req, reply) => {
     const trip = await getTrip(req)
     if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
     return { days: await listDays(trip.id) }
   })
   ```
   Edit:
   ```js
   import { buildItineraryPrompt, buildDayRegenPrompt } from '../llm/prompts/itinerary.js'
   ```
   →
   ```js
   import { buildItineraryPrompt, buildDayRegenPrompt } from '../llm/prompts/itinerary.js'
   import { buildTripIcs, slugify } from '../lib/ics.js'
   ```
   and insert immediately after the `GET /trips/:id/itinerary` handler:
   ```js
   app.get('/trips/:id/itinerary.ics', { preHandler: app.requireOrganizer }, async (req, reply) => {
     const trip = await getTrip(req)
     if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
     const ics = buildTripIcs({ trip, days: await listDays(trip.id) })
     reply.header('content-disposition', `attachment; filename="${slugify(trip.name)}.ics"`)
     reply.type('text/calendar; charset=utf-8')
     return ics
   })
   ```

4. [ ] Add the guest route. In `server/src/routes/participant.routes.js`, add the import at the
   top and the route at the end of `routes()`, after the existing `PUT /participant/profile`
   handler:
   ```js
   import { personToJson } from './people.routes.js'
   ```
   →
   ```js
   import { personToJson } from './people.routes.js'
   import { buildTripIcs, slugify } from '../lib/ics.js'
   ```
   and append before the closing `}` of `routes()`:
   ```js
   app.get('/participant/itinerary.ics', { preHandler: app.requireParticipant }, async (req, reply) => {
     const { tripId } = req.participant
     const trip = await app.db.get('SELECT * FROM trips WHERE id = ?', [tripId])
     const dayRows = await app.db.all('SELECT id, day_date FROM itinerary_days WHERE trip_id = ? ORDER BY position', [tripId])
     const days = []
     for (const day of dayRows) {
       const items = await app.db.all(
         'SELECT id, title, time_range, location, notes, link FROM itinerary_items WHERE day_id = ? ORDER BY position',
         [day.id]
       )
       days.push({ day_date: day.day_date, items })
     }
     const ics = buildTripIcs({ trip, days })
     reply.header('content-disposition', `attachment; filename="${slugify(trip.name)}.ics"`)
     reply.type('text/calendar; charset=utf-8')
     return ics
   })
   ```
   Note: this route sits behind the `rateLimit` registered at the top of this file (30/min) —
   same as every other `/participant/*` route; no change needed.

5. [ ] Append route tests to `server/test/itinerary.test.js` (uses the existing `setup()` helper
   already defined in that file):
   ```js
   describe('itinerary — .ics export', () => {
     it('organizer downloads text/calendar with content-disposition', async () => {
       const { app, cookie, trip } = await setup({})
       await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/itinerary/init` })
       const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/itinerary.ics` })
       expect(res.statusCode).toBe(200)
       expect(res.headers['content-type']).toMatch(/text\/calendar/)
       expect(res.headers['content-disposition']).toMatch(/attachment; filename="trip-\w+\.ics"/)
       expect(res.body).toContain('BEGIN:VCALENDAR')
     })
     it('404 NOT_FOUND for another organizer\'s trip', async () => {
       const { app, db } = await makeTestApp()
       const { cookie } = await loginOrganizer(app, db)
       const other = await createOrganizer(db, { email: 'other@x.dev' })
       const trip = await createTrip(db, { organizer_id: other.id })
       const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/itinerary.ics` })
       expect(res.statusCode).toBe(404)
     })
   })
   ```
   This second test needs `createOrganizer` — already exported by `server/test/helpers.js` and
   already imported in this file (confirm the top-of-file import list includes it; if not, add it
   to the existing `import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson }
   from './helpers.js'` line).
   Run: `npm test --workspace=server -- itinerary` — expected PASS.

6. [ ] Append a route test to `server/test/participant.test.js` (uses the `seedLink` helper
   already defined there):
   ```js
   it('GET /participant/itinerary.ics returns a calendar for the linked trip', async () => {
     const { app, db } = await makeTestApp()
     const p = await createPerson(db)
     const t = await createTrip(db, { start_date: '2026-03-01', end_date: '2026-03-01' })
     const dayId = 'd1'
     await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,0)', [dayId, t.id, '2026-03-01'])
     await db.run(
       `INSERT INTO itinerary_items (id, day_id, position, title, time_range) VALUES ('it1', ?, 0, 'Beach', '18:00–21:00')`,
       [dayId]
     )
     const raw = await seedLink(app, db, t, p)
     const res = await app.inject({ method: 'GET', url: '/api/participant/itinerary.ics', headers: { authorization: `Bearer ${raw}` } })
     expect(res.statusCode).toBe(200)
     expect(res.headers['content-type']).toMatch(/text\/calendar/)
     expect(res.body).toContain('SUMMARY:Beach')
   })
   it('401 without a valid token', async () => {
     const res = await app.inject({ method: 'GET', url: '/api/participant/itinerary.ics' })
     expect(res.statusCode).toBe(401)
   })
   ```
   (Second test needs its own `app` in scope — wrap in `const { app } = await makeTestApp()` if
   not reusing one from an outer `describe`; match whatever pattern the rest of the file uses.)
   Run: `npm test --workspace=server -- participant` — expected PASS.

7. [ ] Web: organizer download button. In `web/src/views/trip/TripItineraryView.vue`, this is a
   plain link — the organizer session is a cookie, sent automatically on a normal navigation, so
   no fetch/blob dance is needed here (unlike the guest page). Add a new export card above the
   existing AI toolbar card. Current template (lines 95–103):
   ```html
     <template v-else>
       <div class="card">
         <div v-if="auth.aiEnabled">
   ```
   Edit to:
   ```html
     <template v-else>
       <div class="card export-actions">
         <a class="p-button p-button-outlined" :href="`/api/trips/${tripId}/itinerary.ics`">Add to calendar (.ics)</a>
         <router-link class="p-button p-button-outlined" :to="{ name: 'trip-itinerary-print' }" target="_blank">Print / PDF</router-link>
       </div>
       <div class="card">
         <div v-if="auth.aiEnabled">
   ```
   `p-button p-button-outlined` are PrimeVue's own button classes — reusing them on a plain `<a>`
   keeps this visually identical to the surrounding `Button` components without needing a real
   PrimeVue component (PrimeVue's `Button` doesn't render as an `<a>` with an `href`, which is
   what's needed for a same-origin download to carry the cookie). Add matching scoped CSS:
   ```css
   .export-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
   ```
   No unit test added for this link — it's a static `href` derived from `tripId`, covered
   qualitatively by not breaking `TripItineraryView.test.js`'s existing assertions (re-run it).
   Run: `npm test --workspace=web -- TripItineraryView` — expected PASS (no new assertions, just
   confirms the edit doesn't break mount).

8. [ ] Web: guest download button, fetch+blob (mirrors `ParticipantDocs.vue`'s `download()`
   exactly, since a bearer token can't ride a plain `<a href>`). In
   `web/src/views/ParticipantView.vue`, read the `<script setup>` block first to find its exact
   import list and add:
   ```js
   import Button from 'primevue/button'
   ```
   (already imported — confirm before adding) plus a new function:
   ```js
   async function downloadIcs() {
     const res = await fetch('/api/participant/itinerary.ics', {
       headers: { Authorization: `Bearer ${store.token}` }
     })
     if (!res.ok) return
     const blob = await res.blob()
     const url = URL.createObjectURL(blob)
     const a = document.createElement('a')
     a.href = url
     a.download = `${store.trip.name || 'trip'}.ics`
     document.body.appendChild(a)
     a.click()
     a.remove()
     URL.revokeObjectURL(url)
   }
   ```
   and in the template, inside the `p-hero` section (after the existing `p-meta`/`p-desc`/`p-tags`
   block, before the closing `</section>` at line 105), add:
   ```html
   <Button label="Add to calendar (.ics)" icon="pi pi-calendar-plus" outlined size="small" class="p-ics-btn" @click="downloadIcs" />
   ```
   Component test: add to (or create, if this view has no test file yet — check
   `web/src/views/ParticipantView.test.js` first) a test that stubs `fetch` and asserts the
   download flow calls it with the bearer header:
   ```js
   it('downloads the .ics with the participant bearer token', async () => {
     const blob = new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' })
     global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
     global.URL.createObjectURL = vi.fn().mockReturnValue('blob:x')
     global.URL.revokeObjectURL = vi.fn()
     const { wrapper } = await mountView() // however this file's existing helper mounts + loads the store
     await wrapper.find('.p-ics-btn').trigger('click')
     await flushPromises()
     expect(global.fetch).toHaveBeenCalledWith('/api/participant/itinerary.ics', {
       headers: { Authorization: expect.stringContaining('Bearer ') }
     })
   })
   ```
   UNVERIFIED: the exact shape of `ParticipantView.test.js`'s mount helper (if the file exists) —
   read it before writing this test and match its store-stubbing pattern rather than the sketch
   above.
   Run: `npm test --workspace=web -- ParticipantView` — expected PASS.

**Final check for Task 10:** `npm test --workspace=server` and `npm test --workspace=web` both
green.

---

### Task 11 — Printable day-sheet

**Files:**
- Create `web/src/views/trip/TripItineraryPrintView.vue`
- Create `web/src/views/trip/TripItineraryPrintView.test.js`
- Modify `web/src/router.js` (new standalone route)
- Modify `web/src/views/trip/TripItineraryView.vue` (entry button — added in Task 10 step 7
  already; this task only adds the destination view)
- Modify `web/src/utils/dates.js` (adds `formatLongDate` — **dependency check, see step 0**)
- Create `web/src/utils/dates.test.js` addition for `formatLongDate` (append to the existing
  `web/src/utils/dates.test.js`)

**Dependency note:** the brief for this task assumes Phase 1 already adds a long-form date
formatter to `web/src/utils/dates.js`. As read for this plan, Phase 1 (Task 2) adds `formatDayDate`
(short form: `'Fri 6 Nov'`) and `dayHeader`, not a long-form date — so this task always adds its own
new export, `formatLongDate`, regardless of Phase 1 landing order (grep first per step 0 anyway, in
case a later Phase 1 revision added it under this name, but expect not to find it).

**Interfaces:**
```js
// web/src/utils/dates.js (new export — Phase 1 never produces this one)
export function formatLongDate(iso)
// iso: 'YYYY-MM-DD' -> 'Monday, March 2, 2026' (long weekday/month, local calendar
// parse via parseIsoDate — never the UTC-midnight string constructor). Invalid/null
// input -> returns the input unchanged (so a bad date prints as-is instead of "Invalid Date").
```
```
// web/src/router.js — new standalone (non-TripLayout) route
{ path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print',
  component: () => import('./views/trip/TripItineraryPrintView.vue'),
  meta: { auth: true, bare: true } }
```
`meta.bare` is the existing mechanism (`App.vue` line 4/7) that hides `AppNav`/`SearchPalette` —
already used by the guest page (`/p/:token`) for the same reason: no app chrome around a page
meant to stand alone (here, to print cleanly).

**Steps:**

1. [ ] Check the dependency: `grep -n "formatLongDate" web/src/utils/dates.js`. If it's already
   there (Phase 1 landed it under this name), skip to step 2 — but Phase 1 (Task 2) never produces
   this export, so expect to not find it and proceed with the edit below. Write a failing test
   first — append to `web/src/utils/dates.test.js`:
   ```js
   import { formatLongDate } from './dates.js'
   describe('formatLongDate', () => {
     it('formats a local-parsed long date', () => {
       expect(formatLongDate('2026-03-02')).toMatch(/Monday.*March.*2.*2026/)
     })
     it('returns invalid input unchanged rather than "Invalid Date"', () => {
       expect(formatLongDate('not-a-date')).toBe('not-a-date')
       expect(formatLongDate(null)).toBe(null)
     })
   })
   ```
   Run: `npm test --workspace=web -- dates` — expected FAIL (`formatLongDate is not exported`).
   Then add to `web/src/utils/dates.js`, after `isExpiredIso`:
   ```js
   export function formatLongDate(iso) {
     const d = parseIsoDate(iso)
     if (!d) return iso
     return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
   }
   ```
   Run: `npm test --workspace=web -- dates` — expected PASS.
   UNVERIFIED: `toLocaleDateString`'s exact output string depends on the JS runtime's locale data
   (Node's ICU build) — the test above uses a loose regex rather than an exact string match for
   this reason; tighten only if CI's Node build is confirmed to produce the exact English string.

2. [ ] Write the router test expectation first is impractical (router.js has no test file in this
   repo — confirmed by `ls web/src/*.test.js`-style search during research: none exists for
   `router.js`). Instead, drive this through the view's own component test (step 4), which routes
   through a memory router the same way `TripItineraryView.test.js` does. Add the route to
   `web/src/router.js` now. Current relevant lines (25–29):
   ```js
     { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { auth: true } },
     { path: '/people', name: 'people', component: () => import('./views/PeopleListView.vue'), meta: { auth: true } },
     { path: '/people/:id', name: 'person', component: () => import('./views/PersonDetailView.vue'), meta: { auth: true } },
     { path: '/p/:token', name: 'participant', component: () => import('./views/ParticipantView.vue'), meta: { public: true, bare: true } },
     { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { public: true } }
   ```
   Edit — insert the new route right after the `/trips/:id` block's closing `}` (line 24) and
   before `/search` (line 25), so it's a sibling of `/trips/:id`, not a child (a child would
   render inside `TripLayout`'s sidebar, which is exactly what printing needs to avoid):
   ```js
     { path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print',
       component: () => import('./views/trip/TripItineraryPrintView.vue'),
       meta: { auth: true, bare: true } },
     { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { auth: true } },
   ```

3. [ ] Write the component test first, since the component doesn't exist yet —
   `web/src/views/trip/TripItineraryPrintView.test.js`:
   ```js
   import { describe, it, expect } from 'vitest'
   import { createRouter, createMemoryHistory } from 'vue-router'
   import { createPinia, setActivePinia } from 'pinia'
   import { vi } from 'vitest'
   import { mountWithBase } from '../../test-utils.js'
   import TripItineraryPrintView from './TripItineraryPrintView.vue'
   import { useItineraryStore } from '../../stores/itinerary.js'
   import { useTripsStore } from '../../stores/trips.js'

   async function mountView() {
     const router = createRouter({
       history: createMemoryHistory(),
       routes: [{ path: '/trips/:id/itinerary/print', name: 'trip-itinerary-print', component: TripItineraryPrintView }]
     })
     await router.push('/trips/t1/itinerary/print')
     await router.isReady()
     const pinia = createPinia()
     setActivePinia(pinia)
     const store = useItineraryStore()
     const trips = useTripsStore()
     store.fetchItinerary = vi.fn().mockImplementation(async () => {
       store.days = [{ id: 'd1', day_date: '2026-03-02', items: [
         { id: 'i1', title: 'Beach', time_range: '18:00–21:00', location: 'Baga', notes: 'bring towel' }
       ] }]
     })
     trips.current = { id: 't1', name: 'Goa 2026', start_date: '2026-03-02', end_date: '2026-03-02' }
     trips.fetchTrip = vi.fn().mockResolvedValue(trips.current)
     const wrapper = mountWithBase(TripItineraryPrintView, { pinia, global: { plugins: [router] } })
     return { wrapper, store }
   }

   describe('TripItineraryPrintView', () => {
     it('renders the trip name, day headings and item rows from the store', async () => {
       const { wrapper } = await mountView()
       await wrapper.vm.$nextTick()
       expect(wrapper.text()).toContain('Goa 2026')
       expect(wrapper.text()).toMatch(/Monday.*March.*2.*2026/)
       expect(wrapper.text()).toContain('Beach')
       expect(wrapper.text()).toContain('Baga')
       expect(wrapper.text()).toContain('bring towel')
     })
   })
   ```
   Run: `npm test --workspace=web -- TripItineraryPrintView` — expected FAIL (component doesn't
   exist).

4. [ ] Implement `web/src/views/trip/TripItineraryPrintView.vue`. This view fetches its own trip
   header and days directly (it is NOT a child of `TripLayout`, so it gets none of that layout's
   fetching):
   ```html
   <script setup>
   import { computed, onMounted } from 'vue'
   import { useRoute } from 'vue-router'
   import { useItineraryStore } from '../../stores/itinerary.js'
   import { useTripsStore } from '../../stores/trips.js'
   import { formatLongDate } from '../../utils/dates.js'

   const route = useRoute()
   const tripId = computed(() => route.params.id)
   const itinerary = useItineraryStore()
   const trips = useTripsStore()

   onMounted(async () => {
     await Promise.all([trips.fetchTrip(tripId.value), itinerary.fetchItinerary(tripId.value)])
   })

   function print() { window.print() }
   </script>

   <template>
     <div class="print-page">
       <div class="print-toolbar no-print">
         <button type="button" @click="print">Print</button>
       </div>
       <header class="print-header">
         <h1>{{ trips.current?.name }}</h1>
         <p v-if="trips.current?.start_date">{{ trips.current.start_date }} – {{ trips.current.end_date }}</p>
       </header>
       <section v-for="day in itinerary.days" :key="day.id" class="print-day">
         <h2>{{ formatLongDate(day.day_date) }}</h2>
         <table>
           <thead><tr><th>Time</th><th>Title</th><th>Location</th><th>Notes</th></tr></thead>
           <tbody>
             <tr v-for="item in day.items" :key="item.id">
               <td>{{ item.time_range || '—' }}</td>
               <td>{{ item.title }}</td>
               <td>{{ item.location || '' }}</td>
               <td>{{ item.notes || '' }}</td>
             </tr>
           </tbody>
         </table>
       </section>
     </div>
   </template>

   <style scoped>
   /* Print always renders light, regardless of the app's dark-mode setting —
      this page's only audience is a printer or a PDF, and dark ink-heavy pages
      waste toner and read badly on paper. */
   .print-page { background: #fff; color: #111; padding: 1.5rem; font-family: system-ui, sans-serif; }
   .print-header { margin-bottom: 1.5rem; }
   .print-day { margin-bottom: 1.5rem; page-break-inside: avoid; }
   table { width: 100%; border-collapse: collapse; }
   th, td { text-align: left; padding: 0.375rem 0.5rem; border-bottom: 1px solid #ddd; font-size: 0.875rem; }
   @media print {
     .no-print { display: none; }
     .print-page { padding: 0; }
   }
   </style>
   ```
   Run: `npm test --workspace=web -- TripItineraryPrintView` — expected PASS.

5. [ ] Entry button on `TripItineraryView.vue` was already added in Task 10 step 7 (the
   `router-link` to `trip-itinerary-print`, `target="_blank"` so the organizer doesn't lose their
   place in the itinerary). No further edit needed here — just confirm (re-run) that test still
   passes after this task's router change:
   Run: `npm test --workspace=web -- TripItineraryView` — expected PASS.

**Final check for Task 11:** `npm test --workspace=web` green.

---

### Task 12 — Trip un-archive

**Files:**
- Modify `server/src/routes/archive.routes.js` (new route)
- Modify `server/test/archive.test.js` (route tests, appended)
- Modify `web/src/stores/archive.js` (new store action)
- Modify `web/src/stores/archive.test.js` (store test, appended — file exists per repo listing)
- Modify `web/src/views/trip/TripSettingsView.vue` (archived-state button + confirm)
- Modify `web/src/views/trip/TripSettingsView.test.js` (component test, appended)

**Interfaces:**
```js
// server/src/routes/archive.routes.js — new route, organizer
// POST /trips/:id/unarchive
//   200 { trip } — status='active', archived_at=null; archives row untouched;
//                  participant_links stay revoked
//   404 NOT_FOUND — trip not owned
//   400 NOT_ARCHIVED — trip.status !== 'archived'. Deliberately a different status than
//                       GET/PUT /trips/:id/archive (archive.routes.js:95,104), which return
//                       404 NOT_ARCHIVED for the same condition: those are read/update-a-resource
//                       endpoints where "the archive doesn't exist" is a not-found. Unarchive is a
//                       state-transition action, so calling it on a trip that isn't archived is a
//                       bad request (400), not a missing resource.
```
```js
// web/src/stores/archive.js — new action
async unarchive(tripId) // -> Promise<trip>; clears local archive state (this.clear()) since
                         // the trip is no longer archived; caller (TripSettingsView) still
                         // needs to refetch trips.current for the status chip, same as `archive()`
```

**Accepted behavior:** `GET /trips/:id/archive` keeps returning the (possibly stale) historical
snapshot for a trip that is currently live/un-archived — unarchiving does not delete the
`archives` row. This is intentional, not a bug to fix here: the snapshot is the record of what the
trip looked like at its most recent archiving, and Step 7 below (re-archive) is what refreshes it.

**Steps:**

1. [ ] Write the failing server route test — append to `server/test/archive.test.js` (uses the
   `seedParticipantLink` helper already defined at the top of that file, and the same
   `createTrip`/`createPerson`/`authedInject` imports already in scope):
   ```js
   describe('unarchive', () => {
     it('flips status back to active, keeps archived_at cleared, keeps the archives row, keeps links revoked', async () => {
       const trip = await createTrip(db, { status: 'confirmed' })
       const person = await createPerson(db, { name: 'Alice' })
       await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [trip.id, person.id])
       await seedParticipantLink(app, db, trip.id, person.id)
       await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })

       const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
       expect(res.statusCode).toBe(200)
       expect(res.json().trip.status).toBe('active')
       expect(res.json().trip.archived_at).toBeFalsy()

       const archiveRow = await db.get('SELECT trip_id FROM archives WHERE trip_id = ?', [trip.id])
       expect(archiveRow).toBeTruthy()

       const link = await db.get('SELECT revoked_at FROM participant_links WHERE trip_id = ?', [trip.id])
       expect(link.revoked_at).toBeTruthy()
     })

     it('400 NOT_ARCHIVED when the trip is not archived', async () => {
       const trip = await createTrip(db, { status: 'confirmed' })
       const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
       expect(res.statusCode).toBe(400)
       expect(res.json().error.code).toBe('NOT_ARCHIVED')
     })

     it('404 for another organizer\'s trip', async () => {
       const other = await createOrganizer(db, { email: 'other2@x.dev' })
       const trip = await createTrip(db, { organizer_id: other.id, status: 'archived' })
       const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
       expect(res.statusCode).toBe(404)
     })
   })
   ```
   This last test needs `createOrganizer` imported at the top of `server/test/archive.test.js` —
   its current import line is `import { randomUUID } from 'node:crypto'` /
   `import { describe, it, expect, beforeEach } from 'vitest'` /
   `import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from
   './helpers.js'` — add `createOrganizer` to that last import.
   Run: `npm test --workspace=server -- archive` — expected FAIL (404, no such route).

2. [ ] Implement the route in `server/src/routes/archive.routes.js`, right after the existing
   `POST /trips/:id/archive` handler (which ends at the current line 89, `})`, immediately before
   `app.get('/trips/:id/archive', ...)`):
   ```js
   app.post('/trips/:id/unarchive', { preHandler: app.requireOrganizer }, async (req, reply) => {
     const trip = await getTrip(req)
     if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
     if (trip.status !== 'archived') return httpError(reply, 400, 'NOT_ARCHIVED', 'Trip is not archived')
     await db.run(`UPDATE trips SET status = 'active', archived_at = NULL WHERE id = ?`, [trip.id])
     return { trip: await tripToJson(db, await get(trip.id)) }
   })
   ```
   (`get`, `getTrip`, `tripToJson`, `db` are all already in scope at the top of this file's
   `routes()` — same names the existing handlers use.)
   Note: unarchive always restores `status` to `'active'`, regardless of what status the trip was
   in immediately before it was archived (`'confirmed'` in the test above, but archiving is
   possible from other statuses too) — this is the intended choice, not an oversight; the owner
   can adjust status again from Settings after unarchiving if `'active'` isn't right.
   Run: `npm test --workspace=server -- archive` — expected PASS.

3. [ ] Write the failing web store test — append to `web/src/stores/archive.test.js` (read its
   existing top-of-file mock pattern for `api` first — it's not shown in this research pass;
   confirm before writing so the mock shape matches, e.g. `vi.mock('../api/client.js', ...)` vs.
   an injected fake). A representative test, to adapt to that file's actual mocking convention:
   ```js
   it('unarchive() clears local archive state and returns the updated trip', async () => {
     const store = useArchiveStore()
     store.snapshot = { some: 'thing' }; store.notes = 'n'; store.archived_at = '2026-01-01'
     api.post.mockResolvedValue({ trip: { id: 't1', status: 'active', archived_at: null } })
     const trip = await store.unarchive('t1')
     expect(api.post).toHaveBeenCalledWith('/api/trips/t1/unarchive')
     expect(trip.status).toBe('active')
     expect(store.snapshot).toBeNull()
   })
   ```
   Run: `npm test --workspace=web -- archive` (store test) — expected FAIL (`unarchive is not a
   function`).

4. [ ] Implement the action in `web/src/stores/archive.js`, after the existing `clone()` action
   (last action in the file, ending at line 127 `}`):
   ```js
   async unarchive(tripId) {
     try {
       const res = await api.post(`/api/trips/${tripId}/unarchive`)
       this.clear()
       return res.trip
     } catch (e) { this.error = e.message; throw e }
   }
   ```
   Run: `npm test --workspace=web -- archive` (store test) — expected PASS.

5. [ ] Write the failing web component test — append to
   `web/src/views/trip/TripSettingsView.test.js`. This needs `trips.current.status = 'archived'`
   and `archive.fetchArchive` to resolve (not reject with `NOT_ARCHIVED`) so the archived branch
   of the template renders:
   ```js
   it('shows Unarchive in the archived state and calls the store action on confirm', async () => {
     const router = createRouter({
       history: createMemoryHistory(),
       routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
     })
     await router.push('/trips/t1/settings')
     await router.isReady()
     const pinia = createPinia()
     setActivePinia(pinia)
     const trips = useTripsStore()
     trips.current = { id: 't1', name: 'Goa 2026', status: 'archived', description: '', origin_city: '', vibe_tags: [] }
     trips.fetchTrip = vi.fn().mockResolvedValue(trips.current)
     const archive = useArchiveStore()
     archive.fetchArchive = vi.fn().mockImplementation(async () => {
       archive.snapshot = { budget: { lines: [] }, itinerary: [], checklists: [] }
       archive.archived_at = '2026-01-01 00:00:00'
     })
     archive.unarchive = vi.fn().mockResolvedValue({ id: 't1', status: 'active' })
     const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
     await flushPromises()

     expect(wrapper.text()).toContain('Unarchive trip')
     await wrapper.find('button[aria-label="Unarchive trip"], .unarchive-btn').trigger('click')
     // PrimeVue's ConfirmDialog is asynchronous/portal-rendered — drive it the same way
     // Task 3 Step 6's established pattern does (see this plan's Task 3, "keeps an aria-label
     // and still confirms before deleting an item" test): mount a sibling `ConfirmDialog`
     // (attachTo: document.body) alongside this component, trigger the delete/unarchive button,
     // await $nextTick, find the accept button in document.body by its label text, click it,
     // then await a `setTimeout(0)` before asserting `archive.unarchive` was called. Match that
     // test's structure exactly (including its documented fallback to a `Host` wrapper component
     // if the two separate `mountWithBase()` calls don't share PrimeVue's confirm event bus).
   })
   ```
   Run: `npm test --workspace=web -- TripSettingsView` — expected FAIL (no "Unarchive trip" text,
   component doesn't have the button yet).

6. [ ] Implement in `web/src/views/trip/TripSettingsView.vue`. Add a handler alongside
   `doArchive()` (current lines 125–143):
   ```js
   function doUnarchive() {
     confirm.require({
       message: 'Unarchive this trip? It becomes editable again, but revoked participant links stay revoked — reissue them from People if needed.',
       header: 'Unarchive trip', icon: 'pi pi-box',
       acceptLabel: 'Unarchive', rejectLabel: 'Cancel',
       accept: async () => {
         try {
           await archiveStore.unarchive(tripId.value)
           await trips.fetchTrip(tripId.value)
           notify.success('Trip unarchived')
         } catch (e) { notify.error(e.message) }
       }
     })
   }
   ```
   and in the template, inside the `v-if="isArchived"` block's first `<section class="card">`
   (current lines 201–208, the "Archived" section), add a button after the "Save notes & links"
   button:
   ```html
       <section class="card">
         <h2>Archived</h2>
         <p>Archived at: {{ archiveStore.archived_at }}</p>
         <div class="field"><label for="ts-notes">Notes</label><Textarea id="ts-notes" v-model="notesDraft" rows="3" fluid /></div>
         <div class="field"><label for="ts-photos">Photo links (one per line)</label><Textarea id="ts-photos" v-model="photoLinksDraft" rows="3" fluid /></div>
         <Button label="Save notes & links" @click="saveMeta" />
         <Button label="Unarchive trip" severity="secondary" outlined icon="pi pi-box" class="unarchive-btn" @click="doUnarchive" />
       </section>
   ```
   Run: `npm test --workspace=web -- TripSettingsView` — expected PASS (adjust step 5's confirm
   assertion to whatever this repo's actual confirm-stub convention is, found before finalizing).

7. [ ] **Fix the re-archive guard.** `POST /trips/:id/archive` currently 409s whenever an
   `archives` row already exists for the trip (`archive.routes.js:63`,
   `if (await getArchive(trip.id)) return httpError(reply, 409, 'ALREADY_ARCHIVED', ...)`). Once a
   trip can be unarchived (this task), that guard is wrong: a trip that was archived, then
   unarchived, then archived again is not "already archived" — it's active and being archived for
   the first time in its current lifecycle — but the stale `archives` row from its first archiving
   still exists, so today's code would incorrectly 409 it. Write a failing test first, appended to
   `server/test/archive.test.js`:
   ```js
   it('allows re-archiving a trip after it was unarchived, replacing the old snapshot row', async () => {
     const trip = await createTrip(db, { status: 'confirmed' })
     await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
     await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })

     const before = await db.get('SELECT archived_at FROM archives WHERE trip_id = ?', [trip.id])
     await new Promise((r) => setTimeout(r, 1100)) // archived_at has 1-second text resolution
     const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
     expect(res.statusCode).toBe(200)

     const after = await db.get('SELECT archived_at FROM archives WHERE trip_id = ?', [trip.id])
     expect(after.archived_at).not.toBe(before.archived_at)
   })
   ```
   Run: `npm test --workspace=server -- archive` — expected FAIL (409 ALREADY_ARCHIVED on the
   second archive call).
   Implement: change the guard from an `archives`-row check to a `trip.status` check, and change
   the `INSERT` into `archives` to an upsert so a stale row from a previous archive cycle is
   replaced rather than violating the `trip_id` primary key:
   ```js
   // OLD (archive.routes.js:63)
   if (await getArchive(trip.id)) return httpError(reply, 409, 'ALREADY_ARCHIVED', 'Trip is already archived')
   ```
   ```js
   // NEW
   if (trip.status === 'archived') return httpError(reply, 409, 'ALREADY_ARCHIVED', 'Trip is already archived')
   ```
   ```js
   // OLD (the INSERT inside the db.tx() block)
   await db.run('INSERT INTO archives (trip_id, snapshot_json, notes, photo_links) VALUES (?, ?, ?, ?)',
     [trip.id, JSON.stringify(snapshot), notes, photoLinks])
   ```
   ```js
   // NEW — upsert, since `archives.trip_id` is a PRIMARY KEY and a trip archived a second time
   // reuses the same row rather than erroring on a duplicate key
   await db.run(
     `INSERT INTO archives (trip_id, snapshot_json, notes, photo_links)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (trip_id) DO UPDATE SET
        snapshot_json = EXCLUDED.snapshot_json,
        notes = EXCLUDED.notes,
        photo_links = EXCLUDED.photo_links,
        archived_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`,
     [trip.id, JSON.stringify(snapshot), notes, photoLinks]
   )
   ```
   Run: `npm test --workspace=server -- archive` — expected PASS (all archive tests, including the
   pre-existing "409 when already archived" test, which still holds since that test never
   unarchives in between).

**Final check for Task 12:** `npm test --workspace=server` and `npm test --workspace=web` both
green.

---

### Task 13 — Unified AI draft review component

**Correction to the brief, made after reading the code:** `BudgetTable.vue`'s "AI draft" column
(its lines 60–66) is a *read-only* display of `draftFor(category)` — it has no Apply/Discard
controls of its own. The actual Apply/Discard buttons for the budget draft live in the parent,
`TripBudgetView.vue` (lines 138–147: a separate `<div class="card"><h2>AI draft</h2>...` block
with the trigger button, a compare hint, and `Apply`/`Discard`). So there is nothing in
`BudgetTable.vue` to convert, and no `DraftReviewBar.vue` extraction is needed — the budget flow
adopts `DraftReview.vue` the same way the other three do, just in `TripBudgetView.vue` instead of
a component. `BudgetTable.vue` itself is untouched by this task.

**Files:**
- Create `web/src/components/DraftReview.vue`
- Create `web/src/components/DraftReview.test.js`
- Modify `web/src/views/trip/TripItineraryView.vue` (whole-trip draft card)
- Modify `web/src/components/DayCard.vue` (day-regen draft card)
- Modify `web/src/views/trip/TripBudgetView.vue` (AI draft card)
- Modify `web/src/components/ChecklistCard.vue` (packing draft card)
- Re-run each of the above four components' existing test files
  (`TripItineraryView.test.js`, `TripBudgetView.test.js`, `DayCard.test.js`, `ChecklistCard.test.js`
  — all four now exist, created in earlier tasks) — no new assertions required unless an existing
  test asserted the old markup directly (grep each for `Apply`/`Discard` button text before
  editing, to catch any brittle text assertion).

**Interfaces:**
```js
// web/src/components/DraftReview.vue
// Props:
//   title: { type: String, required: true }        // e.g. "AI draft", "AI packing draft"
//   busy:  { type: Boolean, default: false }        // disables both footer buttons
//   error: { type: String, default: null }          // shown as a footer error line; no caller
//                                                    // in this task passes one (see note below)
// Slots:
//   default  — the draft's own rendering (day list, budget compare, packing items, ...)
//   empty    — shown instead of default when the caller passes no default-slot content worth
//              showing; caller decides via its own v-if, DraftReview does not inspect slot content
// Emits:
//   'apply'   — Apply clicked (disabled while busy)
//   'discard' — Discard clicked (disabled while busy)
// No behavior change: this component only presents; every adoption below keeps calling the exact
// same store actions it already called (applyDraft/discardWholeDraft, applyDay/discardDayDraft,
// applyDraft/discardDraft in TripBudgetView, applyPackingDraft/discardDraft in ChecklistCard).
```
Design note on `error`: none of the four current draft cards show a *local* error line today (page-
level errors go through `notify.error()` toasts or a page-top `store.error` banner, which already
exist independently and are NOT being touched by this task, to keep "no behavior change" literal).
All four adoptions below therefore pass no `error` prop (component defaults it to `null` and
renders nothing) — the prop exists on the component for future callers, not exercised yet.

**Steps:**

1. [ ] Write `web/src/components/DraftReview.test.js` first (component doesn't exist yet):
   ```js
   import { describe, it, expect, vi } from 'vitest'
   import { mountWithBase } from '../test-utils.js'
   import DraftReview from './DraftReview.vue'

   describe('DraftReview', () => {
     it('renders the title and default slot, emits apply/discard', async () => {
       const wrapper = mountWithBase(DraftReview, {
         props: { title: 'AI draft' },
         slots: { default: '<p class="draft-body">Body</p>' }
       })
       expect(wrapper.text()).toContain('AI draft')
       expect(wrapper.find('.draft-body').exists()).toBe(true)
       await wrapper.find('[data-test="draft-apply"]').trigger('click')
       await wrapper.find('[data-test="draft-discard"]').trigger('click')
       expect(wrapper.emitted('apply')).toHaveLength(1)
       expect(wrapper.emitted('discard')).toHaveLength(1)
     })

     it('renders the empty slot when given, and disables both buttons while busy', async () => {
       const wrapper = mountWithBase(DraftReview, {
         props: { title: 'AI draft', busy: true },
         slots: { empty: '<p class="draft-empty">Nothing yet</p>' }
       })
       expect(wrapper.find('.draft-empty').exists()).toBe(true)
       expect(wrapper.find('[data-test="draft-apply"]').attributes('disabled')).toBeDefined()
       expect(wrapper.find('[data-test="draft-discard"]').attributes('disabled')).toBeDefined()
     })

     it('shows the error line only when an error prop is given', async () => {
       const withError = mountWithBase(DraftReview, { props: { title: 'AI draft', error: 'boom' } })
       expect(withError.text()).toContain('boom')
       const without = mountWithBase(DraftReview, { props: { title: 'AI draft' } })
       expect(without.find('[data-test="draft-error"]').exists()).toBe(false)
     })
   })
   ```
   Run: `npm test --workspace=web -- DraftReview` — expected FAIL (component doesn't exist).

2. [ ] Implement `web/src/components/DraftReview.vue`:
   ```html
   <script setup>
   defineProps({
     title: { type: String, required: true },
     busy: { type: Boolean, default: false },
     error: { type: String, default: null }
   })
   defineEmits(['apply', 'discard'])
   </script>

   <template>
     <div class="draft-review card">
       <header class="draft-review-head">
         <i class="pi pi-sparkles" aria-hidden="true" />
         <h4>{{ title }}</h4>
       </header>
       <div class="draft-review-body">
         <slot><slot name="empty" /></slot>
       </div>
       <p v-if="error" class="draft-review-error" data-test="draft-error">{{ error }}</p>
       <footer class="draft-review-footer">
         <button type="button" data-test="draft-apply" :disabled="busy" @click="$emit('apply')">Apply</button>
         <button type="button" data-test="draft-discard" class="draft-review-discard" :disabled="busy" @click="$emit('discard')">Discard</button>
       </footer>
     </div>
   </template>

   <style scoped>
   .draft-review { background: var(--app-primary-soft); }
   .draft-review-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
   .draft-review-head h4 { margin: 0; }
   .draft-review-error { color: var(--app-danger, #c0392b); font-size: 0.875rem; }
   .draft-review-footer { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
   .draft-review-discard { background: transparent; }
   </style>
   ```
   Note: the default slot's fallback (`<slot name="empty" />` nested inside the default `<slot>`)
   means: if the caller supplies default-slot content, that renders; if the caller supplies
   nothing to the default slot at all, whatever the caller put in the named `empty` slot renders
   instead. This matches "caller decides via its own v-if" — e.g. a caller can pass
   `<template #default v-if="hasItems">...</template><template #empty>No items</template>`.
   Run: `npm test --workspace=web -- DraftReview` — expected PASS (3 tests).

3. [ ] Adopt in `TripItineraryView.vue`. Current draft block (lines 105–120):
   ```html
       <div v-if="store.draft" class="card ai-draft-card">
         <h2>AI draft preview</h2>
         <div v-for="d in store.draft" :key="d.day_date" style="margin-bottom:1rem">
           <h3>{{ d.day_date }}</h3>
           <ul style="list-style:none;padding:0;margin:0">
             <li v-for="(it, i) in d.items" :key="i">
               <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
               <strong>{{ it.title }}</strong>
               <span v-if="it.location">— {{ it.location }}</span>
               <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, trips.current?.currency) }}</span>
             </li>
           </ul>
         </div>
         <Button type="button" @click="applyWholeDraft">Apply</Button>
         <Button type="button" severity="secondary" outlined @click="discardWholeDraft">Discard</Button>
       </div>
   ```
   (the `est_cost` span already reads `formatMoney(it.est_cost, trips.current?.currency)` as of
   Task 1 Step 7 — shown above as already landed, since this task only re-parents the block.)
   Edit to:
   ```html
       <DraftReview v-if="store.draft" title="AI draft preview" :busy="store.aiBusy" @apply="applyWholeDraft" @discard="discardWholeDraft">
         <div v-for="d in store.draft" :key="d.day_date" style="margin-bottom:1rem">
           <h3>{{ d.day_date }}</h3>
           <ul style="list-style:none;padding:0;margin:0">
             <li v-for="(it, i) in d.items" :key="i">
               <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
               <strong>{{ it.title }}</strong>
               <span v-if="it.location">— {{ it.location }}</span>
               <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, trips.current?.currency) }}</span>
             </li>
           </ul>
         </div>
       </DraftReview>
   ```
   and add the import at the top with the other component imports:
   ```js
   import DraftReview from '../../components/DraftReview.vue'
   ```
   Remove the now-unused `.ai-draft-card` scoped style rule (its background now lives in
   `DraftReview.vue` itself) — delete:
   ```css
   .ai-draft-card { background: var(--app-primary-soft); }
   ```
   Run: `npm test --workspace=web -- TripItineraryView` — expected PASS (the existing
   "restores an unapplied AI draft" test asserts `wrapper.text()).toContain('Beach walk')`, which
   still holds since the item list markup is unchanged, only re-parented).

4. [ ] Adopt in `DayCard.vue`. Current draft block (lines 109–122):
   ```html
       <div v-if="dayDraft" class="card day-draft">
         <h4>Draft for {{ formatDayDate(day.day_date) }}</h4>
         <ul class="day-items">
           <li v-for="(it, i) in dayDraft" :key="i">
             {{ categoryIcon(it.category) }}
             <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
             <strong>{{ it.title }}</strong>
             <span v-if="it.location">— {{ it.location }}</span>
             <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, currency) }}</span>
           </li>
         </ul>
         <Button type="button" label="Apply" @click="applyDayDraft" />
         <Button type="button" label="Discard" severity="secondary" outlined @click="discardDayDraft" />
       </div>
   ```
   (the `<h4>` and `est_cost` span already read `formatDayDate(day.day_date)` / `formatMoney(it.est_cost,
   currency)` as of Task 2 Step 3 / Task 1 Step 3 — shown above as already landed, since this task
   only re-parents the block. Both `formatDayDate` and `formatMoney` are already imported.)
   Edit to:
   ```html
       <DraftReview v-if="dayDraft" :title="`Draft for ${formatDayDate(day.day_date)}`" :busy="store.aiBusy" @apply="applyDayDraft" @discard="discardDayDraft">
         <ul class="day-items">
           <li v-for="(it, i) in dayDraft" :key="i">
             {{ categoryIcon(it.category) }}
             <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
             <strong>{{ it.title }}</strong>
             <span v-if="it.location">— {{ it.location }}</span>
             <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, currency) }}</span>
           </li>
         </ul>
       </DraftReview>
   ```
   Add the import alongside the existing ones:
   ```js
   import ItineraryItemForm from './ItineraryItemForm.vue'
   ```
   →
   ```js
   import ItineraryItemForm from './ItineraryItemForm.vue'
   import DraftReview from './DraftReview.vue'
   ```
   Remove the now-unused `.day-draft { background: var(--app-surface-alt); }` scoped rule.
   `DayCard.test.js` exists by this point (created in Task 2 Step 4, appended by Task 3 Step 6 and
   Task 9 Step 5) — re-run it: `npm test --workspace=web -- DayCard.test.js`. It doesn't cover day
   drafts directly, so this only catches breakage in the assertions it does have (headers, cost
   rendering, delete confirm); the draft re-parenting itself is exercised indirectly via
   `TripItineraryView.test.js`, which doesn't touch day drafts either.

5. [ ] Adopt in `TripBudgetView.vue`. Current AI draft card (lines 138–147):
   ```html
         <div class="card">
           <h2>AI draft</h2>
           <Button v-if="auth.aiEnabled" :label="store.aiBusy ? 'Generating…' : 'AI draft'" :disabled="store.aiBusy" @click="runAiDraft" />
           <p v-else>AI suggestions are turned off</p>
           <div v-if="store.draft">
             <p>Compare the "AI draft" column above against your estimates, then apply or discard.</p>
             <Button label="Apply" @click="applyDraft" />
             <Button label="Discard" severity="secondary" outlined @click="discardDraft" />
           </div>
         </div>
   ```
   Edit to (splitting the trigger from the review, as the other three flows already do):
   ```html
         <div class="card">
           <h2>AI draft</h2>
           <Button v-if="auth.aiEnabled" :label="store.aiBusy ? 'Generating…' : 'AI draft'" :disabled="store.aiBusy" @click="runAiDraft" />
           <p v-else>AI suggestions are turned off</p>
         </div>

         <DraftReview v-if="store.draft" title="AI draft" :busy="store.aiBusy" @apply="applyDraft" @discard="discardDraft">
           <p>Compare the "AI draft" column above against your estimates, then apply or discard.</p>
         </DraftReview>
   ```
   Add the import:
   ```js
   import BudgetTable from '../../components/BudgetTable.vue'
   ```
   →
   ```js
   import BudgetTable from '../../components/BudgetTable.vue'
   import DraftReview from '../../components/DraftReview.vue'
   ```
   Before running tests, `grep -n "AI draft\|Apply\|Discard" web/src/views/trip/TripBudgetView.test.js`
   to check whether an existing test asserts on the old single-card structure (e.g. counts
   `.card` elements, or looks for the Apply button nested a specific way); adjust only if a test
   actually breaks — the button text and click behavior are unchanged, only the wrapping markup.
   Run: `npm test --workspace=web -- TripBudgetView` — expected PASS.

6. [ ] Adopt in `ChecklistCard.vue`. Current draft block (lines 157–164):
   ```html
       <div v-if="draft" class="card">
         <h4>AI packing draft</h4>
         <ul>
           <li v-for="(item, idx) in draft.items" :key="idx">{{ item.title }}</li>
         </ul>
         <Button type="button" label="Apply" @click="applyDraft" />
         <Button type="button" label="Discard" severity="secondary" outlined @click="discardDraft" />
       </div>
   ```
   Edit to:
   ```html
       <DraftReview v-if="draft" title="AI packing draft" :busy="store.aiBusy" @apply="applyDraft" @discard="discardDraft">
         <ul>
           <li v-for="(item, idx) in draft.items" :key="idx">{{ item.title }}</li>
         </ul>
       </DraftReview>
   ```
   Add the import:
   ```js
   import DateField from './DateField.vue'
   ```
   →
   ```js
   import DateField from './DateField.vue'
   import DraftReview from './DraftReview.vue'
   ```
   `ChecklistCard.test.js` exists by this point (created in Task 3 Step 7) — re-run it:
   `npm test --workspace=web -- ChecklistCard.test.js`.
   Run: `npm test --workspace=web` (full web suite, including `DayCard.test.js` and
   `ChecklistCard.test.js`) — expected PASS.

**Final check for Task 13:** `npm test --workspace=web` green (all component/view tests,
including the new `DraftReview.test.js`).

---

## Cross-task notes

- Task 11 depends on Task 10 only for the entry-button wiring in `TripItineraryView.vue` (both
  edit the same toolbar region) — implement Task 10 first, or reconcile the two edits to that
  file's `<template>` by hand if done out of order.
- Task 13's `DraftReview.vue` has no dependency on Tasks 10–12; it can run in parallel with them
  if picked up by a different session, since it only touches `TripItineraryView.vue`,
  `DayCard.vue`, `TripBudgetView.vue`, `ChecklistCard.vue` — none of which Tasks 10–12 touch
  (Task 10 touches `TripItineraryView.vue` too, but a different region: the toolbar card above
  the AI draft card vs. the draft card itself — diff carefully if both land on the same branch).
- None of these four tasks touch server migrations — no new columns, no new tables. Task 12 is
  the only one with a DB write, and it's a two-column `UPDATE` on the existing `trips` table.
