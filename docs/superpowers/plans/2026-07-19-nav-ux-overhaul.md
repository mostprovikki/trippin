# Nav + UX Overhaul Implementation Plan

> **STATUS (audited 2026-07-28): Tasks 1–14 all implemented.** Task 8's router cutover completed cleanly (TripDetailView.vue, TripArchiveView.vue, TripTabs.vue deleted as prescribed); Task 12's legacy CSS purge done (zero `class="btn"` remains). Baseline at audit: web 270/270, server 114/114 tests green.
> **The checkboxes below are stale — unchecked ≠ undone.** They were never ticked during implementation. Do not read them as a progress signal; treat this doc as historical task spec, not a live tracker.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the trip UI around a persistent nested-route shell (sidebar + breadcrumb), a dashboard Overview, and a warm-travel theme, per `docs/superpowers/specs/2026-07-19-nav-ux-overhaul-design.md`.

**Architecture:** vue-router nested routes: `/trips/:id` renders `TripLayout` (fetches trip + readiness once, renders sidebar with hint badges); sections are child routes in `web/src/views/trip/`. Theme via PrimeVue `definePreset(Aura)` + CSS tokens in `main.css`. Pure nav/derivation logic in `web/src/utils/tripNav.js` (unit-tested).

**Tech Stack:** Vue 3 `<script setup>`, vue-router 4, Pinia, PrimeVue 4 (Aura), vitest + @vue/test-utils + happy-dom.

## Global Constraints

- Frontend only (`web/`). API contract unchanged. `e2e/smoke.mjs` must stay green.
- NO legacy URL compatibility — old flat routes/names are deleted, not redirected.
- Every authenticated view renders inside a shared layout with persistent nav. Bare routes: `/login`, `/p/:token` only.
- All test commands run from `web/`: `npm test --workspace=web -- <file>` from repo root, or `npx vitest run <file>` inside `web/`.
- Commit after every task. Commit style: `feat(nav): …` / `refactor(nav): …` etc., ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Existing composables (`useDraft`, `confirmDiscard`, `useNotify`) and stores are reused as-is unless a task says otherwise.
- Icons: PrimeIcons classes (`pi pi-*`) already available.
- Colors ONLY from theme preset / CSS tokens defined in Task 1 — no new hex literals in components (scoped styles use `var(--app-*)` or PrimeVue `var(--p-*)`).
- The final task (browser click-through + screenshot review) is a completion gate: the overhaul is not done if it fails, regardless of unit test results.

---

### Task 1: Theme preset + CSS tokens

**Files:**
- Create: `web/src/theme.js`
- Modify: `web/src/main.js`
- Rewrite: `web/src/assets/main.css`

**Interfaces:**
- Produces: `TripperPreset` (PrimeVue preset), CSS custom properties `--app-bg`, `--app-surface`, `--app-border`, `--app-text`, `--app-text-muted`, `--app-radius-sm` (8px), `--app-radius` (12px), `--app-shadow-sm`, `--app-shadow-md`; global classes `.page`, `.card`, `.field` (kept), `.table`, `.badge*` (kept until Task 12 purge).

- [ ] **Step 1: Create `web/src/theme.js`**

```js
import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

// Warm-travel identity: deep teal primary on warm neutral surfaces.
export const TripperPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
      500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e'
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}'
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}'
        }
      }
    }
  }
})
```

- [ ] **Step 2: Wire preset in `web/src/main.js`**

Replace the Aura import and `use(PrimeVue, …)` line:

```js
// remove: import Aura from '@primevue/themes/aura'
import { TripperPreset } from './theme.js'
// …
  .use(PrimeVue, { theme: { preset: TripperPreset, options: { darkModeSelector: 'none' } } })
```

- [ ] **Step 3: Rewrite `web/src/assets/main.css`**

Full replacement content:

```css
/* Global shell: tokens, page scaffolding, form/table utilities. PrimeVue owns component chrome. */

:root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color-scheme: light;
  -webkit-font-smoothing: antialiased;

  --app-bg: #faf9f7;
  --app-surface: #ffffff;
  --app-border: #e7e5e0;
  --app-text: #1c1917;
  --app-text-muted: #78716c;
  --app-primary: #0f766e;
  --app-primary-soft: #f0fdfa;
  --app-accent: #d97706;
  --app-accent-soft: #fef3c7;
  --app-radius-sm: 8px;
  --app-radius: 12px;
  --app-shadow-sm: 0 1px 2px rgba(28, 25, 23, 0.05);
  --app-shadow-md: 0 4px 12px rgba(28, 25, 23, 0.08);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--app-bg);
  color: var(--app-text);
  font-size: 0.9375rem;
  line-height: 1.5;
}

/* Typography scale: 24 / 18 / 16 base 15 / small 13 */
h1 { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.015em; margin: 0 0 1rem; }
h2 { font-size: 1.125rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 0.75rem; }
h3 { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }

a { color: var(--app-primary); }

.page {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.card {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  box-shadow: var(--app-shadow-sm);
  padding: 1.25rem;
  margin-bottom: 1rem;
}

/* Form field */
.field { display: block; margin-bottom: 1rem; }
.field label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--app-text-muted);
}
.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  font-size: 0.9375rem;
  font-family: inherit;
  background: var(--app-surface);
  color: var(--app-text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--app-primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
}

/* Table (legacy — being replaced by DataTable; keep until Task 12) */
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { text-align: left; padding: 0.625rem 0.5rem; border-bottom: 1px solid var(--app-border); }
.table th { font-size: 0.8125rem; font-weight: 600; color: var(--app-text-muted); }

/* Badges (legacy — keep until Task 12) */
.badge { display: inline-block; padding: 0.125rem 0.625rem; border-radius: 999px; background: #eceae6; color: var(--app-text); font-size: 0.75rem; font-weight: 500; }
.badge-warn { background: var(--app-accent-soft); color: #92400e; }
.badge-ok { background: #d1fae5; color: #065f46; }

/* Legacy .btn (still used by DayCard etc. until Task 12) */
.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  color: var(--app-text);
  cursor: pointer;
  font-size: 0.9375rem;
  font-family: inherit;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.btn:hover { background: #f5f4f1; }
.btn-primary { background: var(--app-primary); border-color: var(--app-primary); color: #fff; }
.btn-primary:hover { background: #115e59; border-color: #115e59; }

@media (max-width: 40rem) {
  .table, .table thead, .table tbody, .table th, .table td, .table tr { display: block; }
  .table thead { display: none; }
  .table tr { margin-bottom: 0.75rem; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); }
  .table td { border-bottom: none; }
}
```

- [ ] **Step 4: Verify: tests + visual**

Run: `npm test --workspace=web`
Expected: all existing tests PASS (theme change is non-behavioral).
Then with dev servers running (server `PORT=3100`, web `API_PROXY=http://localhost:3100`), load `http://localhost:5173/login` — button must now be teal, not green.

- [ ] **Step 5: Commit**

```bash
git add web/src/theme.js web/src/main.js web/src/assets/main.css
git commit -m "feat(theme): warm-travel PrimeVue preset (teal primary) + CSS design tokens"
```

---

### Task 2: `tripNav` utils (sections, hints, percent, next actions)

**Files:**
- Create: `web/src/utils/tripNav.js`
- Test: `web/src/utils/tripNav.test.js`

**Interfaces:**
- Produces:
  - `TRIP_SECTIONS`: `[{ name, label, icon, group }]` — route names `trip-overview|trip-dates|trip-destination|trip-goals|trip-people|trip-budget|trip-itinerary|trip-checklists|trip-readiness|trip-settings`; groups `null|'Plan'|'People'|'Logistics'`.
  - `sectionHints(readinessData) -> { [routeName]: { ok?: boolean, count?: number, text?: string } }`
  - `readinessPercent(readinessData) -> number` (0–100 int; 0 when data null)
  - `nextActions(readinessData) -> [{ label, to }]` (`to` = route name)
- Consumes: readiness API shape — `{ decisions: { dates_confirmed, destination_decided, budget_drafted, itinerary_days }, participants: [{ profile_confirmed, … }], checklists: { total_items, done_items, overdue: [] } }` (see `web/src/views/TripReadinessView.vue` for the live shape).

- [ ] **Step 1: Write the failing test `web/src/utils/tripNav.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { TRIP_SECTIONS, sectionHints, readinessPercent, nextActions } from './tripNav.js'

const READY = {
  decisions: { dates_confirmed: 1, destination_decided: 1, budget_drafted: 1, itinerary_days: 3 },
  participants: [{ profile_confirmed: 1 }, { profile_confirmed: 1 }],
  checklists: { total_items: 4, done_items: 4, overdue: [] }
}
const FRESH = {
  decisions: { dates_confirmed: 0, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
  participants: [],
  checklists: { total_items: 0, done_items: 0, overdue: [] }
}
const MID = {
  decisions: { dates_confirmed: 1, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
  participants: [{ profile_confirmed: 1 }, { profile_confirmed: 0 }, { profile_confirmed: 0 }],
  checklists: { total_items: 4, done_items: 1, overdue: [{ title: 'Book flights' }] }
}

describe('TRIP_SECTIONS', () => {
  it('has 10 sections, overview first, settings last', () => {
    expect(TRIP_SECTIONS).toHaveLength(10)
    expect(TRIP_SECTIONS[0].name).toBe('trip-overview')
    expect(TRIP_SECTIONS.at(-1).name).toBe('trip-settings')
    for (const s of TRIP_SECTIONS) {
      expect(s.label).toBeTruthy()
      expect(s.icon).toMatch(/^pi pi-/)
    }
  })
})

describe('sectionHints', () => {
  it('returns {} without data', () => {
    expect(sectionHints(null)).toEqual({})
  })
  it('flags undone decisions, counts, percent', () => {
    const h = sectionHints(MID)
    expect(h['trip-dates']).toEqual({ ok: true })
    expect(h['trip-destination']).toEqual({ ok: false })
    expect(h['trip-people']).toEqual({ count: 2 })
    expect(h['trip-checklists']).toEqual({ count: 1 })
    expect(h['trip-readiness'].text).toMatch(/%$/)
  })
  it('hides zero counts', () => {
    const h = sectionHints(READY)
    expect(h['trip-people']).toBeUndefined()
    expect(h['trip-checklists']).toBeUndefined()
  })
})

describe('readinessPercent', () => {
  it('0 without data, 100 when everything done', () => {
    expect(readinessPercent(null)).toBe(0)
    expect(readinessPercent(READY)).toBe(100)
  })
  it('fresh trip is 0 (empty participant/checklist sets do not count)', () => {
    expect(readinessPercent(FRESH)).toBe(0)
  })
  it('partial is between 0 and 100', () => {
    const p = readinessPercent(MID)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(100)
  })
})

describe('nextActions', () => {
  it('empty without data and when fully ready', () => {
    expect(nextActions(null)).toEqual([])
    expect(nextActions(READY)).toEqual([])
  })
  it('fresh trip includes the guided-setup actions incl. adding people', () => {
    expect(nextActions(FRESH)).toContainEqual({ label: 'Add participants', to: 'trip-people' })
    expect(nextActions(FRESH)).toContainEqual({ label: 'Confirm the dates', to: 'trip-dates' })
  })
  it('lists gaps with target routes', () => {
    const actions = nextActions(MID)
    expect(actions).toEqual([
      { label: 'Decide the destination', to: 'trip-destination' },
      { label: 'Draft a budget', to: 'trip-budget' },
      { label: 'Build the itinerary', to: 'trip-itinerary' },
      { label: '2 participant profiles unconfirmed', to: 'trip-people' },
      { label: '1 overdue checklist item', to: 'trip-checklists' }
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/utils/tripNav.test.js`
Expected: FAIL — cannot resolve `./tripNav.js`.

- [ ] **Step 3: Implement `web/src/utils/tripNav.js`**

```js
// Trip-section registry + readiness-derived nav hints. Pure functions, no Vue.

export const TRIP_SECTIONS = [
  { name: 'trip-overview', label: 'Overview', icon: 'pi pi-home', group: null },
  { name: 'trip-dates', label: 'Dates', icon: 'pi pi-calendar', group: 'Plan' },
  { name: 'trip-destination', label: 'Destination', icon: 'pi pi-map-marker', group: 'Plan' },
  { name: 'trip-goals', label: 'Goals', icon: 'pi pi-flag', group: 'Plan' },
  { name: 'trip-people', label: 'People', icon: 'pi pi-users', group: 'People' },
  { name: 'trip-budget', label: 'Budget', icon: 'pi pi-wallet', group: 'Logistics' },
  { name: 'trip-itinerary', label: 'Itinerary', icon: 'pi pi-list-check', group: 'Logistics' },
  { name: 'trip-checklists', label: 'Checklists', icon: 'pi pi-check-square', group: 'Logistics' },
  { name: 'trip-readiness', label: 'Readiness', icon: 'pi pi-gauge', group: null },
  { name: 'trip-settings', label: 'Settings', icon: 'pi pi-cog', group: null }
]

function parts(data) {
  const d = data?.decisions || {}
  const participants = data?.participants || []
  const checklists = data?.checklists || {}
  const unconfirmed = participants.filter((p) => !p.profile_confirmed).length
  return { d, participants, checklists, unconfirmed, overdue: (checklists.overdue || []).length }
}

export function sectionHints(data) {
  if (!data) return {}
  const { d, unconfirmed, overdue } = parts(data)
  const hints = {
    'trip-dates': { ok: !!d.dates_confirmed },
    'trip-destination': { ok: !!d.destination_decided },
    'trip-readiness': { text: `${readinessPercent(data)}%` }
  }
  if (unconfirmed > 0) hints['trip-people'] = { count: unconfirmed }
  if (overdue > 0) hints['trip-checklists'] = { count: overdue }
  return hints
}

// Equal-weight average over applicable components: the 4 decisions always
// count; participant confirmation and checklist completion count only when
// non-empty (so a fresh trip reads 0%, not 50%).
export function readinessPercent(data) {
  if (!data) return 0
  const { d, participants, checklists } = parts(data)
  const components = [
    d.dates_confirmed ? 1 : 0,
    d.destination_decided ? 1 : 0,
    d.budget_drafted ? 1 : 0,
    (d.itinerary_days || 0) > 0 ? 1 : 0
  ]
  if (participants.length) {
    components.push(participants.filter((p) => p.profile_confirmed).length / participants.length)
  }
  if (checklists.total_items) {
    components.push((checklists.done_items || 0) / checklists.total_items)
  }
  return Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 100)
}

export function nextActions(data) {
  if (!data) return []
  const { d, unconfirmed, overdue } = parts(data)
  const actions = []
  if (!d.dates_confirmed) actions.push({ label: 'Confirm the dates', to: 'trip-dates' })
  if (!d.destination_decided) actions.push({ label: 'Decide the destination', to: 'trip-destination' })
  if (!d.budget_drafted) actions.push({ label: 'Draft a budget', to: 'trip-budget' })
  if (!(d.itinerary_days > 0)) actions.push({ label: 'Build the itinerary', to: 'trip-itinerary' })
  if (!parts(data).participants.length) actions.push({ label: 'Add participants', to: 'trip-people' })
  if (unconfirmed > 0) actions.push({ label: `${unconfirmed} participant profile${unconfirmed === 1 ? '' : 's'} unconfirmed`, to: 'trip-people' })
  if (overdue > 0) actions.push({ label: `${overdue} overdue checklist item${overdue === 1 ? '' : 's'}`, to: 'trip-checklists' })
  return actions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/utils/tripNav.test.js`
Expected: PASS (note: `pi pi-list-check` and `pi pi-gauge` exist in primeicons ≥7; if the icon font lacks one at visual check time, substitute `pi pi-list` / `pi pi-chart-line` — tests only assert the `pi pi-` prefix).

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/tripNav.js web/src/utils/tripNav.test.js
git commit -m "feat(nav): tripNav registry + readiness-derived hints/percent/next-actions"
```

---

### Task 3: `SectionHeader` component

**Files:**
- Create: `web/src/components/SectionHeader.vue`

**Interfaces:**
- Produces: `<SectionHeader :title :description>` with `#actions` slot. Renders `h1.section-title` — all section views use this instead of their own `<h1>`/`main.page` wrapper.

- [ ] **Step 1: Create `web/src/components/SectionHeader.vue`**

```vue
<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' }
})
</script>

<template>
  <header class="section-header">
    <div>
      <h1 class="section-title">{{ title }}</h1>
      <p v-if="description" class="section-desc">{{ description }}</p>
    </div>
    <div class="section-actions"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}
.section-title { margin: 0; }
.section-desc { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.875rem; }
.section-actions { display: flex; gap: 0.5rem; align-items: center; }
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vite build`
Expected: build succeeds (component unused yet — that's fine).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SectionHeader.vue
git commit -m "feat(nav): SectionHeader component (title/description/actions pattern)"
```

---

### Task 4: Plan-section views — Dates, Destination, Goals

**Files:**
- Create: `web/src/views/trip/TripDatesView.vue`
- Create: `web/src/views/trip/TripDestinationView.vue`
- Create: `web/src/views/trip/TripGoalsView.vue`
- Test: `web/src/views/trip/TripDatesView.test.js`

**Interfaces:**
- Consumes: `useTripsStore()` (`current`, `saveWindows`, `fetchCandidates`, `candidates`, `addGoal`, `updateGoal`, `deleteGoal`), existing editors `DateWindowsEditor` (props `windows`, emit `save`), `DestinationPanel` (props `trip-id`, `candidates`), `GoalsEditor` (props `goals`, emits `add/update/delete`), `SectionHeader` (Task 3).
- Produces: three child views mounted by the router in Task 7. They assume `TripLayout` already loaded `trips.current`; each still tolerates direct mount (null-safe reads).

- [ ] **Step 1: Write the failing test `web/src/views/trip/TripDatesView.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripDatesView from './TripDatesView.vue'
import { useTripsStore } from '../../stores/trips.js'

describe('TripDatesView', () => {
  it('renders section header and passes windows to editor', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/dates', name: 'trip-dates', component: TripDatesView }]
    })
    await router.push('/trips/t1/dates')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTripsStore()
    store.current = { id: 't1', name: 'Goa 2026', windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }] }
    store.saveWindows = vi.fn().mockResolvedValue([])
    const wrapper = mountWithBase(TripDatesView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Dates')
    expect(wrapper.findComponent({ name: 'DateWindowsEditor' }).props('windows')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/trip/TripDatesView.test.js`
Expected: FAIL — cannot resolve `./TripDatesView.vue`.

- [ ] **Step 3: Create the three views**

`web/src/views/trip/TripDatesView.vue`:

```vue
<script setup>
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DateWindowsEditor from '../../components/DateWindowsEditor.vue'

const trips = useTripsStore()
const notify = useNotify()

async function onSave(windows) {
  try {
    await trips.saveWindows(trips.current.id, windows)
    notify.success('Dates saved')
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader title="Dates" description="Propose date windows, then confirm one to lock the trip dates." />
    <div class="card">
      <DateWindowsEditor :windows="trips.current?.windows || []" @save="onSave" />
    </div>
  </div>
</template>
```

`web/src/views/trip/TripDestinationView.vue`:

```vue
<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DestinationPanel from '../../components/DestinationPanel.vue'

const route = useRoute()
const trips = useTripsStore()
const notify = useNotify()

onMounted(async () => {
  try { await trips.fetchCandidates(route.params.id) } catch (e) { notify.error(e.message) }
})
</script>

<template>
  <div>
    <SectionHeader title="Destination" description="Collect candidates, compare, and decide." />
    <div class="card">
      <DestinationPanel :trip-id="route.params.id" :candidates="trips.candidates" />
    </div>
  </div>
</template>
```

`web/src/views/trip/TripGoalsView.vue`:

```vue
<script setup>
import { useRoute } from 'vue-router'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import GoalsEditor from '../../components/GoalsEditor.vue'

const route = useRoute()
const trips = useTripsStore()
const notify = useNotify()

async function onAdd(goal) {
  try { await trips.addGoal(route.params.id, goal) } catch (e) { notify.error(e.message) }
}
async function onUpdate(goalId, goal) {
  try { await trips.updateGoal(goalId, goal) } catch (e) { notify.error(e.message) }
}
async function onDelete(goalId) {
  try { await trips.deleteGoal(goalId) } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader title="Goals" description="What this trip is for — fixed events, must-dos, shared intentions." />
    <div class="card">
      <GoalsEditor :goals="trips.current?.goals || []" @add="onAdd" @update="onUpdate" @delete="onDelete" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/trip/TripDatesView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/trip/TripDatesView.vue web/src/views/trip/TripDestinationView.vue web/src/views/trip/TripGoalsView.vue web/src/views/trip/TripDatesView.test.js
git commit -m "feat(nav): Dates/Destination/Goals section views"
```

---

### Task 5: Trip People view

**Files:**
- Create: `web/src/views/trip/TripPeopleView.vue`
- Test: `web/src/views/trip/TripPeopleView.test.js`

**Interfaces:**
- Consumes: `useTripsStore()` (`current.participants`, `links`, `fetchLinks`, `addParticipant`, `removeParticipant`, `createLink`, `revokeLink`), `usePeopleStore()` (`people`, `fetchPeople`), PrimeVue `Select`, `Button`, `Tag`, `useConfirm`.
- Produces: `trip-people` child view. Link-reveal callout uses class `link-reveal`.

- [ ] **Step 1: Write the failing test `web/src/views/trip/TripPeopleView.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripPeopleView from './TripPeopleView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/people', name: 'trip-people', component: TripPeopleView }]
  })
  await router.push('/trips/t1/people')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  const people = usePeopleStore()
  trips.current = { id: 't1', name: 'Goa 2026', participants: [{ person_id: 'p1', name: 'Asha' }] }
  trips.fetchLinks = vi.fn().mockResolvedValue()
  people.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripPeopleView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips }
}

describe('TripPeopleView', () => {
  it('lists participants with actions', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('People')
    expect(wrapper.text()).toContain('Asha')
    expect(wrapper.text()).toContain('Create link')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/trip/TripPeopleView.test.js`
Expected: FAIL — cannot resolve `./TripPeopleView.vue`.

- [ ] **Step 3: Create `web/src/views/trip/TripPeopleView.vue`**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import EmptyState from '../../components/EmptyState.vue'

const route = useRoute()
const trips = useTripsStore()
const people = usePeopleStore()
const confirm = useConfirm()
const notify = useNotify()

const tripId = computed(() => route.params.id)
const newParticipantId = ref(null)
const revealedLink = ref(null)
// window globals aren't reachable from template expression scope
const origin = location.origin

const availablePeople = computed(() => {
  if (!trips.current) return []
  const memberIds = new Set((trips.current.participants || []).map((p) => p.person_id))
  return people.people.filter((p) => !memberIds.has(p.id))
})

onMounted(async () => {
  try { await trips.fetchLinks(tripId.value) } catch (e) { notify.error(e.message) }
  try { await people.fetchPeople() } catch { /* select stays empty; non-critical */ }
})

async function addParticipant() {
  if (!newParticipantId.value) return
  try {
    await trips.addParticipant(tripId.value, newParticipantId.value)
    newParticipantId.value = null
  } catch (e) { notify.error(e.message) }
}

function removeParticipant(personId) {
  confirm.require({
    message: 'Remove this participant?',
    header: 'Remove participant',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Remove',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try { await trips.removeParticipant(tripId.value, personId) } catch (e) { notify.error(e.message) }
    }
  })
}

async function createLink(personId) {
  try {
    const result = await trips.createLink(tripId.value, personId)
    revealedLink.value = { personId, url: result.url }
    await trips.fetchLinks(tripId.value)
  } catch (e) { notify.error(e.message) }
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(location.origin + url)
    notify.success('Link copied')
  } catch {
    notify.error('Could not access clipboard — copy the link manually')
  }
}

async function revokeLink(linkId) {
  try { await trips.revokeLink(linkId) } catch (e) { notify.error(e.message) }
}

function linksFor(personId) {
  return trips.links.filter((l) => l.person_id === personId)
}

function activeLink(personId) {
  return linksFor(personId).some((l) => !l.revoked_at)
}
</script>

<template>
  <div>
    <SectionHeader title="People" description="Who's coming, and their personal share links.">
      <template #actions>
        <Select v-model="newParticipantId" :options="availablePeople" option-label="name" option-value="id" placeholder="Add person…" filter />
        <Button label="Add" icon="pi pi-plus" :disabled="!newParticipantId" @click="addParticipant" />
      </template>
    </SectionHeader>

    <EmptyState
      v-if="!(trips.current?.participants || []).length"
      icon="pi pi-users"
      message="No participants yet — add people so you can send them their trip link."
    />

    <div v-for="p in trips.current?.participants || []" :key="p.person_id" class="card participant-card">
      <div class="participant-row">
        <div class="participant-id">
          <span class="participant-name">{{ p.name }}</span>
          <Tag v-if="activeLink(p.person_id)" value="link active" severity="success" />
          <Tag v-else value="no link" severity="secondary" />
        </div>
        <div class="participant-actions">
          <Button label="Create link" size="small" outlined icon="pi pi-link" @click="createLink(p.person_id)" />
          <Button label="Remove" size="small" severity="danger" text @click="removeParticipant(p.person_id)" />
        </div>
      </div>

      <div v-if="revealedLink && revealedLink.personId === p.person_id" class="link-reveal">
        <p><strong>Shown only once — copy it now:</strong></p>
        <code>{{ origin + revealedLink.url }}</code>
        <Button label="Copy" size="small" icon="pi pi-copy" @click="copyLink(revealedLink.url)" />
      </div>

      <ul v-if="linksFor(p.person_id).length" class="links-list">
        <li v-for="link in linksFor(p.person_id)" :key="link.id">
          <span class="link-meta">created {{ link.created_at }}</span>
          <Tag v-if="link.revoked_at" value="revoked" severity="warn" />
          <Button v-else label="Revoke" size="small" severity="danger" text @click="revokeLink(link.id)" />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.participant-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
.participant-id { display: flex; align-items: center; gap: 0.5rem; }
.participant-name { font-weight: 600; }
.participant-actions { display: flex; gap: 0.25rem; }
.link-reveal {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: var(--app-radius-sm);
  background: var(--app-accent-soft);
  border: 1px solid var(--app-accent);
  overflow-wrap: anywhere;
}
.link-reveal code { display: block; margin: 0.25rem 0 0.5rem; font-size: 0.8125rem; }
.links-list { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.links-list li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.link-meta { color: var(--app-text-muted); font-size: 0.8125rem; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/trip/TripPeopleView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/trip/TripPeopleView.vue web/src/views/trip/TripPeopleView.test.js
git commit -m "feat(nav): TripPeopleView — participants + share links section"
```

---

### Task 6: Settings view (basics + status + archive + clone)

**Files:**
- Create: `web/src/views/trip/TripSettingsView.vue`
- Test: `web/src/views/trip/TripSettingsView.test.js`
- Reference (will be deleted in Task 8): `web/src/views/TripArchiveView.vue`, `web/src/views/TripDetailView.vue`

**Interfaces:**
- Consumes: `useTripsStore()` (`current`, `updateTrip`, `setStatus`), `useArchiveStore()` (`snapshot`, `notes`, `photo_links`, `actuals`, `archived_at`, `error`, `fetchArchive`, `archive`, `saveArchiveMeta`, `saveActuals`, `clone`), `useDraft`/`confirmDiscard`, PrimeVue `InputText`, `Textarea`, `Button`, `InputNumber`, `useConfirm`.
- Produces: `trip-settings` child view; draft key stays `trip:${id}:basics` (unchanged from TripDetailView so existing drafts survive).

- [ ] **Step 1: Write the failing test `web/src/views/trip/TripSettingsView.test.js`**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripSettingsView from './TripSettingsView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { useArchiveStore } from '../../stores/archive.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
  })
  await router.push('/trips/t1/settings')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', description: '', origin_city: '', vibe_tags: [] }
  const archive = useArchiveStore()
  archive.fetchArchive = vi.fn().mockRejectedValue(Object.assign(new Error('not archived'), { code: 'NOT_ARCHIVED' }))
  const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips }
}

beforeEach(() => { localStorage.clear() })

describe('TripSettingsView', () => {
  it('renders basics form seeded from trip and status control', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.find('#ts-name').element.value).toBe('Goa 2026')
    expect(wrapper.text()).toContain('Confirm trip')
  })

  it('restores unsaved basics draft after remount (same key as before)', async () => {
    localStorage.setItem('tripper:draft:trip:t1:basics', JSON.stringify({ name: 'Edited name', description: '', origin_city: '', vibe_tags: '' }))
    const { wrapper } = await mountView()
    expect(wrapper.find('#ts-name').element.value).toBe('Edited name')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/trip/TripSettingsView.test.js`
Expected: FAIL — cannot resolve `./TripSettingsView.vue`.

- [ ] **Step 3: Create `web/src/views/trip/TripSettingsView.vue`**

Merges TripDetailView's basics form/status logic and TripArchiveView's archive/clone wholesale (same store calls, PrimeVue inputs):

```vue
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { useArchiveStore } from '../../stores/archive.js'
import { useDraft, confirmDiscard } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const router = useRouter()
const trips = useTripsStore()
const archiveStore = useArchiveStore()
const confirm = useConfirm()
const notify = useNotify()

const tripId = computed(() => route.params.id)

// --- Basics (draft key unchanged from the old TripDetailView) ---
const basicsDraft = useDraft(`trip:${route.params.id}:basics`, () => ({ name: '', description: '', origin_city: '', vibe_tags: '' }))
const basics = basicsDraft.draft

function loadBasics(trip) {
  if (!trip) return
  basicsDraft.load({
    name: trip.name || '',
    description: trip.description || '',
    origin_city: trip.origin_city || '',
    vibe_tags: (trip.vibe_tags || []).join(', ')
  })
}
watch(() => trips.current, loadBasics, { immediate: true })

async function saveBasics() {
  try {
    const trip = await trips.updateTrip(tripId.value, {
      name: basics.name,
      description: basics.description || null,
      origin_city: basics.origin_city || null,
      vibe_tags: basics.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean)
    })
    loadBasics(trip)
    basicsDraft.clear()
    notify.success('Trip saved')
  } catch (e) { notify.error(e.message) }
}

onBeforeRouteLeave(async () => {
  if (!basicsDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) basicsDraft.clear()
  return ok
})

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

// --- Archive / clone (ported from TripArchiveView) ---
const archiveLoading = ref(true)
const isArchived = computed(() => !!archiveStore.snapshot)
const notesDraft = ref('')
const photoLinksDraft = ref('')
const actualsDraft = ref([])
const cloneName = ref('')

function syncDraftsFromStore() {
  notesDraft.value = archiveStore.notes || ''
  photoLinksDraft.value = (archiveStore.photo_links || []).join('\n')
  const byCategory = Object.fromEntries((archiveStore.actuals || []).map((a) => [a.category, a.amount]))
  const categories = (archiveStore.snapshot?.budget?.lines || []).map((l) => l.category)
  actualsDraft.value = categories.map((category) => ({ category, amount: byCategory[category] ?? 0 }))
}

onMounted(async () => {
  try {
    await archiveStore.fetchArchive(tripId.value)
    syncDraftsFromStore()
  } catch (e) {
    if (e.code !== 'NOT_ARCHIVED') notify.error(e.message)
  } finally {
    archiveLoading.value = false
  }
})

function doArchive() {
  confirm.require({
    message: 'Archive this trip? This will lock editing and revoke all participant links.',
    header: 'Archive trip', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Archive', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await archiveStore.archive(tripId.value, { notes: notesDraft.value || null, photo_links: [] })
        syncDraftsFromStore()
        notify.success('Trip archived')
      } catch (e) { notify.error(e.message) }
    }
  })
}

async function saveMeta() {
  try {
    const photo_links = photoLinksDraft.value.split('\n').map((l) => l.trim()).filter(Boolean)
    await archiveStore.saveArchiveMeta(tripId.value, { notes: notesDraft.value || null, photo_links })
    syncDraftsFromStore()
    notify.success('Notes saved')
  } catch (e) { notify.error(e.message) }
}

async function saveActuals() {
  try {
    const actuals = actualsDraft.value.map((a) => ({ category: a.category, amount: Number(a.amount) || 0 }))
    await archiveStore.saveActuals(tripId.value, actuals)
    notify.success('Actuals saved')
  } catch (e) { notify.error(e.message) }
}

async function cloneTrip() {
  if (!cloneName.value.trim()) return
  try {
    const newId = await archiveStore.clone(tripId.value, cloneName.value.trim())
    notify.success('Trip cloned')
    router.push({ name: 'trip-overview', params: { id: newId } })
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader title="Settings" description="Trip basics, lifecycle, archive and clone." />

    <section class="card">
      <h2>Basics</h2>
      <div class="field"><label for="ts-name">Name</label><InputText id="ts-name" v-model="basics.name" fluid /></div>
      <div class="field"><label for="ts-desc">Description</label><Textarea id="ts-desc" v-model="basics.description" rows="3" fluid /></div>
      <div class="field"><label for="ts-origin">Origin city</label><InputText id="ts-origin" v-model="basics.origin_city" fluid /></div>
      <div class="field"><label for="ts-vibe">Vibe tags (comma-separated)</label><InputText id="ts-vibe" v-model="basics.vibe_tags" fluid /></div>
      <Button label="Save changes" :disabled="!basicsDraft.isDirty.value" @click="saveBasics" />
    </section>

    <section class="card">
      <h2>Status</h2>
      <p>
        Current: <Tag :value="trips.current?.status || '…'" severity="info" />
      </p>
      <p class="muted">Lifecycle: idea → planning → confirmed → active → archived. Confirming locks dates for participants; archiving (below) snapshots everything and revokes links.</p>
      <Button v-if="nextTransition" :label="nextTransition.label" outlined @click="advanceStatus" />
    </section>

    <section v-if="!archiveLoading && !isArchived" class="card">
      <h2>Archive</h2>
      <p class="muted">Archiving locks the trip, snapshots the budget/itinerary/checklists, and revokes all participant links.</p>
      <div class="field"><label for="ts-arch-notes">Notes</label><Textarea id="ts-arch-notes" v-model="notesDraft" rows="3" fluid /></div>
      <Button label="Archive trip" severity="danger" outlined icon="pi pi-box" @click="doArchive" />
    </section>

    <template v-if="isArchived">
      <section class="card">
        <h2>Archived</h2>
        <p>Archived at: {{ archiveStore.archived_at }}</p>
        <div class="field"><label for="ts-notes">Notes</label><Textarea id="ts-notes" v-model="notesDraft" rows="3" fluid /></div>
        <div class="field"><label for="ts-photos">Photo links (one per line)</label><Textarea id="ts-photos" v-model="photoLinksDraft" rows="3" fluid /></div>
        <Button label="Save notes & links" @click="saveMeta" />
      </section>

      <section class="card">
        <h2>Actuals</h2>
        <div v-for="(a, idx) in actualsDraft" :key="a.category" class="actual-row">
          <span class="actual-cat">{{ a.category }}</span>
          <span class="muted">est. {{ archiveStore.snapshot?.budget?.lines?.find((l) => l.category === a.category)?.estimate ?? 0 }}</span>
          <InputNumber v-model="actualsDraft[idx].amount" :min="0" :max-fraction-digits="2" />
        </div>
        <Button label="Save actuals" @click="saveActuals" />
      </section>

      <section class="card">
        <h2>Snapshot</h2>
        <p>Itinerary days: {{ archiveStore.snapshot?.itinerary?.length ?? 0 }}</p>
        <p>Checklists: {{ archiveStore.snapshot?.checklists?.length ?? 0 }}</p>
        <p>Budget total at archive time: {{ archiveStore.snapshot?.budget?.total ?? 0 }}</p>
      </section>
    </template>

    <section class="card">
      <h2>Clone as new trip</h2>
      <p class="muted">Copies vibe, origin city, currency, goals, participants (unconfirmed), budget lines, and checklists — without dates, destination, or itinerary.</p>
      <div class="field"><label for="ts-clone">Name for the new trip</label><InputText id="ts-clone" v-model="cloneName" fluid /></div>
      <Button label="Clone trip" icon="pi pi-clone" :disabled="!cloneName.trim()" @click="cloneTrip" />
    </section>
  </div>
</template>

<style scoped>
.muted { color: var(--app-text-muted); font-size: 0.875rem; }
.actual-row { display: flex; align-items: center; gap: 1rem; padding: 0.375rem 0; }
.actual-cat { min-width: 8rem; font-weight: 500; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/trip/TripSettingsView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/trip/TripSettingsView.vue web/src/views/trip/TripSettingsView.test.js
git commit -m "feat(nav): TripSettingsView — basics, status, archive, clone in one home"
```

---

### Task 7: Overview dashboard view

**Files:**
- Create: `web/src/views/trip/TripOverviewView.vue`
- Test: `web/src/views/trip/TripOverviewView.test.js`

**Interfaces:**
- Consumes: `useTripsStore().current`, `useReadinessStore().data` (loaded by TripLayout; the view also calls `readiness.fetch` if data is for another trip), `useBudgetStore()` (`fetchBudget`, `total`), `nextActions`/`readinessPercent` from `tripNav.js`, `SectionHeader`.
- Produces: `trip-overview` default child view. Status stepper element classes: `.status-step`, `.status-step-done`, `.status-step-current`.

- [ ] **Step 1: Write the failing test `web/src/views/trip/TripOverviewView.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripOverviewView from './TripOverviewView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { useBudgetStore } from '../../stores/budget.js'

const SECTIONS = ['trip-dates', 'trip-destination', 'trip-budget', 'trip-itinerary', 'trip-people', 'trip-checklists', 'trip-readiness']

async function mountView({ readiness }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
      ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: ['beach'], participants: [{ person_id: 'p1', name: 'Asha' }] }
  const r = useReadinessStore()
  r.data = readiness
  r.fetch = vi.fn().mockResolvedValue()
  const budget = useBudgetStore()
  budget.fetchBudget = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper }
}

describe('TripOverviewView', () => {
  it('shows hero, status stepper, stat cards, and next actions', async () => {
    const { wrapper } = await mountView({
      readiness: {
        trip_id: 't1',
        decisions: { dates_confirmed: 1, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
        participants: [{ profile_confirmed: 0 }],
        checklists: { total_items: 2, done_items: 1, overdue: [] }
      }
    })
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.findAll('.status-step')).toHaveLength(4)
    expect(wrapper.find('.status-step-current').text()).toBe('planning')
    expect(wrapper.text()).toContain('Decide the destination')
    expect(wrapper.text()).toContain('Readiness')
  })

  it('shows all-set message when nothing is pending', async () => {
    const { wrapper } = await mountView({
      readiness: {
        trip_id: 't1',
        decisions: { dates_confirmed: 1, destination_decided: 1, budget_drafted: 1, itinerary_days: 2 },
        participants: [{ profile_confirmed: 1 }],
        checklists: { total_items: 2, done_items: 2, overdue: [] }
      }
    })
    expect(wrapper.text()).toContain('All set')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/trip/TripOverviewView.test.js`
Expected: FAIL — cannot resolve `./TripOverviewView.vue`.

- [ ] **Step 3: Create `web/src/views/trip/TripOverviewView.vue`**

```vue
<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { useBudgetStore } from '../../stores/budget.js'
import { nextActions, readinessPercent } from '../../utils/tripNav.js'

const STATUSES = ['idea', 'planning', 'confirmed', 'active']

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()
const budget = useBudgetStore()

const trip = computed(() => trips.current)
const actions = computed(() => nextActions(readiness.data))
const percent = computed(() => readinessPercent(readiness.data))
const checklists = computed(() => readiness.data?.checklists)
const participants = computed(() => readiness.data?.participants || [])
const confirmedCount = computed(() => participants.value.filter((p) => p.profile_confirmed).length)
const dateRange = computed(() =>
  trip.value?.start_date && trip.value?.end_date ? `${trip.value.start_date} – ${trip.value.end_date}` : null
)
const statusIndex = computed(() => STATUSES.indexOf(trip.value?.status))

onMounted(async () => {
  try { await budget.fetchBudget(route.params.id) } catch { /* stat shows — */ }
  if (readiness.data?.trip_id !== route.params.id) {
    try { await readiness.fetch(route.params.id) } catch { /* layout badge already reported */ }
  }
})
</script>

<template>
  <div v-if="trip">
    <section class="card hero">
      <div class="hero-main">
        <h1>{{ trip.name }}</h1>
        <p class="hero-sub">
          <i class="pi pi-map-marker" /> {{ trip.destination || 'Destination TBD' }}
          <span class="hero-sep">·</span>
          <i class="pi pi-calendar" /> {{ dateRange || 'Dates TBD' }}
        </p>
        <div v-if="(trip.vibe_tags || []).length" class="hero-tags">
          <Tag v-for="tag in trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
      </div>
      <ol v-if="trip.status !== 'archived'" class="status-stepper" aria-label="Trip status">
        <li
          v-for="(s, i) in STATUSES"
          :key="s"
          class="status-step"
          :class="{ 'status-step-done': i < statusIndex, 'status-step-current': i === statusIndex }"
        >{{ s }}</li>
      </ol>
      <Tag v-else value="archived" severity="secondary" />
    </section>

    <div class="stat-grid">
      <RouterLink class="card stat-card" :to="{ name: 'trip-budget', params: { id: trip.id } }">
        <span class="stat-label">Budget</span>
        <span class="stat-value">{{ budget.total || '—' }}</span>
      </RouterLink>
      <RouterLink class="card stat-card" :to="{ name: 'trip-readiness', params: { id: trip.id } }">
        <span class="stat-label">Readiness</span>
        <span class="stat-value">{{ percent }}%</span>
      </RouterLink>
      <RouterLink class="card stat-card" :to="{ name: 'trip-checklists', params: { id: trip.id } }">
        <span class="stat-label">Checklist</span>
        <span class="stat-value">{{ checklists ? `${checklists.done_items}/${checklists.total_items}` : '—' }}</span>
      </RouterLink>
      <RouterLink class="card stat-card" :to="{ name: 'trip-people', params: { id: trip.id } }">
        <span class="stat-label">Profiles confirmed</span>
        <span class="stat-value">{{ participants.length ? `${confirmedCount}/${participants.length}` : '—' }}</span>
      </RouterLink>
    </div>

    <section class="card">
      <h2>Next actions</h2>
      <p v-if="!actions.length" class="all-set"><i class="pi pi-check-circle" /> All set — nothing pending. 🎉</p>
      <ul v-else class="actions-list">
        <li v-for="a in actions" :key="a.to + a.label">
          <RouterLink :to="{ name: a.to, params: { id: trip.id } }" class="action-link">
            <i class="pi pi-arrow-right" /> {{ a.label }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.hero { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
.hero h1 { margin-bottom: 0.375rem; }
.hero-sub { margin: 0; color: var(--app-text-muted); display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
.hero-sep { color: var(--app-border); }
.hero-tags { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-top: 0.625rem; }

.status-stepper { list-style: none; display: flex; gap: 0.25rem; padding: 0; margin: 0; }
.status-step {
  font-size: 0.75rem; font-weight: 600; text-transform: capitalize;
  padding: 0.25rem 0.75rem; border-radius: 999px;
  background: #f0efec; color: var(--app-text-muted);
}
.status-step-done { background: var(--app-primary-soft); color: var(--app-primary); }
.status-step-current { background: var(--app-primary); color: #fff; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1rem; margin-bottom: 1rem; }
.stat-card { display: flex; flex-direction: column; gap: 0.25rem; text-decoration: none; color: inherit; margin-bottom: 0; transition: box-shadow 0.15s ease, transform 0.15s ease; }
.stat-card:hover { box-shadow: var(--app-shadow-md); transform: translateY(-1px); }
.stat-label { font-size: 0.8125rem; font-weight: 600; color: var(--app-text-muted); }
.stat-value { font-size: 1.375rem; font-weight: 650; letter-spacing: -0.01em; }

.actions-list { list-style: none; padding: 0; margin: 0; }
.actions-list li { padding: 0.25rem 0; }
.action-link { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; font-weight: 500; }
.action-link:hover { text-decoration: underline; }
.all-set { color: var(--app-primary); font-weight: 500; display: flex; align-items: center; gap: 0.5rem; margin: 0; }
</style>
```

Note: `readiness.data?.trip_id` — the readiness API response includes `trip_id` (verify in `server/src/routes/readiness.js` while implementing; if absent, compare using a `lastTripId` field added to the readiness store instead: set `this.lastTripId = tripId` in `fetch`, and guard with `readiness.lastTripId !== route.params.id`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/trip/TripOverviewView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/trip/TripOverviewView.vue web/src/views/trip/TripOverviewView.test.js
git commit -m "feat(nav): Overview dashboard — hero, status stepper, stat cards, next actions"
```

---

### Task 8: Re-home Budget / Itinerary / Checklists / Readiness + TripLayout + router cutover + AppNav breadcrumb

This is the cutover task: nested router config, the shell, moved views, and deletion of the old ones happen together so the app never has two competing navigation schemes.

**Files:**
- Create: `web/src/layouts/TripLayout.vue`
- Test: `web/src/layouts/TripLayout.test.js`
- Move+modify: `web/src/views/TripBudgetView.vue` → `web/src/views/trip/TripBudgetView.vue`; same for `TripItineraryView.vue`, `TripChecklistsView.vue`, `TripReadinessView.vue` (+ their `.test.js` files)
- Modify: `web/src/router.js`, `web/src/components/AppNav.vue`, `web/src/App.vue`
- Delete: `web/src/views/TripDetailView.vue`, `web/src/views/TripDetailView.test.js`, `web/src/views/TripArchiveView.vue`, `web/src/components/TripTabs.vue`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces: nested route table (names in Task 2's `TRIP_SECTIONS` + `login`, `trips`, `trip-new`, `people`, `person`, `participant`); `TripLayout` fetches trip + readiness; AppNav breadcrumb.

- [ ] **Step 1: Write the failing test `web/src/layouts/TripLayout.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripLayout from './TripLayout.vue'
import { useTripsStore } from '../stores/trips.js'
import { useReadinessStore } from '../stores/readiness.js'

async function mountLayout({ fetchTrip } = {}) {
  const Stub = { template: '<div class="child-stub">child</div>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'trips', component: { template: '<div/>' } },
      {
        path: '/trips/:id',
        component: TripLayout,
        children: [
          { path: '', name: 'trip-overview', component: Stub },
          { path: 'dates', name: 'trip-dates', component: Stub },
          { path: 'destination', name: 'trip-destination', component: Stub },
          { path: 'goals', name: 'trip-goals', component: Stub },
          { path: 'people', name: 'trip-people', component: Stub },
          { path: 'budget', name: 'trip-budget', component: Stub },
          { path: 'itinerary', name: 'trip-itinerary', component: Stub },
          { path: 'checklists', name: 'trip-checklists', component: Stub },
          { path: 'readiness', name: 'trip-readiness', component: Stub },
          { path: 'settings', name: 'trip-settings', component: Stub }
        ]
      }
    ]
  })
  await router.push('/trips/t1/budget')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.fetchTrip = fetchTrip || vi.fn().mockImplementation(async () => {
    trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }
  })
  const readiness = useReadinessStore()
  readiness.fetch = vi.fn().mockImplementation(async () => {
    readiness.data = {
      decisions: { dates_confirmed: 0, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
      participants: [{ profile_confirmed: 0 }],
      checklists: { total_items: 0, done_items: 0, overdue: [] }
    }
  })
  const wrapper = mountWithBase(TripLayout, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips, readiness, router }
}

describe('TripLayout', () => {
  it('renders sidebar with all 10 sections, trip name, and the active child', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.findAll('.trip-nav-item')).toHaveLength(10)
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.find('.child-stub').exists()).toBe(true)
  })

  it('marks only the current section active', async () => {
    const { wrapper } = await mountLayout()
    const active = wrapper.findAll('.trip-nav-active')
    expect(active).toHaveLength(1)
    expect(active[0].text()).toContain('Budget')
  })

  it('shows hint badge for unconfirmed profiles', async () => {
    const { wrapper } = await mountLayout()
    const peopleItem = wrapper.findAll('.trip-nav-item').find((n) => n.text().includes('People'))
    expect(peopleItem.text()).toContain('1')
  })

  it('shows not-found panel when the trip fails to load', async () => {
    const { wrapper } = await mountLayout({ fetchTrip: vi.fn().mockRejectedValue(new Error('nope')) })
    expect(wrapper.text()).toContain('Trip not found')
    expect(wrapper.find('.child-stub').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/layouts/TripLayout.test.js`
Expected: FAIL — cannot resolve `./TripLayout.vue`.

- [ ] **Step 3: Create `web/src/layouts/TripLayout.vue`**

```vue
<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useTripsStore } from '../stores/trips.js'
import { useReadinessStore } from '../stores/readiness.js'
import { useNotify } from '../composables/useNotify.js'
import { TRIP_SECTIONS, sectionHints } from '../utils/tripNav.js'

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()
const notify = useNotify()

const loading = ref(true)
const notFound = ref(false)
const tripId = computed(() => route.params.id)

const NEXT_STATUS = {
  idea: { label: 'Start planning', target: 'planning' },
  planning: { label: 'Confirm trip', target: 'confirmed' },
  confirmed: { label: 'Activate', target: 'active' }
}
const nextTransition = computed(() => (trips.current ? NEXT_STATUS[trips.current.status] : null))
const hints = computed(() => sectionHints(readiness.data))

// Consecutive sections sharing a group label render under one group heading.
const groups = computed(() => {
  const out = []
  for (const s of TRIP_SECTIONS) {
    const label = s.group || ''
    const last = out[out.length - 1]
    if (!last || last.label !== label) out.push({ label, items: [s] })
    else last.items.push(s)
  }
  return out
})

async function refreshReadiness() {
  try { await readiness.fetch(tripId.value) } catch { /* hint badges are non-critical */ }
}

async function load() {
  loading.value = true
  notFound.value = false
  try {
    await trips.fetchTrip(tripId.value)
    await refreshReadiness()
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(tripId, load)
// Cheap refresh when moving between sections so badges reflect recent edits.
watch(() => route.name, () => { if (!loading.value && !notFound.value) refreshReadiness() })

async function advanceStatus() {
  if (!nextTransition.value) return
  try {
    await trips.setStatus(tripId.value, nextTransition.value.target)
    refreshReadiness()
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div v-if="notFound" class="page">
    <div class="card not-found">
      <i class="pi pi-compass" aria-hidden="true" />
      <h1>Trip not found</h1>
      <p>It may have been deleted, or the link is wrong.</p>
      <RouterLink to="/">Back to trips</RouterLink>
    </div>
  </div>

  <div v-else class="trip-shell">
    <aside class="trip-sidebar">
      <div class="trip-sidebar-head">
        <template v-if="trips.current">
          <span class="trip-sidebar-name">{{ trips.current.name }}</span>
          <div class="trip-sidebar-status">
            <Tag :value="trips.current.status" :severity="trips.current.status === 'archived' ? 'secondary' : 'info'" />
            <Button v-if="nextTransition" :label="nextTransition.label" size="small" outlined @click="advanceStatus" />
          </div>
        </template>
        <Skeleton v-else height="3.5rem" />
      </div>

      <nav class="trip-sidebar-nav" aria-label="Trip sections">
        <template v-for="group in groups" :key="group.label + group.items[0].name">
          <span v-if="group.label" class="trip-nav-group">{{ group.label }}</span>
          <RouterLink
            v-for="s in group.items"
            :key="s.name"
            :to="{ name: s.name, params: { id: tripId } }"
            class="trip-nav-item"
            :class="{ 'trip-nav-active': route.name === s.name }"
          >
            <i :class="s.icon" aria-hidden="true" />
            <span class="trip-nav-label">{{ s.label }}</span>
            <template v-if="hints[s.name]">
              <span v-if="hints[s.name].count" class="trip-nav-badge">{{ hints[s.name].count }}</span>
              <span v-else-if="hints[s.name].text" class="trip-nav-hint">{{ hints[s.name].text }}</span>
              <i v-else-if="hints[s.name].ok === false" class="pi pi-circle-fill trip-nav-dot" aria-label="needs attention" />
              <i v-else-if="hints[s.name].ok === true" class="pi pi-check trip-nav-ok" aria-label="done" />
            </template>
          </RouterLink>
        </template>
      </nav>
    </aside>

    <div class="trip-main">
      <div v-if="loading && !trips.current" class="card">
        <Skeleton v-for="i in 4" :key="i" height="1.75rem" style="margin-bottom: 0.625rem" />
      </div>
      <RouterView v-else />
    </div>
  </div>
</template>

<style scoped>
.trip-shell {
  display: grid;
  grid-template-columns: 15rem 1fr;
  gap: 1.5rem;
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  align-items: start;
}

.trip-sidebar {
  position: sticky;
  top: 4.5rem;
}
.trip-sidebar-head { margin-bottom: 1rem; }
.trip-sidebar-name { display: block; font-weight: 650; font-size: 1.0625rem; letter-spacing: -0.01em; margin-bottom: 0.375rem; overflow-wrap: anywhere; }
.trip-sidebar-status { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.trip-sidebar-nav { display: flex; flex-direction: column; gap: 0.125rem; }
.trip-nav-group {
  margin: 0.875rem 0 0.25rem;
  padding: 0 0.625rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.trip-nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.4375rem 0.625rem;
  border-radius: var(--app-radius-sm);
  color: var(--app-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  transition: background 0.15s ease;
}
.trip-nav-item i:first-child { color: var(--app-text-muted); font-size: 0.875rem; width: 1rem; text-align: center; }
.trip-nav-item:hover { background: #f0efec; }
.trip-nav-active { background: var(--app-primary-soft); color: var(--app-primary); }
.trip-nav-active i:first-child { color: var(--app-primary); }
.trip-nav-label { flex: 1; }
.trip-nav-badge {
  background: var(--app-accent);
  color: #fff;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 700;
  min-width: 1.125rem;
  height: 1.125rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.3125rem;
}
.trip-nav-hint { font-size: 0.75rem; font-weight: 600; color: var(--app-text-muted); }
.trip-nav-dot { font-size: 0.4375rem; color: var(--app-accent); }
.trip-nav-ok { font-size: 0.75rem; color: var(--app-primary); }

.trip-main { min-width: 0; }

.not-found { text-align: center; padding: 3rem 1.5rem; }
.not-found i { font-size: 2rem; color: var(--app-text-muted); }

/* Mobile: sidebar becomes a sticky horizontal section rail. */
@media (max-width: 767px) {
  .trip-shell { display: block; padding: 1rem 1rem 3rem; }
  .trip-sidebar { position: sticky; top: 3.25rem; z-index: 10; background: var(--app-bg); margin: 0 -1rem 1rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--app-border); }
  .trip-sidebar-head { margin-bottom: 0.5rem; }
  .trip-sidebar-nav { flex-direction: row; overflow-x: auto; gap: 0.25rem; scrollbar-width: none; }
  .trip-sidebar-nav::-webkit-scrollbar { display: none; }
  .trip-nav-group { display: none; }
  .trip-nav-item { white-space: nowrap; flex: 0 0 auto; }
}
</style>
```

- [ ] **Step 4: Run layout test**

Run: `cd web && npx vitest run src/layouts/TripLayout.test.js`
Expected: PASS.

- [ ] **Step 5: Move + re-home the four section views**

```bash
cd web/src/views
git mv TripBudgetView.vue trip/TripBudgetView.vue
git mv TripBudgetView.test.js trip/TripBudgetView.test.js
git mv TripItineraryView.vue trip/TripItineraryView.vue
git mv TripItineraryView.test.js trip/TripItineraryView.test.js
git mv TripChecklistsView.vue trip/TripChecklistsView.vue
git mv TripReadinessView.vue trip/TripReadinessView.vue
```

In each moved `.vue`/`.test.js`, fix relative imports (`'../stores/…'` → `'../../stores/…'`, `'../components/…'` → `'../../components/…'`, `'../composables/…'` → `'../../composables/…'`, `'../api/…'` → `'../../api/…'`, `'../test-utils.js'` → `'../../test-utils.js'`).

Then in each view template, replace the page shell with the section pattern:

`trip/TripBudgetView.vue` — add `import SectionHeader from '../../components/SectionHeader.vue'`; template: replace `<main class="page"><h1>{{ tripName || 'Trip' }} — Budget</h1>` with `<div><SectionHeader title="Budget" description="Category estimates, AI draft, and per-person split." />`; replace closing `</main>` with `</div>`. Delete the now-unused `tripName` ref and the `api.get` trip fetch for the name (keep the participants fetch — it feeds overrides):

```js
onMounted(async () => {
  try {
    const trip = (await api.get(`/api/trips/${tripId}`)).trip
    participants.value = trip?.participants || []
  } catch { participants.value = [] }
  try { await store.fetchBudget(tripId) } catch (e) { notify.error(e.message) } finally { loading.value = false }
})
```

Also convert the overrides `<table class="table">` to PrimeVue `DataTable`/`Column` following the exact pattern already used in `web/src/components/BudgetTable.vue` (InputNumber for amount, InputText for note, Button danger-text for remove; the "add row" select+inputs move above the table into a `.override-add` flex row using `Select` + `InputNumber` + `InputText` + `Button`).

`trip/TripItineraryView.vue` — same shell replacement: `<main class="page"><h1>…</h1>` → `<div><SectionHeader title="Itinerary" description="Day-by-day plan. Days are generated from confirmed dates." />`; remove the `trips.fetchTrip` fallback block in `onMounted` (layout guarantees `trips.current`) and the `useTripsStore` import if then unused. Replace the AI-draft preview card's inline `style="background:#f6f7f9"` with class `ai-draft-card` + scoped style `background: var(--app-primary-soft);`.

`trip/TripChecklistsView.vue` — `<main class="page"><h1>Trip Checklists</h1>` → `<div><SectionHeader title="Checklists" description="Packing lists and shared tasks, assignable to participants." />`; move the two creation forms ("New checklist", "From template") into ONE card with a horizontal form row; native `<select>`s → PrimeVue `Select` (options `[{label:'Packing',value:'packing'},{label:'Tasks',value:'tasks'}]` and `store.templates` with `option-label="name" option-value="id"`).

`trip/TripReadinessView.vue` — `<main class="page"><h1>Trip Readiness</h1>` → `<div><SectionHeader title="Readiness" description="Is everyone — and everything — actually ready?" />`; convert the participants `<table class="table">` to `DataTable`/`Column` (columns: Name, Profile, Docs, Doc warnings, Link; Tag rendering stays as today inside `#body` templates).

- [ ] **Step 6: Update the moved tests**

`trip/TripBudgetView.test.js`: routes array becomes `[{ path: '/trips/:id/budget', name: 'trip-budget', component: TripBudgetView }]` (delete the five stub routes — no more TripTabs needing them). Replace the `'shows trip name in header'` test (layout owns the trip name now):

```js
  it('shows section header', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Budget')
  })
```

`trip/TripItineraryView.test.js`: routes array becomes `[{ path: '/trips/:id/itinerary', name: 'trip-itinerary', component: TripItineraryView }]`; drop the `trips.fetchTrip` mock lines (the view no longer calls it); set `trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' }` directly.

Run: `cd web && npx vitest run src/views/trip/`
Expected: PASS.

- [ ] **Step 7: Rewrite `web/src/router.js` routes**

Keep the `beforeEach` guard and `tripper:unauthorized` listener exactly as they are; replace only the `routes` array:

```js
const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'trips', component: () => import('./views/TripsListView.vue'), meta: { auth: true } },
  { path: '/trips/new', name: 'trip-new', component: () => import('./views/TripNewView.vue'), meta: { auth: true } },
  {
    path: '/trips/:id',
    component: () => import('./layouts/TripLayout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'trip-overview', component: () => import('./views/trip/TripOverviewView.vue') },
      { path: 'dates', name: 'trip-dates', component: () => import('./views/trip/TripDatesView.vue') },
      { path: 'destination', name: 'trip-destination', component: () => import('./views/trip/TripDestinationView.vue') },
      { path: 'goals', name: 'trip-goals', component: () => import('./views/trip/TripGoalsView.vue') },
      { path: 'people', name: 'trip-people', component: () => import('./views/trip/TripPeopleView.vue') },
      { path: 'budget', name: 'trip-budget', component: () => import('./views/trip/TripBudgetView.vue') },
      { path: 'itinerary', name: 'trip-itinerary', component: () => import('./views/trip/TripItineraryView.vue') },
      { path: 'checklists', name: 'trip-checklists', component: () => import('./views/trip/TripChecklistsView.vue') },
      { path: 'readiness', name: 'trip-readiness', component: () => import('./views/trip/TripReadinessView.vue') },
      { path: 'settings', name: 'trip-settings', component: () => import('./views/trip/TripSettingsView.vue') }
    ]
  },
  { path: '/people', name: 'people', component: () => import('./views/PeopleListView.vue'), meta: { auth: true } },
  { path: '/people/:id', name: 'person', component: () => import('./views/PersonDetailView.vue'), meta: { auth: true } },
  { path: '/p/:token', name: 'participant', component: () => import('./views/ParticipantView.vue'), meta: { public: true, bare: true } }
]
```

(Keep whatever `meta` flags the current file has on `login`/`participant` — check before overwriting; `bare` is used by `App.vue`.)

- [ ] **Step 8: Grep for dangling references to deleted route names/components**

Run: `cd web && grep -rn "trip-archive\|TripDetailView\|TripArchiveView\|TripTabs\|name: 'trip'" src/`
Expected after fixes: zero hits outside this plan. Notably `TripsListView.vue` links to `{ name: 'trip', … }` — change to `{ name: 'trip-overview', … }`. `TripWizard.vue` likely `router.push`es to the trip after create — update its push to `{ name: 'trip-overview', params: { id } }` (find with `grep -n "trips/" src/components/TripWizard.vue src/views/TripNewView.vue`).

- [ ] **Step 9: Delete dead files**

```bash
git rm web/src/views/TripDetailView.vue web/src/views/TripDetailView.test.js web/src/views/TripArchiveView.vue web/src/components/TripTabs.vue
```

- [ ] **Step 10: AppNav breadcrumb rewrite**

Replace `web/src/components/AppNav.vue` entirely:

```vue
<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useAuthStore } from '../stores/auth.js'
import { useTripsStore } from '../stores/trips.js'
import { TRIP_SECTIONS } from '../utils/tripNav.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const trips = useTripsStore()

const crumbs = computed(() => {
  const name = route.name
  if (name === 'trips') return [{ label: 'Trips' }]
  if (name === 'trip-new') return [{ label: 'Trips', to: '/' }, { label: 'New trip' }]
  if (name === 'people') return [{ label: 'People' }]
  if (name === 'person') return [{ label: 'People', to: '/people' }, { label: 'Person' }]
  const section = TRIP_SECTIONS.find((s) => s.name === name)
  if (section) {
    const tripCrumb = {
      label: trips.current?.name || 'Trip',
      to: name === 'trip-overview' ? null : { name: 'trip-overview', params: { id: route.params.id } }
    }
    const out = [{ label: 'Trips', to: '/' }, tripCrumb]
    if (name !== 'trip-overview') out.push({ label: section.label })
    return out
  }
  return []
})

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="app-nav">
    <RouterLink to="/" class="app-brand"><i class="pi pi-compass" aria-hidden="true" /> Tripper</RouterLink>

    <nav class="app-crumbs" aria-label="Breadcrumb">
      <template v-for="(c, i) in crumbs" :key="i">
        <i v-if="i > 0" class="pi pi-angle-right app-crumb-sep" aria-hidden="true" />
        <RouterLink v-if="c.to" :to="c.to" class="app-crumb">{{ c.label }}</RouterLink>
        <span v-else class="app-crumb app-crumb-current">{{ c.label }}</span>
      </template>
    </nav>

    <div class="app-nav-right">
      <RouterLink to="/" class="app-nav-link" :class="{ 'app-nav-link-active': route.name === 'trips' || String(route.name).startsWith('trip') }">Trips</RouterLink>
      <RouterLink to="/people" class="app-nav-link" :class="{ 'app-nav-link-active': route.name === 'people' || route.name === 'person' }">People</RouterLink>
      <Button label="Logout" severity="secondary" text size="small" @click="onLogout" />
    </div>
  </header>
</template>

<style scoped>
.app-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
}
.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--app-primary);
  text-decoration: none;
}
.app-crumbs { display: flex; align-items: center; gap: 0.375rem; min-width: 0; flex: 1; }
.app-crumb { color: var(--app-text-muted); text-decoration: none; font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-crumb:hover { color: var(--app-text); }
.app-crumb-current { color: var(--app-text); font-weight: 600; }
.app-crumb-sep { font-size: 0.75rem; color: var(--app-border); }
.app-nav-right { display: flex; align-items: center; gap: 0.25rem; }
.app-nav-link {
  color: var(--app-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.375rem 0.625rem;
  border-radius: var(--app-radius-sm);
}
.app-nav-link:hover { background: #f5f4f1; }
.app-nav-link-active { color: var(--app-primary); font-weight: 600; }

@media (max-width: 640px) {
  .app-crumbs { display: none; }
  .app-nav { gap: 0.5rem; }
  .app-nav-right { margin-left: auto; }
}
</style>
```

- [ ] **Step 11: Full web test run + build**

Run: `npm test --workspace=web && cd web && npx vite build`
Expected: PASS + clean build. Fix any missed import path from the moves.

- [ ] **Step 12: Commit**

```bash
git add -A web/src
git commit -m "feat(nav)!: nested trip shell — TripLayout sidebar, router cutover, breadcrumb AppNav; delete TripDetailView/TripArchiveView/TripTabs"
```

---

### Task 9: Trips list redesign

**Files:**
- Modify: `web/src/views/TripsListView.vue`
- Test: `web/src/views/TripsListView.test.js` (create)

**Interfaces:**
- Consumes: `useTripsStore()` (`trips`, `fetchTrips`), route name `trip-overview`.
- Produces: `.trip-grid` / `.trip-card` markup.

- [ ] **Step 1: Write the failing test `web/src/views/TripsListView.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripsListView from './TripsListView.vue'
import { useTripsStore } from '../stores/trips.js'

describe('TripsListView', () => {
  it('renders trip cards grouped by status, linking to trip-overview', async () => {
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
        { id: 't1', name: 'Goa 2026', status: 'planning', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', participant_count: 3 },
        { id: 't2', name: 'Alps idea', status: 'idea', participant_count: 0 }
      ]
    })
    const wrapper = mountWithBase(TripsListView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.trip-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].attributes('href')).toBe('/trips/t2') // idea group first
    expect(wrapper.text()).toContain('Destination TBD')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/TripsListView.test.js`
Expected: FAIL (current markup lacks `.trip-card` grid ordering / "Destination TBD").

- [ ] **Step 3: Rewrite `web/src/views/TripsListView.vue`**

Script block: unchanged except nothing to remove. Template + style replacement:

```vue
<template>
  <main class="page page-wide">
    <div class="list-head">
      <h1>Trips</h1>
      <Button label="New trip" icon="pi pi-plus" @click="router.push('/trips/new')" />
    </div>

    <div v-if="loading" class="card">
      <Skeleton v-for="i in 3" :key="i" height="2rem" style="margin-bottom: 0.5rem" />
    </div>

    <EmptyState v-else-if="!store.trips.length" icon="pi pi-map" message="No trips yet — plan your first one." cta-label="New trip" @cta="router.push('/trips/new')" />

    <section v-for="group in grouped" :key="group.status" class="trips-group">
      <h2 class="group-title">{{ group.status }}</h2>
      <div class="trip-grid">
        <RouterLink
          v-for="trip in group.trips"
          :key="trip.id"
          :to="{ name: 'trip-overview', params: { id: trip.id } }"
          class="card trip-card"
          :class="`trip-card-${trip.status}`"
        >
          <h3>{{ trip.name }}</h3>
          <p class="trip-meta"><i class="pi pi-map-marker" /> {{ trip.destination || 'Destination TBD' }}</p>
          <p class="trip-meta"><i class="pi pi-calendar" /> {{ trip.start_date && trip.end_date ? `${trip.start_date} – ${trip.end_date}` : 'Dates TBD' }}</p>
          <p class="trip-meta"><i class="pi pi-users" /> {{ trip.participant_count }} participant{{ trip.participant_count === 1 ? '' : 's' }}</p>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page-wide { max-width: 80rem; }
.list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.list-head h1 { margin: 0; }
.trips-group { margin-top: 1.5rem; }
.group-title { text-transform: capitalize; color: var(--app-text-muted); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.trip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr)); gap: 1rem; }
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
.trip-card-active { border-left-color: #16a34a; }
.trip-card-archived { border-left-color: var(--app-border); opacity: 0.75; }
.trip-meta { margin: 0.125rem 0; color: var(--app-text-muted); font-size: 0.8438rem; display: flex; align-items: center; gap: 0.375rem; }
</style>
```

Also add `import EmptyState from '../components/EmptyState.vue'` if not present (it is), and remove the now-unused `Tag` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/TripsListView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/TripsListView.vue web/src/views/TripsListView.test.js
git commit -m "feat(ui): trips list as status-accented card grid"
```

---

### Task 10: Participant page redesign

**Files:**
- Modify: `web/src/views/ParticipantView.vue`
- Test: `web/src/views/ParticipantView.test.js` (create)

**Interfaces:**
- Consumes: `useParticipantStore()` state: `trip`, `person`, `profileConfirmed`, `documents`, `packing`, `tasks`, `error`, `load(token)`. Child components `ParticipantProfileForm`, `ParticipantDocs`, `ParticipantChecklist` (unchanged internally).
- Produces: step cards `.step-card` with `.step-done` marker.

- [ ] **Step 1: Write the failing test `web/src/views/ParticipantView.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import ParticipantView from './ParticipantView.vue'
import { useParticipantStore } from '../stores/participant.js'

async function mountView(state) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/p/:token', name: 'participant', component: ParticipantView }]
  })
  await router.push('/p/tok1')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useParticipantStore()
  store.load = vi.fn().mockImplementation(async () => Object.assign(store, state))
  const wrapper = mountWithBase(ParticipantView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper }
}

describe('ParticipantView', () => {
  it('renders trip hero and three step cards with completion state', async () => {
    const { wrapper } = await mountView({
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true,
      documents: [],
      packing: [{ id: 'i1', done: 0 }],
      tasks: []
    })
    const steps = wrapper.findAll('.step-card')
    expect(steps).toHaveLength(3)
    expect(steps[0].classes()).toContain('step-done')      // profile confirmed
    expect(steps[1].classes()).not.toContain('step-done')  // no documents
    expect(wrapper.text()).toContain('Goa 2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/ParticipantView.test.js`
Expected: FAIL (no `.step-card` in current markup).

- [ ] **Step 3: Rewrite `web/src/views/ParticipantView.vue`**

```vue
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import { useParticipantStore } from '../stores/participant.js'
import ParticipantProfileForm from '../components/ParticipantProfileForm.vue'
import ParticipantDocs from '../components/ParticipantDocs.vue'
import ParticipantChecklist from '../components/ParticipantChecklist.vue'

const route = useRoute()
const store = useParticipantStore()

const loading = ref(true)
const invalidLink = ref(false)

onMounted(async () => {
  try {
    await store.load(route.params.token)
  } catch (e) {
    if (e.status === 401) invalidLink.value = true
  } finally {
    loading.value = false
  }
})

const checklistItems = computed(() => [...store.packing, ...store.tasks])
const checklistDone = computed(() => checklistItems.value.filter((i) => i.done).length)

const steps = computed(() => [
  { key: 'profile', n: 1, title: 'Your profile', done: store.profileConfirmed, hint: store.profileConfirmed ? 'Confirmed' : 'Confirm your details' },
  { key: 'docs', n: 2, title: 'Documents', done: store.documents.length > 0, hint: store.documents.length ? `${store.documents.length} uploaded` : 'Upload passport / ID / tickets' },
  { key: 'checklist', n: 3, title: 'Checklist', done: checklistItems.value.length > 0 && checklistDone.value === checklistItems.value.length, hint: checklistItems.value.length ? `${checklistDone.value}/${checklistItems.value.length} done` : 'Nothing assigned yet' }
])

const dateRange = computed(() =>
  store.trip?.start_date && store.trip?.end_date ? `${store.trip.start_date} – ${store.trip.end_date}` : 'Dates TBD'
)
</script>

<template>
  <main class="p-page">
    <Message v-if="invalidLink" severity="warn" :closable="false">
      This link is no longer valid — ask your trip organizer for a new one
    </Message>

    <ProgressSpinner v-else-if="loading" style="width: 2.5rem; height: 2.5rem" />

    <template v-else>
      <Message v-if="store.error" severity="error" :closable="false">{{ store.error }}</Message>

      <section v-if="store.trip" class="card p-hero">
        <p v-if="store.person" class="p-greeting">Hi {{ store.person.name }} 👋 you're invited to</p>
        <h1>{{ store.trip.name }}</h1>
        <p class="p-meta">
          <i class="pi pi-map-marker" /> {{ store.trip.destination || 'Destination TBD' }}
          <span class="p-sep">·</span>
          <i class="pi pi-calendar" /> {{ dateRange }}
        </p>
        <p v-if="store.trip.description" class="p-desc">{{ store.trip.description }}</p>
        <div v-if="(store.trip.vibe_tags || []).length" class="p-tags">
          <Tag v-for="tag in store.trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
        <ul v-if="(store.trip.goals || []).length" class="p-goals">
          <li v-for="(goal, idx) in store.trip.goals" :key="idx">
            <i class="pi pi-flag" /> {{ goal.title }}
            <span v-if="goal.fixed_date"> — {{ goal.fixed_date }}</span>
            <span v-if="goal.fixed_place"> @ {{ goal.fixed_place }}</span>
          </li>
        </ul>
      </section>

      <section
        v-for="step in steps"
        :key="step.key"
        class="card step-card"
        :class="{ 'step-done': step.done }"
      >
        <header class="step-head">
          <span class="step-num" aria-hidden="true">
            <i v-if="step.done" class="pi pi-check" />
            <template v-else>{{ step.n }}</template>
          </span>
          <div>
            <h2>{{ step.title }}</h2>
            <p class="step-hint">{{ step.hint }}</p>
          </div>
        </header>
        <ParticipantProfileForm v-if="step.key === 'profile'" />
        <ParticipantDocs v-else-if="step.key === 'docs'" />
        <ParticipantChecklist v-else />
      </section>
    </template>
  </main>
</template>

<style scoped>
.p-page { max-width: 30rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
.p-hero h1 { margin: 0 0 0.375rem; }
.p-greeting { margin: 0 0 0.25rem; color: var(--app-text-muted); font-size: 0.875rem; }
.p-meta { margin: 0; color: var(--app-text-muted); display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
.p-sep { color: var(--app-border); }
.p-desc { margin: 0.625rem 0 0; }
.p-tags { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.625rem; }
.p-goals { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.p-goals li { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.125rem 0; font-size: 0.875rem; }
.p-goals i { color: var(--app-primary); font-size: 0.75rem; }

.step-head { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; }
.step-head h2 { margin: 0; }
.step-hint { margin: 0.125rem 0 0; color: var(--app-text-muted); font-size: 0.8125rem; }
.step-num {
  flex: 0 0 auto;
  width: 1.75rem; height: 1.75rem;
  border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #f0efec; color: var(--app-text-muted);
  font-weight: 700; font-size: 0.875rem;
}
.step-done .step-num { background: var(--app-primary); color: #fff; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/ParticipantView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/ParticipantView.vue web/src/views/ParticipantView.test.js
git commit -m "feat(ui): participant page — mobile-first hero + 3-step progress cards"
```

---

### Task 11: Wizard + People pages shell consistency

**Files:**
- Modify: `web/src/components/TripWizard.vue` (post-create navigation + header pattern), `web/src/views/PeopleListView.vue`, `web/src/views/PersonDetailView.vue` (light-touch: page header pattern only)

**Interfaces:**
- Consumes: `SectionHeader` where a view header exists; route name `trip-overview`.

- [ ] **Step 1: Update post-create navigation in `TripWizard.vue`**

Find the `router.push` after trip creation (`grep -n "router.push" web/src/components/TripWizard.vue`) and ensure it targets `{ name: 'trip-overview', params: { id: <createdId> } }` (done in Task 8 Step 8 if caught by grep — verify here).

- [ ] **Step 2: PeopleListView/PersonDetailView headers**

In both views, replace the bare `<h1>…</h1>` + action button rows with this exact flex pattern (h1 left, primary action right), adding the scoped style if the view lacks it:

```html
<div class="list-head">
  <h1>People</h1>
  <Button label="New person" icon="pi pi-plus" @click="…existing handler…" />
</div>
```

```css
.list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.list-head h1 { margin: 0; }
```

No functional changes. Keep tests green: `cd web && npx vitest run src/views/PeopleListView.test.js`.

- [ ] **Step 3: Full test run**

Run: `npm test --workspace=web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/TripWizard.vue web/src/views/PeopleListView.vue web/src/views/PersonDetailView.vue
git commit -m "refactor(ui): wizard + people pages adopt shared header pattern"
```

---

### Task 12: Legacy CSS purge

**Files:**
- Modify: `web/src/assets/main.css`, any component still using `.btn` / `.table` / `.badge`

- [ ] **Step 1: Find remaining users**

Run: `cd web && grep -rln "class=\"btn\|class=\"table\|badge\b" src/ --include='*.vue'`
For each hit (expected: `DayCard.vue`, possibly `ChecklistCard.vue`, `DocumentList.vue`, itinerary AI preview): convert `.btn`/`.btn-primary` buttons to PrimeVue `Button` (size="small" where inline), `.badge*` spans to `Tag` (`severity="warn"` for `badge-warn`, `severity="success"` for `badge-ok`, `severity="secondary"` for plain), `.table` to `DataTable` **only if trivial**; otherwise keep `.table` and do NOT delete its CSS.

- [ ] **Step 2: Delete now-unused CSS blocks**

Remove `.btn*` and `.badge*` blocks from `main.css` once grep shows zero usages. Keep `.field`, `.card`, `.page`, and `.table` (+ its responsive block) if still used.

- [ ] **Step 3: Verify**

Run: `npm test --workspace=web && cd web && npx vite build && grep -rn "class=\"btn" src/ | wc -l`
Expected: tests pass, build clean, grep prints 0.

- [ ] **Step 4: Commit**

```bash
git add -A web/src
git commit -m "refactor(ui): purge legacy .btn/.badge utilities — PrimeVue everywhere"
```

---

### Task 13: Process rules in AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Append a `## UI process rules` section**

```markdown
## UI process rules

1. **No bare routes.** Every new authenticated view renders inside a shared
   layout (`TripLayout` for trip sections, the AppNav shell otherwise) with
   persistent navigation and a visible way back (sidebar/breadcrumb). Only
   `/login` and `/p/:token` are bare. Adding a trip section = adding a child
   route under `/trips/:id` + an entry in `web/src/utils/tripNav.js`. Never
   a flat top-level route.
2. **Tests passing ≠ done.** A UI change is complete only after the golden
   path is click-driven in a real browser (playwright-core + the cached
   chromium headless shell; plain `chrome --headless --screenshot` hangs on
   Vite's HMR socket) and the screenshots have actually been looked at:
   every section reachable from every other, no blank frames, no console
   errors. See `e2e/ui-walk.mjs`.
3. **IA before features.** New feature waves start with a navigation/IA
   design pass (brainstorm → spec), not with per-ticket view additions.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: UI process rules — no bare routes, browser-verified done, IA-first"
```

---

### Task 14: Browser click-through gate (`e2e/ui-walk.mjs`) + screenshot review

**Files:**
- Create: `e2e/ui-walk.mjs`

**Interfaces:**
- Consumes: running dev servers (server `PORT=3100`, web on 5173 with `API_PROXY=http://localhost:3100`), seeded organizer `demo@example.com` / `demo-pass-123` (seed from `server/`: `cd server && node scripts/seed-organizer.js --email=demo@example.com --name="Demo Organizer" --password=demo-pass-123` — run from `server/` so it hits the same `data/` DB as the dev server).
- Produces: screenshots in `e2e/shots/` (gitignored) — one per screen; exit 1 on any console error, failed navigation, or missing element.

- [ ] **Step 1: Add `e2e/shots/` to `.gitignore`**

```
e2e/shots/
```

- [ ] **Step 2: Create `e2e/ui-walk.mjs`**

```js
// UI click-through gate: drives the real app through every trip section via
// the sidebar, breadcrumb back, and the participant page at mobile width.
// Requires: dev servers up (server PORT=3100, web 5173→API_PROXY=3100),
// organizer demo@example.com / demo-pass-123 seeded.
// Run: node e2e/ui-walk.mjs   (install playwright-core next to this file or
// globally; browser binary comes from the playwright cache)
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots')
mkdirSync(shots, { recursive: true })

// Latest cached chromium headless shell (adjust the version dir if the cache moves on)
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
const exe = path.join(cache, 'chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell')

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const consoleErrors = []
let failures = 0

function ok(name) { console.log(`ok - ${name}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }

const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

async function shot(name) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true })
}

// 1. Login
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await shot('01-login')
await page.getByLabel(/email/i).fill('demo@example.com')
await page.getByLabel(/password/i).fill('demo-pass-123')
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForURL(`${BASE}/`)
await shot('02-trips')
ok('login')

// 2. Create a trip through the wizard (minimal path)
await page.getByRole('button', { name: /new trip/i }).first().click()
await page.waitForURL(/trips\/new/)
await page.locator('input[type="text"], input:not([type])').first().fill(`UI Walk ${Date.now()}`)
// advance through wizard steps until it lands on the trip shell
for (let i = 0; i < 6 && !/\/trips\/(?!new)[\w-]+/.test(page.url()); i++) {
  const btn = page.getByRole('button', { name: /next|create|finish|skip/i }).first()
  if (!(await btn.count())) break
  await btn.click()
  await page.waitForLoadState('networkidle')
}
if (!/\/trips\/(?!new)[\w-]+/.test(page.url())) fail('wizard', `stuck at ${page.url()}`)
else ok('wizard → trip shell')
await shot('03-overview')

// 3. Walk every sidebar section
const SECTIONS = ['Overview', 'Dates', 'Destination', 'Goals', 'People', 'Budget', 'Itinerary', 'Checklists', 'Readiness', 'Settings']
for (const label of SECTIONS) {
  const link = page.locator('.trip-nav-item', { hasText: label }).first()
  if (!(await link.count())) { fail(`sidebar:${label}`, 'nav item missing'); continue }
  await link.click()
  await page.waitForLoadState('networkidle')
  const active = await page.locator('.trip-nav-active').textContent()
  if (!active?.includes(label)) fail(`sidebar:${label}`, `active is "${active?.trim()}"`)
  else ok(`section ${label}`)
  await shot(`04-section-${label.toLowerCase()}`)
}

// 4. Breadcrumb back to Trips
await page.locator('.app-crumb', { hasText: 'Trips' }).first().click()
await page.waitForURL(`${BASE}/`)
ok('breadcrumb → trips')
await shot('05-back-to-trips')

// 5. Participant page at mobile width (create link via People section of first trip)
await page.locator('.trip-card').first().click()
await page.waitForLoadState('networkidle')
await page.locator('.trip-nav-item', { hasText: 'People' }).first().click()
await page.waitForLoadState('networkidle')
let participantUrl = null
if (await page.locator('.participant-card').count()) {
  await page.getByRole('button', { name: /create link/i }).first().click()
  await page.waitForLoadState('networkidle')
  const code = await page.locator('.link-reveal code').textContent().catch(() => null)
  participantUrl = code?.trim() || null
}
if (participantUrl) {
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } })
  mobile.on('pageerror', (e) => consoleErrors.push(`participant pageerror: ${e.message}`))
  await mobile.goto(participantUrl, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: path.join(shots, '06-participant-mobile.png'), fullPage: true })
  const stepCount = await mobile.locator('.step-card').count()
  if (stepCount !== 3) fail('participant', `expected 3 step cards, got ${stepCount}`)
  else ok('participant mobile')
  await mobile.close()
} else {
  console.log('skip - participant page (no participants on first trip; add one to cover this)')
}

await browser.close()

const realErrors = consoleErrors.filter((e) => !/favicon|sourcemap/i.test(e))
if (realErrors.length) { failures++; console.error('CONSOLE ERRORS:\n' + realErrors.join('\n')) }
if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nUI WALK OK — now LOOK at e2e/shots/*.png before calling this done.')
```

- [ ] **Step 3: Run the gate**

Start servers (`PORT=3100 npm run dev --workspace=server`, `API_PROXY=http://localhost:3100 npm run dev --workspace=web`), seed organizer from `server/`, ensure `playwright-core` is resolvable (`npm i --no-save playwright-core` at repo root if needed), then:

Run: `node e2e/ui-walk.mjs`
Expected: `UI WALK OK`, screenshots in `e2e/shots/`.

- [ ] **Step 4: LOOK at every screenshot**

Read each `e2e/shots/*.png` with the Read tool. Check: sidebar present on every section, correct active item, teal theme everywhere (no leftover green/blue), no blank frames, no overlapping/clipped layout, participant page readable at 375px. Fix anything off and re-run. **This visual pass is the completion gate.**

- [ ] **Step 5: Run remaining verifications**

Run: `node e2e/smoke.mjs && npm test --workspace=web`
Expected: `SMOKE OK` + all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add e2e/ui-walk.mjs .gitignore
git commit -m "test(e2e): UI click-through gate — sidebar walk, breadcrumb, participant mobile"
```
