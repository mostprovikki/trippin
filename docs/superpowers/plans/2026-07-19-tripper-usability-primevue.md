# Tripper Usability & PrimeVue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **MULTI-SESSION:** Multiple agents from *different Claude sessions* may execute this plan concurrently. You MUST follow §Coordination Protocol below and the repo's `AGENTS.md` contract before touching any file.

**Goal:** In-progress draft persistence (localStorage + URL), consistent feedback (toasts/confirm dialogs), graceful 401, wizard validation, loading/empty states, and UI polish — via PrimeVue 4, not hand-rolled components.

**Architecture:** One custom composable (`useDraft`) provides hybrid persistence; PrimeVue supplies all UI primitives (ToastService, ConfirmationService, Stepper, Skeleton, Tag, Menubar, form controls). Incremental adoption — existing `.btn`/`.card`/`.field` CSS keeps working beside PrimeVue.

**Tech Stack:** Vue 3.5 SFC (`<script setup>`, plain JS), Pinia 3, vue-router 4, PrimeVue 4 (Aura preset) + primeicons, Vitest 3 + happy-dom + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-07-19-tripper-usability-state-design.md` (rev 2).

## Global Constraints

- New deps (web workspace only): `primevue@^4.3.0`, `@primevue/themes@^4.3.0`, `primeicons@^7.0.0`. Installed ONCE by U1. No other task installs anything.
- Install command (repo root): `npm install primevue@^4.3.0 @primevue/themes@^4.3.0 primeicons@^7.0.0 --workspace=web`
- Draft key namespace, verbatim: `tripper:draft:<flow>[:<id>]` — e.g. `tripper:draft:trip-new`, `tripper:draft:person-new`, `tripper:draft:person:<id>:edit`, `tripper:draft:trip:<id>:basics`, `tripper:draft:trip:<id>:budget-lines`, `tripper:draft:trip:<id>:budget-overrides`, `tripper:draft:trip:<id>:itinerary-ai`.
- 401 event name, verbatim: `tripper:unauthorized` (CustomEvent, `detail: { path }`).
- Debounce for localStorage writes: 400ms.
- Toast lifetimes: success 3000ms, error 6000ms.
- PrimeVue theme: Aura preset, `darkModeSelector: 'none'` (app is light-only; `color-scheme: light` in main.css).
- Native `<input type="date">` stays (NOT PrimeVue DatePicker) — drafts must be JSON-serializable strings; DatePicker models Date objects. Deliberate spec deviation.
- Existing suites must stay green: 82 server + 81 web tests, `node e2e/smoke.mjs` → `SMOKE OK`.
- Scoped test runs during waves: `npm test --workspace=web -- <your test file paths>`. Full suite/build only in U1 and U14.
- Commit messages: `<type>(U<N>): <summary>` e.g. `feat(U6): wizard stepper + draft persistence`.

---

## Coordination Protocol (multi-agent, multi-session)

The filesystem + git is the ONLY shared medium between sessions. The repo's `AGENTS.md` contract applies in full; this section specializes it for this plan.

### Claims

Before ANY work on task U\<N\>, atomically create `.agent-coordination/claims/U<N>.claim`:

```bash
(set -o noclobber; cat > .agent-coordination/claims/U6.claim <<EOF
task: U6
agent: u6-wizard-$(openssl rand -hex 3)
session: unknown
started: $(date -u +%FT%TZ)
status: in_progress
files:
  - web/src/components/TripWizard.vue
  - web/src/components/TripWizard.test.js
  - web/src/views/TripNewView.vue
EOF
) || { echo "U6 already claimed"; cat .agent-coordination/claims/U6.claim; }
```

If creation fails: read the claim. `status: in_progress` + `started` < 30 min ago (or a matching commit exists in `git log --oneline -20`) → task taken, pick another. Stale (>30 min, no commit) → take over per AGENTS.md §6 (append `takeover:` line, check `git log` + run scoped tests first).

When done: set `status: done` in your claim file and include the claim file in your final commit.

### Wave gates

Tasks are grouped in waves. **Do not start a wave-N task until every wave-(N−1) claim exists with `status: done` AND its final commit is in `git log`.** Check:

```bash
grep -L 'status: done' .agent-coordination/claims/U*.claim   # empty output for prior waves = gate open
git log --oneline -30                                        # confirm prior-wave commits present
```

If a prior-wave claim is missing entirely, that task hasn't started — the gate is CLOSED. Either claim that task yourself or wait. Never skip a gate.

### File ownership map (authoritative for this phase)

| Task | Wave | Owns (create/modify) |
|------|------|----------------------|
| U1 | 0 | `AGENTS.md`, `web/package.json`, root `package-lock.json` (via npm only), `web/src/main.js`, `web/src/App.vue`, `web/src/test-utils.js`, `web/src/test-utils.test.js` |
| U2 | 1 | `web/src/composables/useDraft.js`, `web/src/composables/useDraft.test.js` |
| U3 | 1 | `web/src/composables/useNotify.js`, `web/src/composables/useNotify.test.js` |
| U4 | 1 | `web/src/api/client.js`, `web/src/api/client.test.js`, `web/src/router.js`, `web/src/views/LoginView.vue`, `web/src/views/LoginView.test.js` |
| U5 | 1 | `web/src/components/EmptyState.vue`, `web/src/components/EmptyState.test.js` |
| U6 | 2 | `web/src/components/TripWizard.vue`, `web/src/components/TripWizard.test.js`, `web/src/views/TripNewView.vue` |
| U7 | 2 | `web/src/views/PeopleListView.vue`, `web/src/components/PersonForm.vue`, `web/src/views/PersonDetailView.vue`, `web/src/views/PeopleListView.test.js` |
| U8 | 2 | `web/src/views/TripDetailView.vue`, `web/src/views/TripDetailView.test.js` |
| U9 | 2 | `web/src/views/TripBudgetView.vue`, `web/src/views/TripBudgetView.test.js` |
| U10 | 2 | `web/src/views/TripItineraryView.vue`, `web/src/views/TripItineraryView.test.js` |
| U11 | 2 | `web/src/components/DestinationPanel.vue`, `web/src/components/DocumentList.vue`, `web/src/components/ParticipantDocs.vue`, `web/src/components/GoalsEditor.vue`, `web/src/views/TripArchiveView.vue`, `web/src/no-raw-confirm.test.js` |
| U12 | 2 | `web/src/views/TripsListView.vue` |
| U13 | 3 | `web/src/components/AppNav.vue` |
| U14 | 3 (serial, last) | `web/src/assets/main.css`, `.agent-coordination/NOTES.md`, any file needing integration fixes (U14 runs ALONE — verify all other claims `done` first) |

Rules: touch ONLY your task's files. Cross-boundary need → append to `.agent-coordination/NOTES.md` (timestamp + agent id + paragraph), don't reach across. `git add` only your own paths, never `-A`/`.`. Commit per green checkpoint. If an orchestrator note in NOTES.md says it holds commits, leave files written + scoped tests green, don't commit.

### Wave dependency graph

```
Wave 0: U1 (serial — foundation, frozen-file amendments)
Wave 1: U2 U3 U4 U5           (parallel ×4; need U1's plugins + test helper)
Wave 2: U6 U7 U8 U9 U10 U11 U12  (parallel ×7; need U2/U3/U5 APIs)
Wave 3: U13, then U14 serial & alone (integration gate)
```

### Cross-task interfaces (the contract — do NOT read other wave-2 files mid-wave, they may be half-written)

- `mountWithBase(component, options?)` from `web/src/test-utils.js` (U1) — `@vue/test-utils` mount with Pinia + PrimeVue + ToastService + ConfirmationService preinstalled. Accepts `options.pinia` to supply a pre-made pinia — REQUIRED when a view's `onMounted` calls store methods you need stubbed: `const pinia = createPinia(); setActivePinia(pinia); useXStore().fetchX = vi.fn()…; mountWithBase(View, { pinia, global: { plugins: [router] } })`. Stubs set after `mount()` are too late.
- `useDraft(key, factory, { urlFields?, router?, route?, debounceMs? })` → `{ draft, isDirty, clear(), load(values), teardown() }` and `confirmDiscard(confirm, message?)` → `Promise<boolean>` from `web/src/composables/useDraft.js` (U2).
- `useNotify()` → `{ success(detail, summary?), error(detail, summary?) }` from `web/src/composables/useNotify.js` (U3).
- `window` CustomEvent `tripper:unauthorized` with `detail.path`; `/login?redirect=<path>` honored by LoginView (U4).
- `<EmptyState :icon :message :cta-label @cta>` from `web/src/components/EmptyState.vue` (U5).
- URL contract between U6→U7: wizard links to `/people?new=1&return=%2Ftrips%2Fnew%3Fstep%3D4`; PeopleListView opens create form when `query.new === '1'` and on successful create navigates to `query.return` (must start with `/`).

### Context-blowup defense (AGENTS.md §7)

Read ONLY your task section + the Interfaces block above. Write one file → run its scoped test → commit checkpoint → next file. Prefer targeted edits over re-emitting files. If context dies mid-task: leave committed work, append `partial:` note to your claim + NOTES.md.

---

## Wave 0

### Task U1: Coordination amendments + PrimeVue foundation

**Files:**
- Modify: `AGENTS.md`, `web/package.json` (+ root `package-lock.json` via npm), `web/src/main.js`, `web/src/App.vue`
- Create: `web/src/test-utils.js`, `web/src/test-utils.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: PrimeVue plugin + ToastService + ConfirmationService registered app-wide; `<Toast />` + `<ConfirmDialog />` mounted in App.vue; `mountWithBase(component, options?)` test helper.

- [ ] **Step 1: Claim U1** (protocol above). Verify no orchestrator hold in `.agent-coordination/NOTES.md`.

- [ ] **Step 2: Install deps**

```bash
npm install primevue@^4.3.0 @primevue/themes@^4.3.0 primeicons@^7.0.0 --workspace=web
```

Expected: `web/package.json` dependencies gain the three packages; root `package-lock.json` updated.

- [ ] **Step 3: Write failing test for the mount helper** — `web/src/test-utils.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mountWithBase } from './test-utils.js'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const Probe = {
  template: '<div>ok</div>',
  setup() {
    // throws if ToastService / ConfirmationService are not installed
    useToast()
    useConfirm()
  }
}

describe('mountWithBase', () => {
  it('provides pinia + primevue toast + confirm services', () => {
    const wrapper = mountWithBase(Probe)
    expect(wrapper.text()).toBe('ok')
  })
})
```

- [ ] **Step 4: Run it — must fail** (`test-utils.js` missing):

```bash
npm test --workspace=web -- src/test-utils.test.js
```

Expected: FAIL — cannot resolve `./test-utils.js`.

- [ ] **Step 5: Create `web/src/test-utils.js`:**

```js
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

// Standard mount for component tests: Pinia + PrimeVue + its services.
// Pass extra plugins (e.g. a router) via options.global.plugins.
// Pass options.pinia to supply a pre-made pinia (setActivePinia(pinia) first,
// then stub store methods BEFORE mount — onMounted hooks fire during mount).
export function mountWithBase(component, options = {}) {
  const { global: g = {}, pinia, ...rest } = options
  return mount(component, {
    ...rest,
    global: {
      ...g,
      plugins: [pinia || createPinia(), PrimeVue, ToastService, ConfirmationService, ...(g.plugins || [])]
    }
  })
}
```

- [ ] **Step 6: Re-run — must pass.** Same command. Expected: PASS.

- [ ] **Step 7: Register plugins in `web/src/main.js`** — replace entire file:

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import App from './App.vue'
import { router } from './router.js'
import './assets/main.css'
import 'primeicons/primeicons.css'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: 'none' } } })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#app')
```

- [ ] **Step 8: Mount host components in `web/src/App.vue`** — replace entire file:

```vue
<template>
  <Toast position="top-right" />
  <ConfirmDialog />
  <AppNav v-if="!route.meta.bare && auth.organizer" />
  <RouterView />
</template>

<script setup>
import { useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useAuthStore } from './stores/auth.js'
import AppNav from './components/AppNav.vue'

const route = useRoute()
const auth = useAuthStore()
</script>
```

- [ ] **Step 9: Full verification** (allowed in wave 0 — you're alone):

```bash
npm test --workspace=web && npm test --workspace=server && npm run build --workspace=web
```

Expected: 81+ web pass (82 with new helper test), 82 server pass, build clean.

- [ ] **Step 10: Amend `AGENTS.md`** — append at end of file:

```markdown

## 9. Phase-2 amendments (usability/PrimeVue — 2026-07-19)

- Active plan: `docs/superpowers/plans/2026-07-19-tripper-usability-primevue.md` (tasks U1–U14, waves 0–3). Its File Ownership Map is authoritative for this phase.
- §2 frozen list AMENDED: `web/src/main.js`, `web/src/App.vue`, `web/src/api/client.js`, `web/src/router.js`, `web/src/assets/main.css`, `web/package.json` are task-owned per that map. Root `package.json`/`package-lock.json`: hands-off except U1's single `npm install --workspace=web`.
- Claims use `U<N>.claim`. Wave gate: do not start a wave-N task until every wave-(N−1) claim is `status: done` and its final commit exists.
- Everything else in this contract unchanged.
```

- [ ] **Step 11: Announce + commit + release**

Append to `.agent-coordination/NOTES.md`: timestamp · agent id · "U1 done: PrimeVue foundation committed, wave 1 (U2–U5) open."

```bash
git add AGENTS.md web/package.json package-lock.json web/src/main.js web/src/App.vue web/src/test-utils.js web/src/test-utils.test.js .agent-coordination/NOTES.md .agent-coordination/claims/U1.claim
git commit -m "feat(U1): PrimeVue foundation + test helper + phase-2 coordination amendments"
```

(Set `status: done` in the claim before staging.)

---

## Wave 1

### Task U2: `useDraft` composable

**Files:**
- Create: `web/src/composables/useDraft.js`, `web/src/composables/useDraft.test.js`

**Interfaces:**
- Consumes: nothing (framework-only; do NOT import PrimeVue here except none — `confirmDiscard` takes the confirm service as an argument).
- Produces:
  - `useDraft(key, factory, { urlFields = [], router = null, route = null, debounceMs = 400 })` → `{ draft, isDirty, clear(), load(values), teardown() }`
    - `draft`: reactive object seeded `factory()` ← localStorage overlay ← URL-query overlay (URL wins for `urlFields`; numbers coerced from the factory's field type).
    - `isDirty`: ref\<boolean\>, true when bulk (non-URL) fields differ from baseline. A restored localStorage draft IS dirty (baseline = pristine `factory()`).
    - `clear()`: cancel pending write, remove localStorage key, strip `urlFields` from query via `router.replace`, baseline := current draft, `isDirty` false.
    - `load(values)`: merge server-loaded values into baseline; if not dirty, also into `draft`. For async-loaded entities.
    - `teardown()`: remove `beforeunload` listener + cancel timer (auto-called via `onBeforeUnmount` when inside a component).
  - `confirmDiscard(confirm, message?)` → `Promise<boolean>` — PrimeVue ConfirmationService wrapper for `onBeforeRouteLeave`.

- [ ] **Step 1: Claim U2** (verify wave-0 gate: `U1.claim` has `status: done`, commit present).

- [ ] **Step 2: Write failing tests** — `web/src/composables/useDraft.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDraft } from './useDraft.js'

const factory = () => ({ step: 1, name: '', tags: '' })

function fakeRouterRoute(query = {}) {
  const route = { query: { ...query } }
  const router = { replace: vi.fn(({ query: q }) => { route.query = q }) }
  return { router, route }
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useDraft', () => {
  it('hydrates factory < localStorage < URL (URL wins for urlFields)', () => {
    localStorage.setItem('tripper:draft:t', JSON.stringify({ name: 'stored', tags: 'a' }))
    const { router, route } = fakeRouterRoute({ step: '3' })
    const d = useDraft('t', factory, { urlFields: ['step'], router, route })
    expect(d.draft.name).toBe('stored')
    expect(d.draft.tags).toBe('a')
    expect(d.draft.step).toBe(3) // coerced number
    d.teardown()
  })

  it('a restored stored draft counts as dirty', () => {
    localStorage.setItem('tripper:draft:t', JSON.stringify({ name: 'stored', tags: '' }))
    const d = useDraft('t', factory)
    expect(d.isDirty.value).toBe(true)
    d.teardown()
  })

  it('debounce-writes bulk fields, mirrors urlFields to query', async () => {
    const { router, route } = fakeRouterRoute()
    const d = useDraft('t', factory, { urlFields: ['step'], router, route })
    d.draft.name = 'hello'
    d.draft.step = 2
    await vi.advanceTimersByTimeAsync(500)
    const stored = JSON.parse(localStorage.getItem('tripper:draft:t'))
    expect(stored.name).toBe('hello')
    expect(stored.step).toBeUndefined() // urlFields never go to storage
    expect(route.query.step).toBe('2')
    expect(router.replace).toHaveBeenCalled()
    d.teardown()
  })

  it('keys are id-scoped — no cross-entity bleed', () => {
    localStorage.setItem('tripper:draft:trip:1:basics', JSON.stringify({ name: 'trip1' }))
    const d = useDraft('trip:2:basics', () => ({ name: '' }))
    expect(d.draft.name).toBe('')
    d.teardown()
  })

  it('isDirty transitions and clear() resets + removes key + strips query', async () => {
    const { router, route } = fakeRouterRoute({ step: '1', other: 'x' })
    const d = useDraft('t', factory, { urlFields: ['step'], router, route })
    expect(d.isDirty.value).toBe(false)
    d.draft.name = 'x'
    await vi.advanceTimersByTimeAsync(500)
    expect(d.isDirty.value).toBe(true)
    expect(localStorage.getItem('tripper:draft:t')).not.toBeNull()
    d.clear()
    expect(d.isDirty.value).toBe(false)
    expect(localStorage.getItem('tripper:draft:t')).toBeNull()
    expect(route.query.step).toBeUndefined()
    expect(route.query.other).toBe('x') // untouched
    d.teardown()
  })

  it('load(): adopts server values when clean, keeps user draft when dirty', () => {
    const d = useDraft('t', factory)
    d.load({ name: 'server' })
    expect(d.draft.name).toBe('server')
    expect(d.isDirty.value).toBe(false)

    localStorage.clear()
    const d2 = useDraft('t2', factory)
    d2.draft.name = 'mine' // dirty
    d2.load({ name: 'server' })
    expect(d2.draft.name).toBe('mine')
    expect(d2.isDirty.value).toBe(true)
    d.teardown(); d2.teardown()
  })
})
```

- [ ] **Step 3: Run — must fail** (module missing):

```bash
npm test --workspace=web -- src/composables/useDraft.test.js
```

- [ ] **Step 4: Implement `web/src/composables/useDraft.js`:**

```js
import { reactive, ref, watch, onBeforeUnmount, getCurrentInstance } from 'vue'

const PREFIX = 'tripper:draft:'

function bulkSnapshot(obj, urlFields) {
  const out = {}
  for (const k of Object.keys(obj)) if (!urlFields.includes(k)) out[k] = obj[k]
  return out
}

export function useDraft(key, factory, { urlFields = [], router = null, route = null, debounceMs = 400 } = {}) {
  const storageKey = PREFIX + key
  const base = factory()

  let stored = null
  try { stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') } catch { stored = null }

  const initial = { ...base, ...(stored || {}) }
  if (route) {
    for (const f of urlFields) {
      if (route.query[f] !== undefined) {
        initial[f] = typeof base[f] === 'number' ? Number(route.query[f]) : route.query[f]
      }
    }
  }

  const draft = reactive(initial)
  // baseline = pristine factory output, so a restored stored draft counts as dirty
  const baseline = ref(JSON.stringify(bulkSnapshot(base, urlFields)))
  const isDirty = ref(JSON.stringify(bulkSnapshot(initial, urlFields)) !== baseline.value)

  let timer = null
  function persistNow() {
    try { localStorage.setItem(storageKey, JSON.stringify(bulkSnapshot(draft, urlFields))) } catch { /* quota/private mode: draft persistence is best-effort */ }
  }

  watch(draft, () => {
    isDirty.value = JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value
    clearTimeout(timer)
    timer = setTimeout(persistNow, debounceMs)
    if (router && route && urlFields.length) {
      const q = { ...route.query }
      let changed = false
      for (const f of urlFields) {
        const v = String(draft[f])
        if (q[f] !== v) { q[f] = v; changed = true }
      }
      if (changed) router.replace({ query: q })
    }
  }, { deep: true })

  function onBeforeUnload(e) {
    if (!isDirty.value) return
    clearTimeout(timer)
    persistNow()
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  function teardown() {
    window.removeEventListener('beforeunload', onBeforeUnload)
    clearTimeout(timer)
  }
  if (getCurrentInstance()) onBeforeUnmount(teardown)

  function clear() {
    clearTimeout(timer)
    timer = null
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    if (router && route && urlFields.length) {
      const q = { ...route.query }
      for (const f of urlFields) delete q[f]
      router.replace({ query: q })
    }
    baseline.value = JSON.stringify(bulkSnapshot(draft, urlFields))
    isDirty.value = false
  }

  function load(values) {
    const wasDirty = isDirty.value
    const baseObj = JSON.parse(baseline.value)
    baseline.value = JSON.stringify(bulkSnapshot({ ...baseObj, ...values }, urlFields))
    if (!wasDirty) Object.assign(draft, values)
    isDirty.value = JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value
  }

  return { draft, isDirty, clear, load, teardown }
}

// Promise<boolean> confirm for onBeforeRouteLeave guards.
// `confirm` is PrimeVue's useConfirm() instance, passed in for testability.
export function confirmDiscard(confirm, message = 'You have unsaved changes. Discard them?') {
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    confirm.require({
      message,
      header: 'Unsaved changes',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Discard',
      rejectLabel: 'Keep editing',
      acceptClass: 'p-button-danger',
      accept: () => done(true),
      reject: () => done(false),
      onHide: () => done(false)
    })
  })
}
```

- [ ] **Step 5: Run — must pass.** `npm test --workspace=web -- src/composables/useDraft.test.js` → all 6 PASS.

- [ ] **Step 6: Commit + release claim**

```bash
git add web/src/composables/useDraft.js web/src/composables/useDraft.test.js .agent-coordination/claims/U2.claim
git commit -m "feat(U2): useDraft composable — hybrid localStorage+URL draft persistence"
```

### Task U3: `useNotify` toast wrapper

**Files:**
- Create: `web/src/composables/useNotify.js`, `web/src/composables/useNotify.test.js`

**Interfaces:**
- Consumes: PrimeVue ToastService (registered by U1).
- Produces: `useNotify()` → `{ success(detail, summary = 'Done'), error(detail, summary = 'Error') }`. Success life 3000, error life 6000.

- [ ] **Step 1: Claim U3** (wave-0 gate check).

- [ ] **Step 2: Failing test** — `web/src/composables/useNotify.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

const add = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add }) }))

import { useNotify } from './useNotify.js'

describe('useNotify', () => {
  it('success → severity success, life 3000', () => {
    useNotify().success('Saved')
    expect(add).toHaveBeenCalledWith({ severity: 'success', summary: 'Done', detail: 'Saved', life: 3000 })
  })
  it('error → severity error, life 6000, custom summary', () => {
    useNotify().error('Boom', 'Save failed')
    expect(add).toHaveBeenCalledWith({ severity: 'error', summary: 'Save failed', detail: 'Boom', life: 6000 })
  })
})
```

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/composables/useNotify.test.js`

- [ ] **Step 4: Implement `web/src/composables/useNotify.js`:**

```js
import { useToast } from 'primevue/usetoast'

export function useNotify() {
  const toast = useToast()
  return {
    success: (detail, summary = 'Done') => toast.add({ severity: 'success', summary, detail, life: 3000 }),
    error: (detail, summary = 'Error') => toast.add({ severity: 'error', summary, detail, life: 6000 })
  }
}
```

- [ ] **Step 5: Run — must pass.**

- [ ] **Step 6: Commit + release claim**

```bash
git add web/src/composables/useNotify.js web/src/composables/useNotify.test.js .agent-coordination/claims/U3.claim
git commit -m "feat(U3): useNotify toast wrapper"
```

### Task U4: Graceful 401 + login redirect

**Files:**
- Modify: `web/src/api/client.js`, `web/src/api/client.test.js`, `web/src/router.js`, `web/src/views/LoginView.vue`
- Create: `web/src/views/LoginView.test.js`

**Interfaces:**
- Consumes: nothing from this phase.
- Produces: on organizer 401, `client.js` dispatches `window` CustomEvent `tripper:unauthorized` with `detail: { path }` (current `location.pathname + location.search`) instead of hard reload. `router.js` listens and pushes `/login?redirect=<path>`; its auth guard also carries `redirect: to.fullPath`. LoginView pushes `route.query.redirect` (only if it starts with `/`) after login, else `/`.

- [ ] **Step 1: Claim U4** (wave-0 gate check).

- [ ] **Step 2: Update the 401 test.** In `web/src/api/client.test.js`, find the existing test asserting `location.assign('/login')` on 401 (read the file first — do not touch other tests). Replace it with:

```js
it('dispatches tripper:unauthorized with current path on 401', async () => {
  const handler = vi.fn()
  window.addEventListener('tripper:unauthorized', handler)
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'no' } }), { status: 401 })
  )
  await expect(api.get('/api/me')).rejects.toThrow('no')
  expect(handler).toHaveBeenCalledTimes(1)
  expect(handler.mock.calls[0][0].detail.path).toBe(location.pathname + location.search)
  window.removeEventListener('tripper:unauthorized', handler)
})
```

(Match the file's existing mock style for `fetch` — if it stubs differently, keep that style and only change the assertion from `location.assign` to the event.)

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/api/client.test.js`

- [ ] **Step 4: Edit `web/src/api/client.js`** — replace the 401 line:

```js
// OLD
    if (res.status === 401 && redirectOn401 && location.pathname !== '/login') location.assign('/login')
// NEW
    if (res.status === 401 && redirectOn401 && location.pathname !== '/login') {
      window.dispatchEvent(new CustomEvent('tripper:unauthorized', { detail: { path: location.pathname + location.search } }))
    }
```

- [ ] **Step 5: Run — must pass** (whole client suite green).

- [ ] **Step 6: Edit `web/src/router.js`.** Change the guard's redirect line and add the event listener after `router` is created:

```js
// OLD (inside router.beforeEach)
  if (!auth.organizer) return { path: '/login' }
// NEW
  if (!auth.organizer) return { path: '/login', query: { redirect: to.fullPath } }
```

Append at end of file:

```js
window.addEventListener('tripper:unauthorized', (e) => {
  if (router.currentRoute.value.path === '/login') return
  router.push({ path: '/login', query: { redirect: e.detail?.path || router.currentRoute.value.fullPath } })
})
```

- [ ] **Step 7: Failing LoginView test** — `web/src/views/LoginView.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mountWithBase } from '../test-utils.js'
import LoginView from './LoginView.vue'
import { useAuthStore } from '../stores/auth.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/login', component: LoginView },
      { path: '/trips/:id/budget', component: { template: '<div>budget</div>' } }
    ]
  })
}

describe('LoginView redirect', () => {
  it('honors ?redirect after successful login', async () => {
    const router = makeRouter()
    await router.push('/login?redirect=/trips/9/budget')
    await router.isReady()
    const wrapper = mountWithBase(LoginView, { global: { plugins: [router] } })
    const auth = useAuthStore()
    auth.login = vi.fn().mockResolvedValue()
    await wrapper.find('#email').setValue('a@b.c')
    await wrapper.find('#password').setValue('pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trips/9/budget')
  })

  it('ignores non-path redirect values', async () => {
    const router = makeRouter()
    await router.push('/login?redirect=https://evil.example')
    await router.isReady()
    const wrapper = mountWithBase(LoginView, { global: { plugins: [router] } })
    const auth = useAuthStore()
    auth.login = vi.fn().mockResolvedValue()
    await wrapper.find('#email').setValue('a@b.c')
    await wrapper.find('#password').setValue('pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
```

- [ ] **Step 8: Run — must fail.** `npm test --workspace=web -- src/views/LoginView.test.js`

- [ ] **Step 9: Edit `web/src/views/LoginView.vue` script** — add `useRoute` and change the success push:

```js
// OLD
import { useRouter } from 'vue-router'
// NEW
import { useRoute, useRouter } from 'vue-router'
```

```js
// add after: const router = useRouter()
const route = useRoute()
```

```js
// OLD (in onSubmit)
    await auth.login(email.value, password.value)
    router.push('/')
// NEW
    await auth.login(email.value, password.value)
    const dest = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    router.push(dest)
```

- [ ] **Step 10: Run — must pass.** Both LoginView tests + full `src/api/client.test.js`.

- [ ] **Step 11: Commit + release claim**

```bash
git add web/src/api/client.js web/src/api/client.test.js web/src/router.js web/src/views/LoginView.vue web/src/views/LoginView.test.js .agent-coordination/claims/U4.claim
git commit -m "feat(U4): graceful 401 via tripper:unauthorized event + login redirect"
```

### Task U5: `EmptyState` component

**Files:**
- Create: `web/src/components/EmptyState.vue`, `web/src/components/EmptyState.test.js`

**Interfaces:**
- Consumes: PrimeVue `Button`, primeicons (U1).
- Produces: `<EmptyState :icon="'pi pi-inbox'" message="No trips yet" cta-label="New trip" @cta="...">` — icon + message always rendered; Button only when `ctaLabel` set; emits `cta` on click.

- [ ] **Step 1: Claim U5** (wave-0 gate check).

- [ ] **Step 2: Failing test** — `web/src/components/EmptyState.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders message, no button without ctaLabel', () => {
    const w = mountWithBase(EmptyState, { props: { message: 'Nothing here' } })
    expect(w.text()).toContain('Nothing here')
    expect(w.find('button').exists()).toBe(false)
  })
  it('renders CTA and emits cta on click', async () => {
    const w = mountWithBase(EmptyState, { props: { message: 'Nothing', ctaLabel: 'Create' } })
    await w.find('button').trigger('click')
    expect(w.emitted('cta')).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/components/EmptyState.test.js`

- [ ] **Step 4: Implement `web/src/components/EmptyState.vue`:**

```vue
<script setup>
import Button from 'primevue/button'

defineProps({
  icon: { type: String, default: 'pi pi-inbox' },
  message: { type: String, required: true },
  ctaLabel: { type: String, default: '' }
})
const emit = defineEmits(['cta'])
</script>

<template>
  <div class="empty-state">
    <i :class="icon" aria-hidden="true"></i>
    <p>{{ message }}</p>
    <Button v-if="ctaLabel" :label="ctaLabel" size="small" @click="emit('cta')" />
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #6b7280;
}
.empty-state i { font-size: 2rem; }
.empty-state p { margin: 0.5rem 0 1rem; }
</style>
```

- [ ] **Step 5: Run — must pass.**

- [ ] **Step 6: Commit + release claim**

```bash
git add web/src/components/EmptyState.vue web/src/components/EmptyState.test.js .agent-coordination/claims/U5.claim
git commit -m "feat(U5): EmptyState component"
```

---

## Wave 2

**Gate:** all of U1–U5 claims `status: done` + commits present. Wave-2 tasks are mutually independent — communicate ONLY via the Interfaces block in §Coordination; never read another wave-2 task's files mid-wave.

### Task U6: TripWizard — Stepper, validation, draft persistence, safe "Add person"

**Files:**
- Modify: `web/src/components/TripWizard.vue`, `web/src/views/TripNewView.vue`
- Create: `web/src/components/TripWizard.test.js`

**Interfaces:**
- Consumes: `useDraft`/`useNotify` (U2/U3); PrimeVue Stepper/StepList/Step, InputText, Textarea, RadioButton, Checkbox, Button, Message (U1).
- Produces: URL contract for U7 — "Add new person" links to `{ path: '/people', query: { new: '1', return: '/trips/new?step=4' } }`. Draft key `trip-new`, urlField `step`.

- [ ] **Step 1: Claim U6** (wave-1 gate check).

- [ ] **Step 2: Failing tests** — `web/src/components/TripWizard.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripWizard from './TripWizard.vue'
import { usePeopleStore } from '../stores/people.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/trips/new', component: { template: '<div/>' } },
      { path: '/people', component: { template: '<div/>' } },
      { path: '/trips/:id', name: 'trip', component: { template: '<div/>' } }
    ]
  })
}

async function mountWizard(url = '/trips/new') {
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  // Stub BEFORE mount — onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const people = usePeopleStore()
  people.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripWizard, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => { localStorage.clear() })

describe('TripWizard', () => {
  it('cannot advance past Basics without a name', async () => {
    const { wrapper } = await mountWizard()
    await wrapper.find('[data-test="wizard-next"]').trigger('click')
    expect(wrapper.text()).toContain('Name is required')
    expect(wrapper.find('#w-name').exists()).toBe(true) // still on step 1
  })

  it('restores step + fields from URL + storage after remount', async () => {
    localStorage.setItem('tripper:draft:trip-new', JSON.stringify({
      name: 'Goa', description: '', origin_city: '', vibe_tags: 'beach',
      date_mode: 'broad', start_date: '', end_date: '', flex_days: '',
      destination_mode: 'open', destination: '', participant_ids: [], windows: []
    }))
    const { wrapper } = await mountWizard('/trips/new?step=4')
    expect(wrapper.text()).toContain('Select participants')
    expect(wrapper.find('[data-test="add-person-link"]').attributes('href'))
      .toContain('/people?new=1&return=')
  })

  it('rejects end date before start date on step 2', async () => {
    localStorage.setItem('tripper:draft:trip-new', JSON.stringify({
      name: 'X', description: '', origin_city: '', vibe_tags: '',
      date_mode: 'confirmed', start_date: '2026-08-10', end_date: '2026-08-01',
      flex_days: '', destination_mode: 'open', destination: '', participant_ids: [], windows: []
    }))
    const { wrapper } = await mountWizard('/trips/new?step=2')
    await wrapper.find('[data-test="wizard-next"]').trigger('click')
    expect(wrapper.text()).toContain('End date must be on or after start date')
  })
})
```

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/components/TripWizard.test.js`

- [ ] **Step 4: Rewrite `web/src/components/TripWizard.vue`** (full replacement):

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import RadioButton from 'primevue/radiobutton'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'
import { useDraft } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'
import DateWindowsEditor from './DateWindowsEditor.vue'

const router = useRouter()
const route = useRoute()
const store = useTripsStore()
const people = usePeopleStore()
const notify = useNotify()

const { draft, clear } = useDraft('trip-new', () => ({
  step: 1,
  name: '',
  description: '',
  origin_city: '',
  vibe_tags: '',
  date_mode: 'broad',
  start_date: '',
  end_date: '',
  flex_days: '',
  destination_mode: 'open',
  destination: '',
  participant_ids: [],
  windows: []
}), { urlFields: ['step'], router, route })

const stepErrors = ref([])
const submitting = ref(false)

// No route-leave guard on purpose: the draft persists across navigation,
// which is what makes the "Add new person" round trip safe.

onMounted(async () => {
  try { await people.fetchPeople() } catch (e) { notify.error(e.message) }
})

function validateStep(s) {
  const errs = []
  if (s === 1 && !draft.name.trim()) errs.push('Name is required')
  if (s === 2) {
    if (draft.date_mode === 'confirmed' && draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      errs.push('End date must be on or after start date')
    }
    if (draft.date_mode === 'slight' && draft.flex_days !== '' && Number(draft.flex_days) < 0) {
      errs.push('Flex days must be 0 or more')
    }
  }
  stepErrors.value = errs
  return errs.length === 0
}

function next() { if (draft.step < 4 && validateStep(draft.step)) draft.step++ }
function back() { if (draft.step > 1) { stepErrors.value = []; draft.step-- } }

function toggleParticipant(id) {
  const idx = draft.participant_ids.indexOf(id)
  if (idx === -1) draft.participant_ids.push(id)
  else draft.participant_ids.splice(idx, 1)
}

function onWindowsSave(list) { draft.windows = list }

const addPersonTo = computed(() => ({ path: '/people', query: { new: '1', return: '/trips/new?step=4' } }))

async function submit() {
  if (!validateStep(1) || !validateStep(2)) { draft.step = !draft.name.trim() ? 1 : 2; return }
  submitting.value = true
  try {
    const payload = {
      name: draft.name,
      description: draft.description || undefined,
      origin_city: draft.origin_city || undefined,
      vibe_tags: draft.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean),
      date_mode: draft.date_mode,
      destination_mode: draft.destination_mode,
      participant_ids: draft.participant_ids
    }
    if (draft.date_mode === 'confirmed') {
      payload.start_date = draft.start_date || undefined
      payload.end_date = draft.end_date || undefined
    } else if (draft.date_mode === 'slight') {
      payload.start_date = draft.start_date || undefined
      payload.flex_days = draft.flex_days ? Number(draft.flex_days) : undefined
    }
    if (draft.destination_mode === 'decided') payload.destination = draft.destination || undefined

    const trip = await store.createTrip(payload)
    if (draft.date_mode === 'broad' && draft.windows.length) {
      await store.saveWindows(trip.id, draft.windows)
    }
    clear()
    notify.success(`Trip "${trip.name}" created`)
    router.push({ name: 'trip', params: { id: trip.id } })
  } catch (e) {
    notify.error(e.message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="trip-wizard card" @submit.prevent="submit">
    <Stepper :value="draft.step" linear>
      <StepList>
        <Step :value="1">Basics</Step>
        <Step :value="2">Dates</Step>
        <Step :value="3">Destination</Step>
        <Step :value="4">Participants</Step>
      </StepList>
    </Stepper>

    <div v-if="draft.step === 1">
      <div class="field"><label for="w-name">Name</label><InputText id="w-name" v-model="draft.name" fluid /></div>
      <div class="field"><label for="w-desc">Description</label><Textarea id="w-desc" v-model="draft.description" fluid auto-resize /></div>
      <div class="field"><label for="w-origin">Origin city</label><InputText id="w-origin" v-model="draft.origin_city" fluid /></div>
      <div class="field"><label for="w-vibe">Vibe tags (comma-separated)</label><InputText id="w-vibe" v-model="draft.vibe_tags" placeholder="beach, relaxed" fluid /></div>
    </div>

    <div v-else-if="draft.step === 2">
      <div class="field">
        <label>Date mode</label>
        <div class="radio-row"><RadioButton v-model="draft.date_mode" input-id="dm-confirmed" value="confirmed" /><label for="dm-confirmed">Confirmed</label></div>
        <div class="radio-row"><RadioButton v-model="draft.date_mode" input-id="dm-slight" value="slight" /><label for="dm-slight">Slight flex</label></div>
        <div class="radio-row"><RadioButton v-model="draft.date_mode" input-id="dm-broad" value="broad" /><label for="dm-broad">Broad</label></div>
      </div>
      <template v-if="draft.date_mode === 'confirmed'">
        <div class="field"><label for="w-start">Start date</label><input id="w-start" type="date" v-model="draft.start_date" /></div>
        <div class="field"><label for="w-end">End date</label><input id="w-end" type="date" v-model="draft.end_date" /></div>
      </template>
      <template v-else-if="draft.date_mode === 'slight'">
        <div class="field"><label for="w-anchor">Anchor date</label><input id="w-anchor" type="date" v-model="draft.start_date" /></div>
        <div class="field"><label for="w-flex">Flex days</label><input id="w-flex" type="number" v-model="draft.flex_days" /></div>
      </template>
      <template v-else>
        <DateWindowsEditor :windows="draft.windows" @save="onWindowsSave" />
      </template>
    </div>

    <div v-else-if="draft.step === 3">
      <div class="field">
        <label>Destination mode</label>
        <div class="radio-row"><RadioButton v-model="draft.destination_mode" input-id="dsm-decided" value="decided" /><label for="dsm-decided">Decided</label></div>
        <div class="radio-row"><RadioButton v-model="draft.destination_mode" input-id="dsm-open" value="open" /><label for="dsm-open">Open</label></div>
      </div>
      <div class="field" v-if="draft.destination_mode === 'decided'">
        <label for="w-destination">Destination</label>
        <InputText id="w-destination" v-model="draft.destination" fluid />
      </div>
    </div>

    <div v-else-if="draft.step === 4">
      <p>Select participants:</p>
      <ul class="wizard-participants">
        <li v-for="p in people.people" :key="p.id">
          <Checkbox :model-value="draft.participant_ids.includes(p.id)" :input-id="`wp-${p.id}`" binary @update:model-value="toggleParticipant(p.id)" />
          <label :for="`wp-${p.id}`">{{ p.name }}</label>
        </li>
      </ul>
      <RouterLink :to="addPersonTo" class="btn" data-test="add-person-link">Add new person</RouterLink>
    </div>

    <Message v-for="e in stepErrors" :key="e" severity="error" :closable="false">{{ e }}</Message>

    <div class="wizard-nav">
      <Button v-if="draft.step > 1" type="button" label="Back" severity="secondary" outlined @click="back" />
      <Button v-if="draft.step < 4" type="button" label="Next" data-test="wizard-next" @click="next" />
      <Button v-if="draft.step === 4" type="submit" label="Create trip" :loading="submitting" />
    </div>
  </form>
</template>

<style scoped>
.wizard-nav { display: flex; gap: 0.5rem; margin-top: 1rem; }
.wizard-participants { list-style: none; padding: 0; }
.wizard-participants li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.radio-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; }
</style>
```

- [ ] **Step 5: Run — must pass.** `npm test --workspace=web -- src/components/TripWizard.test.js`. If Stepper `linear` blocks programmatic `draft.step` changes in your PrimeVue version, bind `:value="draft.step"` only (display) and drive panels purely off `draft.step` as written — panels are our own `v-if`s, so Stepper is header-only.

- [ ] **Step 6: Header in `web/src/views/TripNewView.vue`** — no structural change needed; verify it still renders (`<h1>New trip</h1>` + `<TripWizard />`). If wizard remounts blank after this task's changes, check the draft key collision in localStorage first.

- [ ] **Step 7: Manual smoke** (optional but recommended): `npm run dev --workspace=web`, fill step 1, refresh → fields + step survive; navigate to People and back via "Add new person" → wizard restores at step 4.

- [ ] **Step 8: Commit + release claim**

```bash
git add web/src/components/TripWizard.vue web/src/components/TripWizard.test.js web/src/views/TripNewView.vue .agent-coordination/claims/U6.claim
git commit -m "feat(U6): wizard stepper, per-step validation, draft persistence, safe add-person"
```

### Task U7: People flows — create/edit drafts, `?new=1&return=` round trip

**Files:**
- Modify: `web/src/views/PeopleListView.vue`, `web/src/components/PersonForm.vue`, `web/src/views/PersonDetailView.vue`
- Create: `web/src/views/PeopleListView.test.js`

**Interfaces:**
- Consumes: `useDraft`/`confirmDiscard` (U2), `useNotify` (U3), `EmptyState` (U5), PrimeVue Button/Skeleton/Tag, `useConfirm`.
- Produces: honors U6's URL contract — `query.new === '1'` opens the create form; on successful create, navigates to `query.return` if it starts with `/`, else to the person page. `PersonForm` gains prop `draftKey` (String, default `''`) and exposes `clearDraft()` via `defineExpose`.

- [ ] **Step 1: Claim U7** (wave-1 gate check).

- [ ] **Step 2: Failing tests** — `web/src/views/PeopleListView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import PeopleListView from './PeopleListView.vue'
import { usePeopleStore } from '../stores/people.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/people', component: PeopleListView },
      { path: '/trips/new', component: { template: '<div>wizard</div>' } },
      { path: '/people/:id', name: 'person', component: { template: '<div>person</div>' } }
    ]
  })
}

async function mountAt(url) {
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  // Stub BEFORE mount — onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePeopleStore()
  store.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(PeopleListView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, store }
}

beforeEach(() => { localStorage.clear() })

describe('PeopleListView', () => {
  it('opens create form when query.new=1', async () => {
    const { wrapper } = await mountAt('/people?new=1')
    expect(wrapper.find('#pf-name').exists()).toBe(true)
  })

  it('routes back to query.return after successful create', async () => {
    const { wrapper, router, store } = await mountAt('/people?new=1&return=%2Ftrips%2Fnew%3Fstep%3D4')
    store.createPerson = vi.fn().mockResolvedValue({ id: 'p1', name: 'Ada' })
    await wrapper.find('#pf-name').setValue('Ada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trips/new?step=4')
  })

  it('ignores absolute-URL return values', async () => {
    const { wrapper, router, store } = await mountAt('/people?new=1&return=https%3A%2F%2Fevil.example')
    store.createPerson = vi.fn().mockResolvedValue({ id: 'p1', name: 'Ada' })
    await wrapper.find('#pf-name').setValue('Ada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('person')
  })
})
```

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/views/PeopleListView.test.js`

- [ ] **Step 4: Update `web/src/components/PersonForm.vue`.** Script section — replace entirely (template's `v-model="form.X"` bindings all keep working because `form` is now the draft object):

```js
import { reactive, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useDraft, confirmDiscard } from '../composables/useDraft.js'

const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Save' },
  draftKey: { type: String, default: '' }
})
const emit = defineEmits(['submit', 'cancel'])

function blank() {
  return {
    name: '', phone: '', email: '', emergency_contact: '', dietary: '',
    allergies: '', medical_notes: '', pace: '', interests: '', budget_band: '', home_city: ''
  }
}

function mapped(src) {
  const b = blank()
  const out = {}
  for (const k of Object.keys(b)) {
    if (k === 'interests') out.interests = Array.isArray(src?.interests) ? src.interests.join(', ') : ''
    else out[k] = src?.[k] ?? ''
  }
  return out
}

const confirm = useConfirm()
const router = useRouter()
const route = useRoute()

// Draft-backed when draftKey given; plain reactive otherwise.
const draftApi = props.draftKey
  ? useDraft(props.draftKey, blank, { router, route })
  : null
const form = draftApi ? draftApi.draft : reactive(blank())

if (draftApi) {
  draftApi.load(mapped(props.initial))
  watch(() => props.initial, (v) => draftApi.load(mapped(v)))
  onBeforeRouteLeave(async () => {
    if (!draftApi.isDirty.value) return true
    const ok = await confirmDiscard(confirm)
    if (ok) draftApi.clear()
    return ok
  })
} else {
  Object.assign(form, mapped(props.initial))
  watch(() => props.initial, (v) => Object.assign(form, mapped(v)))
}

function clearDraft() { draftApi?.clear() }
defineExpose({ clearDraft })

function submit() {
  const fields = {
    name: form.name,
    phone: form.phone || null,
    email: form.email || null,
    emergency_contact: form.emergency_contact || null,
    dietary: form.dietary || null,
    allergies: form.allergies || null,
    medical_notes: form.medical_notes || null,
    pace: form.pace || null,
    interests: form.interests.split(',').map(s => s.trim()).filter(Boolean),
    budget_band: form.budget_band || null,
    home_city: form.home_city || null
  }
  emit('submit', fields)
}

function onCancel() {
  clearDraft()
  emit('cancel')
}
```

In the template, change only the Cancel button handler and the submit/cancel buttons to PrimeVue:

```html
<!-- OLD -->
    <button type="submit" class="btn btn-primary">{{ submitLabel }}</button>
    <button type="button" class="btn" @click="emit('cancel')">Cancel</button>
<!-- NEW (add `import Button from 'primevue/button'` to script imports) -->
    <Button type="submit" :label="submitLabel" />
    <Button type="button" label="Cancel" severity="secondary" outlined @click="onCancel" />
```

- [ ] **Step 5: Rewrite `web/src/views/PeopleListView.vue`:**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { usePeopleStore } from '../stores/people.js'
import { useNotify } from '../composables/useNotify.js'
import PersonForm from '../components/PersonForm.vue'
import EmptyState from '../components/EmptyState.vue'

const store = usePeopleStore()
const router = useRouter()
const route = useRoute()
const notify = useNotify()

const showForm = ref(route.query.new === '1')
const loading = ref(true)
const formRef = ref(null)

onMounted(async () => {
  try { await store.fetchPeople() } catch (e) { notify.error(e.message) } finally { loading.value = false }
})

async function onCreate(fields) {
  try {
    const person = await store.createPerson(fields)
    formRef.value?.clearDraft()
    showForm.value = false
    notify.success(`Added ${person.name}`)
    const ret = typeof route.query.return === 'string' && route.query.return.startsWith('/') ? route.query.return : null
    router.push(ret || { name: 'person', params: { id: person.id } })
  } catch (e) {
    notify.error(e.message)
  }
}
</script>

<template>
  <main class="page">
    <h1>People</h1>

    <Button :label="showForm ? 'Cancel' : 'Add person'" :severity="showForm ? 'secondary' : undefined" :outlined="showForm" @click="showForm = !showForm" />

    <PersonForm v-if="showForm" ref="formRef" submit-label="Create" draft-key="person-new" @submit="onCreate" @cancel="showForm = false" />

    <div v-if="loading" class="card">
      <Skeleton v-for="i in 4" :key="i" height="1.5rem" class="skeleton-row" />
    </div>

    <EmptyState v-else-if="!store.people.length" icon="pi pi-users" message="No people yet — add travel companions here." cta-label="Add person" @cta="showForm = true" />

    <table v-else class="table">
      <thead>
        <tr><th>Name</th><th>Home city</th><th>Dietary</th></tr>
      </thead>
      <tbody>
        <tr v-for="person in store.people" :key="person.id">
          <td><router-link :to="{ name: 'person', params: { id: person.id } }">{{ person.name }}</router-link></td>
          <td>{{ person.home_city || '-' }}</td>
          <td><Tag v-if="person.dietary" :value="person.dietary" severity="secondary" /></td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
.skeleton-row { margin-bottom: 0.5rem; }
</style>
```

- [ ] **Step 6: Update `web/src/views/PersonDetailView.vue`.** Script — replace entirely:

```js
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { usePeopleStore } from '../stores/people.js'
import { useNotify } from '../composables/useNotify.js'
import PersonForm from '../components/PersonForm.vue'
import DocumentList from '../components/DocumentList.vue'

const route = useRoute()
const router = useRouter()
const store = usePeopleStore()
const confirm = useConfirm()
const notify = useNotify()

const loading = ref(true)
const formRef = ref(null)

onMounted(async () => {
  try { await store.fetchPerson(route.params.id) } catch (e) { notify.error(e.message) } finally { loading.value = false }
})

async function onSave(fields) {
  try {
    await store.updatePerson(route.params.id, fields)
    formRef.value?.clearDraft()
    notify.success('Person saved')
  } catch (e) {
    notify.error(e.message)
  }
}

function onDelete() {
  confirm.require({
    message: `Delete ${store.current?.name}? This cannot be undone.`,
    header: 'Delete person',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await store.deletePerson(route.params.id)
        notify.success('Person deleted')
        router.push({ name: 'people' })
      } catch (e) {
        notify.error(e.message)
      }
    }
  })
}
```

Template — replace entirely:

```html
<template>
  <main class="page">
    <h1>{{ store.current?.name || 'Person' }}</h1>

    <ProgressSpinner v-if="loading" style="width: 2.5rem; height: 2.5rem" />

    <template v-else-if="store.current">
      <PersonForm ref="formRef" :initial="store.current" submit-label="Save" :draft-key="`person:${route.params.id}:edit`" @submit="onSave" @cancel="() => {}" />
      <Button label="Delete person" severity="danger" outlined @click="onDelete" />
      <DocumentList :person-id="route.params.id" />
    </template>
  </main>
</template>
```

- [ ] **Step 7: Run — must pass.** `npm test --workspace=web -- src/views/PeopleListView.test.js` (and re-run any existing PersonForm-related tests if present).

- [ ] **Step 8: Commit + release claim**

```bash
git add web/src/views/PeopleListView.vue web/src/views/PeopleListView.test.js web/src/components/PersonForm.vue web/src/views/PersonDetailView.vue .agent-coordination/claims/U7.claim
git commit -m "feat(U7): person create/edit drafts, new=1/return round trip, confirm+toasts"
```

### Task U8: TripDetailView — basics draft, wayfinding, confirm, copy feedback

**Files:**
- Modify: `web/src/views/TripDetailView.vue`
- Create: `web/src/views/TripDetailView.test.js`

**Interfaces:**
- Consumes: `useDraft`/`confirmDiscard` (U2), `useNotify` (U3), PrimeVue Tag/Button/ProgressSpinner, `useConfirm`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Claim U8** (wave-1 gate check).

- [ ] **Step 2: Failing test** — `web/src/views/TripDetailView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripDetailView from './TripDetailView.vue'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip', component: TripDetailView },
      { path: '/trips/:id/budget', name: 'trip-budget', component: { template: '<div/>' } },
      { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: { template: '<div/>' } },
      { path: '/trips/:id/checklists', name: 'trip-checklists', component: { template: '<div/>' } },
      { path: '/trips/:id/readiness', name: 'trip-readiness', component: { template: '<div/>' } },
      { path: '/trips/:id/archive', name: 'trip-archive', component: { template: '<div/>' } }
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTripsStore()
  const people = usePeopleStore()
  people.fetchPeople = vi.fn().mockResolvedValue()
  store.fetchCandidates = vi.fn().mockResolvedValue()
  store.fetchLinks = vi.fn().mockResolvedValue()
  store.fetchTrip = vi.fn().mockImplementation(async () => {
    store.current = { id: 't1', name: 'Goa 2026', status: 'planning', vibe_tags: [], participants: [], windows: [], goals: [] }
  })
  const wrapper = mountWithBase(TripDetailView, { pinia, global: { plugins: [router] } })
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear() })

describe('TripDetailView', () => {
  it('shows trip name + status in header after load', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('h1').text()).toContain('Goa 2026')
    expect(wrapper.text()).toContain('planning')
  })

  it('restores unsaved basics edits after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:basics', JSON.stringify({ name: 'Edited name', description: '', origin_city: '', vibe_tags: '' }))
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('#td-name').element.value).toBe('Edited name')
  })
})
```

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/views/TripDetailView.test.js`

- [ ] **Step 4: Edit `web/src/views/TripDetailView.vue` script.** Apply these changes:

Add imports:

```js
import { onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useDraft, confirmDiscard } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'
```

Replace the `basics` reactive + `loadBasics` + `load` + `saveBasics` block:

```js
// OLD
const basics = reactive({ name: '', description: '', origin_city: '', vibe_tags: '' })
// NEW
const confirm = useConfirm()
const notify = useNotify()
const loading = ref(true)
const basicsDraft = useDraft(`trip:${route.params.id}:basics`, () => ({ name: '', description: '', origin_city: '', vibe_tags: '' }))
const basics = basicsDraft.draft
```

```js
// OLD
function loadBasics(trip) {
  if (!trip) return
  basics.name = trip.name || ''
  basics.description = trip.description || ''
  basics.origin_city = trip.origin_city || ''
  basics.vibe_tags = (trip.vibe_tags || []).join(', ')
}
// NEW
function loadBasics(trip) {
  if (!trip) return
  basicsDraft.load({
    name: trip.name || '',
    description: trip.description || '',
    origin_city: trip.origin_city || '',
    vibe_tags: (trip.vibe_tags || []).join(', ')
  })
}
```

```js
// OLD (in load())
async function load() {
  await store.fetchTrip(tripId.value)
  ...
}
// NEW — wrap with loading flag + error toast
async function load() {
  loading.value = true
  try {
    await store.fetchTrip(tripId.value)
    loadBasics(store.current)
    await store.fetchCandidates(tripId.value)
    await store.fetchLinks(tripId.value)
    try { await people.fetchPeople() } catch { /* non-critical */ }
  } catch (e) {
    notify.error(e.message)
  } finally {
    loading.value = false
  }
}
```

```js
// OLD
async function saveBasics() {
  try {
    const trip = await store.updateTrip(tripId.value, {...})
    loadBasics(trip)
  } catch { /* store.error surfaced below */ }
}
// NEW
async function saveBasics() {
  try {
    const trip = await store.updateTrip(tripId.value, {
      name: basics.name,
      description: basics.description || null,
      origin_city: basics.origin_city || null,
      vibe_tags: basics.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean)
    })
    loadBasics(trip)
    basicsDraft.clear()
    notify.success('Trip saved')
  } catch (e) {
    notify.error(e.message)
  }
}
```

Add the leave guard after `saveBasics`:

```js
onBeforeRouteLeave(async () => {
  if (!basicsDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) basicsDraft.clear()
  return ok
})
```

Replace `removeParticipant`:

```js
// OLD
async function removeParticipant(personId) {
  if (!confirm('Remove this participant?')) return
  try { await store.removeParticipant(tripId.value, personId) } catch { /* surfaced */ }
}
// NEW
function removeParticipant(personId) {
  confirm.require({
    message: 'Remove this participant?',
    header: 'Remove participant',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Remove',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try { await store.removeParticipant(tripId.value, personId) } catch (e) { notify.error(e.message) }
    }
  })
}
```

Replace `copyLink`:

```js
// OLD
async function copyLink(url) {
  try { await navigator.clipboard.writeText(location.origin + url) } catch { /* clipboard may be unavailable */ }
}
// NEW
async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(location.origin + url)
    notify.success('Link copied')
  } catch {
    notify.error('Could not access clipboard — copy the link manually')
  }
}
```

In every remaining `catch { /* surfaced */ }` handler (`advanceStatus`, `onSaveWindows`, `onAddGoal`, `onUpdateGoal`, `onDeleteGoal`, `addParticipant`, `createLink`, `revokeLink`), change to `catch (e) { notify.error(e.message) }`.

- [ ] **Step 5: Edit the template.** Header + error card + loading:

```html
<!-- OLD -->
    <h1>Trip</h1>
    <TripTabs :trip-id="tripId" />

    <div v-if="store.error" class="card trip-error">{{ store.error }}</div>

    <template v-if="store.current">
<!-- NEW -->
    <h1>
      {{ store.current?.name || 'Trip' }}
      <Tag v-if="store.current" :value="store.current.status" severity="info" />
    </h1>
    <TripTabs :trip-id="tripId" />

    <ProgressSpinner v-if="loading && !store.current" style="width: 2.5rem; height: 2.5rem" />

    <template v-if="store.current">
```

Also delete the `.trip-error` rule from the scoped style block. Swap the Overview section's buttons to PrimeVue:

```html
<!-- OLD -->
        <button type="button" class="btn btn-primary" @click="saveBasics">Save changes</button>
        <p>Status: <span class="badge badge-ok">{{ store.current.status }}</span></p>
        <button v-if="nextTransition" type="button" class="btn" @click="advanceStatus">{{ nextTransition.label }}</button>
<!-- NEW -->
        <Button label="Save changes" @click="saveBasics" />
        <Button v-if="nextTransition" :label="nextTransition.label" severity="secondary" outlined @click="advanceStatus" />
```

- [ ] **Step 6: Run — must pass.** `npm test --workspace=web -- src/views/TripDetailView.test.js`

- [ ] **Step 7: Commit + release claim**

```bash
git add web/src/views/TripDetailView.vue web/src/views/TripDetailView.test.js .agent-coordination/claims/U8.claim
git commit -m "feat(U8): trip detail — basics draft, header wayfinding, confirm + toasts"
```

### Task U9: Budget — draft for lines + overrides, leave guard

**Files:**
- Modify: `web/src/views/TripBudgetView.vue`
- Create: `web/src/views/TripBudgetView.test.js`

**Interfaces:**
- Consumes: `useDraft`/`confirmDiscard` (U2), `useNotify` (U3), PrimeVue Button/Skeleton, `useConfirm`.
- Produces: nothing consumed downstream. Draft keys `trip:<id>:budget-lines` (`{ lines: [] }`) and `trip:<id>:budget-overrides` (`{ overrides: [] }`).

- [ ] **Step 1: Claim U9** (wave-1 gate check).

- [ ] **Step 2: Failing test** — `web/src/views/TripBudgetView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripBudgetView from './TripBudgetView.vue'
import { useBudgetStore } from '../stores/budget.js'
import { api } from '../api/client.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/budget', component: TripBudgetView },
             { path: '/trips/:id', name: 'trip', component: { template: '<div/>' } },
             { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: { template: '<div/>' } },
             { path: '/trips/:id/checklists', name: 'trip-checklists', component: { template: '<div/>' } },
             { path: '/trips/:id/readiness', name: 'trip-readiness', component: { template: '<div/>' } },
             { path: '/trips/:id/archive', name: 'trip-archive', component: { template: '<div/>' } }]
  })
  await router.push('/trips/t1/budget')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  vi.spyOn(api, 'get').mockResolvedValue({ trip: { name: 'Goa 2026', participants: [] } })
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useBudgetStore()
  store.fetchBudget = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripBudgetView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('TripBudgetView', () => {
  it('restores unsaved line edits after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:budget-lines', JSON.stringify({ lines: [{ category: 'stay', amount: 500 }] }))
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('stay')
  })

  it('shows trip name in header', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('h1').text()).toContain('Goa 2026')
  })
})
```

(If `BudgetTable` renders lines differently, assert via the component's props instead: `wrapper.findComponent({ name: 'BudgetTable' }).props('modelValue')` — check `BudgetTable.vue`'s prop name by reading it, it is owned by no wave-2 task and is read-only for you.)

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/views/TripBudgetView.test.js`

- [ ] **Step 4: Edit `web/src/views/TripBudgetView.vue` script.** Replace the state block:

```js
// OLD
const localLines = ref([])
const participants = ref([])
const editableOverrides = ref([])
const newOverride = reactive({ person_id: '', amount: 0, note: '' })

watch(() => store.lines, (lines) => { localLines.value = lines.map((l) => ({ ...l })) }, { immediate: true })
watch(() => store.overrides, (overrides) => { editableOverrides.value = overrides.map((o) => ({ ...o })) }, { immediate: true })
// NEW
import { onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useDraft, confirmDiscard } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'

const confirm = useConfirm()
const notify = useNotify()
const loading = ref(true)
const tripName = ref('')
const participants = ref([])
const newOverride = reactive({ person_id: '', amount: 0, note: '' })

const linesDraft = useDraft(`trip:${tripId}:budget-lines`, () => ({ lines: [] }))
const overridesDraft = useDraft(`trip:${tripId}:budget-overrides`, () => ({ overrides: [] }))

watch(() => store.lines, (lines) => { linesDraft.load({ lines: lines.map((l) => ({ ...l })) }) }, { immediate: true })
watch(() => store.overrides, (overrides) => { overridesDraft.load({ overrides: overrides.map((o) => ({ ...o })) }) }, { immediate: true })
```

Update `onMounted` to capture the trip name + loading:

```js
onMounted(async () => {
  try {
    const trip = (await api.get(`/api/trips/${tripId}`)).trip
    participants.value = trip?.participants || []
    tripName.value = trip?.name || ''
  } catch { participants.value = [] }
  try { await store.fetchBudget(tripId) } catch (e) { notify.error(e.message) } finally { loading.value = false }
})
```

Rewire actions to the drafts + toasts:

```js
async function saveLines() {
  try {
    await store.saveLines(tripId, linesDraft.draft.lines)
    linesDraft.clear()
    notify.success('Budget saved')
  } catch (e) { notify.error(e.message) }
}

function addOverrideRow() {
  if (!newOverride.person_id) return
  const person = participants.value.find((p) => p.id === newOverride.person_id)
  overridesDraft.draft.overrides.push({
    person_id: newOverride.person_id,
    person_name: person?.name || '',
    amount: Number(newOverride.amount) || 0,
    note: newOverride.note
  })
  newOverride.person_id = ''
  newOverride.amount = 0
  newOverride.note = ''
}

function removeOverrideRow(personId) {
  overridesDraft.draft.overrides = overridesDraft.draft.overrides.filter((o) => o.person_id !== personId)
}

async function saveOverrides() {
  try {
    const overrides = overridesDraft.draft.overrides.map((o) => ({ person_id: o.person_id, amount: Number(o.amount) || 0, note: o.note }))
    await store.saveOverrides(tripId, overrides)
    overridesDraft.clear()
    notify.success('Overrides saved')
  } catch (e) { notify.error(e.message) }
}

async function runAiDraft() {
  try { await store.aiDraft(tripId) } catch (e) { notify.error(e.message) }
}

async function applyDraft() {
  try { await store.applyDraft(tripId); notify.success('AI draft applied') } catch (e) { notify.error(e.message) }
}

onBeforeRouteLeave(async () => {
  if (!linesDraft.isDirty.value && !overridesDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) { linesDraft.clear(); overridesDraft.clear() }
  return ok
})
```

- [ ] **Step 5: Edit the template.** Header, error card, loading, bindings:

```html
<!-- OLD -->
    <h1>Trip Budget</h1>

    <div v-if="store.error" class="card">{{ store.error }}</div>
<!-- NEW -->
    <h1>{{ tripName || 'Trip' }} — Budget</h1>

    <div v-if="loading" class="card"><Skeleton v-for="i in 4" :key="i" height="1.5rem" style="margin-bottom: 0.5rem" /></div>
```

Wrap the three content cards in `<template v-else>` … `</template>`. Change `v-model="localLines"` → `v-model="linesDraft.draft.lines"`, `v-for="o in editableOverrides"` → `v-for="o in overridesDraft.draft.overrides"`, and the four `.btn` buttons to `<Button>` (`Save budget`, `Apply`, `Discard` → `severity="secondary" outlined`, `Save overrides`).

- [ ] **Step 6: Run — must pass.** `npm test --workspace=web -- src/views/TripBudgetView.test.js`

- [ ] **Step 7: Commit + release claim**

```bash
git add web/src/views/TripBudgetView.vue web/src/views/TripBudgetView.test.js .agent-coordination/claims/U9.claim
git commit -m "feat(U9): budget drafts (lines+overrides), leave guard, header, toasts"
```

### Task U10: Itinerary — persist unapplied AI draft

**Files:**
- Modify: `web/src/views/TripItineraryView.vue`
- Create: `web/src/views/TripItineraryView.test.js`

**Interfaces:**
- Consumes: `useDraft` (U2), `useNotify` (U3), `EmptyState` (U5), PrimeVue Button/Skeleton/Tag.
- Produces: nothing consumed downstream. Draft key `trip:<id>:itinerary-ai`, shape `{ ai: null }`.

- [ ] **Step 1: Claim U10** (wave-1 gate check).

- [ ] **Step 2: Failing test** — `web/src/views/TripItineraryView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripItineraryView from './TripItineraryView.vue'
import { useItineraryStore } from '../stores/itinerary.js'
import { useTripsStore } from '../stores/trips.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/itinerary', component: TripItineraryView },
             { path: '/trips/:id', name: 'trip', component: { template: '<div/>' } },
             { path: '/trips/:id/budget', name: 'trip-budget', component: { template: '<div/>' } },
             { path: '/trips/:id/checklists', name: 'trip-checklists', component: { template: '<div/>' } },
             { path: '/trips/:id/readiness', name: 'trip-readiness', component: { template: '<div/>' } },
             { path: '/trips/:id/archive', name: 'trip-archive', component: { template: '<div/>' } }]
  })
  await router.push('/trips/t1/itinerary')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useItineraryStore()
  const trips = useTripsStore()
  store.fetchItinerary = vi.fn().mockImplementation(async () => { store.days = [{ id: 'd1', day_date: '2026-08-01', items: [] }] })
  trips.fetchTrip = vi.fn().mockImplementation(async () => { trips.current = { id: 't1', name: 'Goa 2026', status: 'planning' } })
  const wrapper = mountWithBase(TripItineraryView, { pinia, global: { plugins: [router] } })
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear() })

describe('TripItineraryView', () => {
  it('restores an unapplied AI draft from storage after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:itinerary-ai', JSON.stringify({
      ai: [{ day_date: '2026-08-01', items: [{ title: 'Beach walk' }] }]
    }))
    const { wrapper, store } = await mountView()
    await flushPromises()
    // remount happens fresh in this test: the view must have pushed the stored draft into the store
    expect(store.draft).toEqual([{ day_date: '2026-08-01', items: [{ title: 'Beach walk' }] }])
    expect(wrapper.text()).toContain('Beach walk')
  })
})
```

- [ ] **Step 3: Run — must fail.** `npm test --workspace=web -- src/views/TripItineraryView.test.js`

- [ ] **Step 4: Edit `web/src/views/TripItineraryView.vue` script** — replace entirely:

```js
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../stores/itinerary.js'
import { useTripsStore } from '../stores/trips.js'
import { useAuthStore } from '../stores/auth.js'
import { useDraft } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'
import EmptyState from '../components/EmptyState.vue'
import DayCard from '../components/DayCard.vue'

const route = useRoute()
const tripId = route.params.id
const store = useItineraryStore()
const trips = useTripsStore()
const auth = useAuthStore()
const notify = useNotify()

const loading = ref(true)
const aiDraftStore = useDraft(`trip:${tripId}:itinerary-ai`, () => ({ ai: null }))

// Mirror the Pinia draft into persistent storage both ways.
watch(() => store.draft, (d) => { aiDraftStore.draft.ai = d ?? null })

onMounted(async () => {
  try {
    await store.fetchItinerary(tripId)
    if (!trips.current || trips.current.id !== tripId) {
      try { await trips.fetchTrip(tripId) } catch { /* header falls back to generic */ }
    }
    if (aiDraftStore.draft.ai && !store.draft) store.draft = aiDraftStore.draft.ai
  } catch (e) {
    notify.error(e.message)
  } finally {
    loading.value = false
  }
})

async function initDays() {
  try { await store.init(tripId) } catch (e) { notify.error(e.message) }
}

async function draftWholeTrip() {
  try { await store.aiDraft(tripId) } catch (e) { notify.error(e.message) }
}

async function applyWholeDraft() {
  try {
    await store.applyDraft(tripId)
    aiDraftStore.draft.ai = null
    aiDraftStore.clear()
    notify.success('AI draft applied')
  } catch (e) {
    notify.error(e.message)
  }
}

function discardWholeDraft() {
  store.draft = null
  aiDraftStore.draft.ai = null
  aiDraftStore.clear()
}
```

- [ ] **Step 5: Edit the template.** Header + error card + loading + empty state:

```html
<!-- OLD -->
    <h1>Trip Itinerary</h1>

    <div v-if="store.error" class="card">
      <strong>Error:</strong> {{ store.error }}
    </div>

    <div v-if="!store.days.length" class="card">
      <p>No itinerary days yet. Days are generated from the trip's confirmed start/end dates.</p>
      <button class="btn btn-primary" type="button" @click="initDays">Initialize days</button>
    </div>
<!-- NEW -->
    <h1>{{ trips.current?.name || 'Trip' }} — Itinerary</h1>

    <div v-if="loading" class="card"><Skeleton v-for="i in 3" :key="i" height="1.5rem" style="margin-bottom: 0.5rem" /></div>

    <EmptyState v-else-if="!store.days.length" icon="pi pi-calendar" message="No itinerary days yet. Days are generated from the trip's confirmed start/end dates." cta-label="Initialize days" @cta="initDays" />
```

Change the following `v-else` / `template v-else` chain to hang off the EmptyState (`<template v-else>` stays). Swap the three buttons (`AI draft (whole trip)`, `Apply`, `Discard`) to `<Button>` (`Discard` → `severity="secondary" outlined`; AI button keeps `:disabled="store.aiBusy"` → `:loading="store.aiBusy"`).

- [ ] **Step 6: Run — must pass.** `npm test --workspace=web -- src/views/TripItineraryView.test.js`

- [ ] **Step 7: Commit + release claim**

```bash
git add web/src/views/TripItineraryView.vue web/src/views/TripItineraryView.test.js .agent-coordination/claims/U10.claim
git commit -m "feat(U10): itinerary AI-draft persistence, header, empty/loading states"
```

### Task U11: Confirm/notify sweep — remaining `confirm()`/`prompt()` sites

**Files:**
- Modify: `web/src/components/DestinationPanel.vue`, `web/src/components/DocumentList.vue`, `web/src/components/ParticipantDocs.vue`, `web/src/components/GoalsEditor.vue`, `web/src/views/TripArchiveView.vue`
- Create: `web/src/no-raw-confirm.test.js`

**Interfaces:**
- Consumes: `useNotify` (U3), PrimeVue `useConfirm`, Button, InputText.
- Produces: invariant — zero `confirm(`/`alert(`/`prompt(` calls anywhere in `web/src`.

- [ ] **Step 1: Claim U11** (wave-1 gate check).

- [ ] **Step 2: Failing invariant test** — `web/src/no-raw-confirm.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue') || (p.endsWith('.js') && !p.endsWith('.test.js'))) out.push(p)
  }
  return out
}

describe('no raw browser dialogs', () => {
  it('no confirm()/alert()/prompt() outside PrimeVue services', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8')
      // match bare calls: start-of-expression confirm( / alert( / prompt(
      if (/(?<![.\w])(confirm|alert|prompt)\(/.test(text.replace(/confirm\.require\(/g, ''))) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 3: Run — must fail** listing the 5 files (and any other stragglers — if a file outside your ownership shows up, do NOT edit it; append a NOTES.md escalation and exclude it via an explicit allowlist comment in the test, noting the escalation):

```bash
npm test --workspace=web -- src/no-raw-confirm.test.js
```

- [ ] **Step 4: Convert each file.** Same pattern everywhere. Add to each `<script setup>`:

```js
import { useConfirm } from 'primevue/useconfirm'
import { useNotify } from '../composables/useNotify.js'
const confirm = useConfirm()
const notify = useNotify()
```

(For `TripArchiveView.vue` the composable path is `../composables/useNotify.js` too.)

`DestinationPanel.vue`:

```js
// OLD
async function removeCandidate(candidateId) {
  if (confirm('Delete this candidate?')) await store.deleteCandidate(candidateId)
}
// NEW
function removeCandidate(candidateId) {
  confirm.require({
    message: 'Delete this candidate?', header: 'Delete candidate', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { try { await store.deleteCandidate(candidateId) } catch (e) { notify.error(e.message) } }
  })
}
```

`DocumentList.vue` and `ParticipantDocs.vue` (same function in both):

```js
// OLD
async function remove(doc) {
  if (!confirm(`Delete document "${doc.original_name}"?`)) return
  await store.deleteDocument(doc.id)
}
// NEW
function remove(doc) {
  confirm.require({
    message: `Delete document "${doc.original_name}"?`, header: 'Delete document', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { try { await store.deleteDocument(doc.id) } catch (e) { notify.error(e.message) } }
  })
}
```

(Keep each file's existing await/error style inside `accept` — if the original swallowed via `store.error`, now toast it.)

`GoalsEditor.vue`:

```js
// OLD
function remove(id) {
  if (confirm('Delete this goal?')) emit('delete', id)
}
// NEW
function remove(id) {
  confirm.require({
    message: 'Delete this goal?', header: 'Delete goal', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: () => emit('delete', id)
  })
}
```

`TripArchiveView.vue` — two sites. The archive confirm:

```js
// OLD
async function doArchive() {
  if (!confirm('Archive this trip? This will lock editing and revoke all participant links.')) return
  await store.archive(tripId, { notes: notesDraft.value || null, photo_links: [] })
  syncDraftsFromStore()
}
// NEW
function doArchive() {
  confirm.require({
    message: 'Archive this trip? This will lock editing and revoke all participant links.',
    header: 'Archive trip', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Archive', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await store.archive(tripId, { notes: notesDraft.value || null, photo_links: [] })
        syncDraftsFromStore()
        notify.success('Trip archived')
      } catch (e) { notify.error(e.message) }
    }
  })
}
```

The clone `prompt()` becomes an inline field (add `import InputText from 'primevue/inputtext'` and `import Button from 'primevue/button'`):

```js
// OLD
async function cloneTrip() {
  const name = prompt('Name for the new trip:')
  if (!name) return
  const newId = await store.clone(tripId, name)
  router.push(`/trips/${newId}`)
}
// NEW
const cloneName = ref('')
async function cloneTrip() {
  if (!cloneName.value.trim()) return
  try {
    const newId = await store.clone(tripId, cloneName.value.trim())
    notify.success('Trip cloned')
    router.push(`/trips/${newId}`)
  } catch (e) { notify.error(e.message) }
}
```

Template: find the existing clone button and replace with:

```html
<div class="field">
  <label for="clone-name">Name for the new trip</label>
  <InputText id="clone-name" v-model="cloneName" fluid />
</div>
<Button label="Clone trip" :disabled="!cloneName.trim()" @click="cloneTrip" />
```

- [ ] **Step 5: Run — must pass.** `npm test --workspace=web -- src/no-raw-confirm.test.js` → offenders `[]`. Also run any existing tests touching these components.

- [ ] **Step 6: Commit + release claim**

```bash
git add web/src/components/DestinationPanel.vue web/src/components/DocumentList.vue web/src/components/ParticipantDocs.vue web/src/components/GoalsEditor.vue web/src/views/TripArchiveView.vue web/src/no-raw-confirm.test.js .agent-coordination/claims/U11.claim
git commit -m "feat(U11): replace raw confirm/prompt with PrimeVue confirm + toasts, invariant test"
```

### Task U12: TripsListView — loading skeleton, empty state, polish

**Files:**
- Modify: `web/src/views/TripsListView.vue`

**Interfaces:**
- Consumes: `useNotify` (U3), `EmptyState` (U5), PrimeVue Button/Skeleton/Tag.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Claim U12** (wave-1 gate check).

- [ ] **Step 2: Edit `web/src/views/TripsListView.vue`.** Script:

```js
// OLD
import { computed, onMounted } from 'vue'
import { useTripsStore } from '../stores/trips.js'

const store = useTripsStore()
// NEW
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useTripsStore } from '../stores/trips.js'
import { useNotify } from '../composables/useNotify.js'
import EmptyState from '../components/EmptyState.vue'

const store = useTripsStore()
const router = useRouter()
const notify = useNotify()
const loading = ref(true)
```

```js
// OLD
onMounted(() => { store.fetchTrips() })
// NEW
onMounted(async () => {
  try { await store.fetchTrips() } catch (e) { notify.error(e.message) } finally { loading.value = false }
})
```

Template — replace body:

```html
<template>
  <main class="page">
    <h1>Trips</h1>
    <Button label="New trip" icon="pi pi-plus" @click="router.push('/trips/new')" />

    <div v-if="loading" class="card" style="margin-top: 1rem">
      <Skeleton v-for="i in 3" :key="i" height="2rem" style="margin-bottom: 0.5rem" />
    </div>

    <EmptyState v-else-if="!store.trips.length" icon="pi pi-map" message="No trips yet — plan your first one." cta-label="New trip" @cta="router.push('/trips/new')" />

    <section v-for="group in grouped" :key="group.status" class="trips-group">
      <h2><Tag :value="group.status" severity="secondary" /></h2>
      <RouterLink v-for="trip in group.trips" :key="trip.id" :to="{ name: 'trip', params: { id: trip.id } }" class="card trip-card">
        <h3>{{ trip.name }}</h3>
        <p v-if="trip.destination">{{ trip.destination }}</p>
        <p v-if="trip.start_date || trip.end_date">{{ trip.start_date }} – {{ trip.end_date }}</p>
        <p>{{ trip.participant_count }} participant(s)</p>
      </RouterLink>
    </section>
  </main>
</template>
```

Delete the `.trips-error` scoped rule (error card removed).

- [ ] **Step 3: Verify.** No dedicated test file for this view (pure presentational change); run the suite's existing store tests + a scoped smoke:

```bash
npm test --workspace=web -- src/stores/trips.test.js
```

Expected: PASS. Then `npm run dev --workspace=web` → `/` shows skeleton → list; with an empty DB, the EmptyState + CTA.

- [ ] **Step 4: Commit + release claim**

```bash
git add web/src/views/TripsListView.vue .agent-coordination/claims/U12.claim
git commit -m "feat(U12): trips list loading/empty states + polish"
```

---

## Wave 3

**Gate:** all wave-2 claims (U6–U12) `status: done` + commits present.

### Task U13: AppNav → PrimeVue Menubar

**Files:**
- Modify: `web/src/components/AppNav.vue`

**Interfaces:**
- Consumes: PrimeVue Menubar/Button (U1).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Claim U13** (wave-2 gate check).

- [ ] **Step 2: Replace `web/src/components/AppNav.vue`:**

```vue
<template>
  <Menubar :model="items" class="app-nav">
    <template #item="{ item, props }">
      <RouterLink :to="item.route" class="app-nav-link" v-bind="props.action">{{ item.label }}</RouterLink>
    </template>
    <template #end>
      <Button label="Logout" severity="secondary" text @click="onLogout" />
    </template>
  </Menubar>
</template>

<script setup>
import { useRouter } from 'vue-router'
import Menubar from 'primevue/menubar'
import Button from 'primevue/button'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

const items = [
  { label: 'Trips', route: '/' },
  { label: 'People', route: '/people' }
]

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-nav { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
.app-nav-link {
  color: #1a1a1a;
  text-decoration: none;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  display: inline-block;
}
.app-nav-link.router-link-active { color: #2563eb; }
</style>
```

- [ ] **Step 3: Verify.** `npm run dev --workspace=web` → nav renders on `/`, active link highlighted, collapses to hamburger on narrow viewport, logout works. Run `npm test --workspace=web -- src/stores/auth.test.js` (PASS).

- [ ] **Step 4: Commit + release claim**

```bash
git add web/src/components/AppNav.vue .agent-coordination/claims/U13.claim
git commit -m "feat(U13): AppNav via PrimeVue Menubar"
```

### Task U14: Integration gate — CSS cleanup + full verification (SERIAL, ALONE)

**Files:**
- Modify: `web/src/assets/main.css`, `.agent-coordination/NOTES.md`; MAY touch any file for integration fixes (you run alone — verify every other claim is `status: done` first; if any isn't, STOP and wait).

**Interfaces:**
- Consumes: everything.
- Produces: phase-complete state — all suites green, build clean, e2e SMOKE OK.

- [ ] **Step 1: Claim U14.** Verify `grep -L 'status: done' .agent-coordination/claims/U*.claim` prints ONLY your fresh U14 claim. Announce start in NOTES.md.

- [ ] **Step 2: Full test pass**

```bash
npm test --workspace=web && npm test --workspace=server
```

Expected: all green (81 original web tests + ~15 new; 82 server). Any failure: fix in place (you own everything now), one commit per logical fix, message `fix(U14): <what>`.

- [ ] **Step 3: Build + e2e**

```bash
npm run build --workspace=web && node e2e/smoke.mjs
```

Expected: build clean; `SMOKE OK`. If the smoke script grips on removed markup (e.g. `.btn` selectors), update the script to the PrimeVue equivalents — that file is unowned; you may edit it in this task only.

- [ ] **Step 4: Dead-CSS cleanup in `web/src/assets/main.css`.** For each selector, keep it if ANY file still references it, delete otherwise:

```bash
for cls in btn btn-primary badge badge-warn badge-ok field card table page; do
  echo "== $cls: $(grep -rl "\b$cls\b" web/src --include='*.vue' | wc -l) files"
done
```

Expected survivors: `.page`, `.card`, `.field`, `.table` (still used by unmigrated views: checklists, readiness, participant); likely survivors `.btn`/`.badge` (participant-facing views weren't migrated). Delete ONLY selectors with zero references. Do not restyle anything.

- [ ] **Step 5: Manual E2E of the headline flows** (dev server + browser):
  1. Wizard: fill step 1 → refresh → restored; step 4 → "Add new person" → create → returned to wizard step 4 with new person listed; create trip → toast + redirect.
  2. Trip overview: edit name, navigate to Budget tab → confirm dialog appears; Stay → still on overview.
  3. Budget: edit a line, refresh → edit survives; Save → toast, draft cleared.
  4. 401: clear session cookie, click anything → lands on `/login?redirect=…`; log in → returned.

- [ ] **Step 6: Close the phase.** Append to `.agent-coordination/NOTES.md`:

> timestamp · agent id · **PHASE 2 COMPLETE.** U1–U14 done. Web <N>/<N>, server 82/82, build clean, SMOKE OK. No orchestrator active; repo open for follow-up work under AGENTS.md.

- [ ] **Step 7: Final commit**

```bash
git add web/src/assets/main.css e2e/smoke.mjs .agent-coordination/NOTES.md .agent-coordination/claims/U14.claim
git commit -m "chore(U14): CSS cleanup + phase-2 integration verification"
```

---

## Self-review record (plan author)

- Spec coverage: useDraft→U2; toasts/confirm→U1/U3/U8–U11; loading/empty→U5/U7/U8/U9/U10/U12; 401→U4; wizard validation+stepper→U6; flow table rows: wizard→U6, person→U7, basics→U8, budget→U9, itinerary→U10; wayfinding headers→U8/U9/U10; UI refinement (Button/Tag/Menubar)→U7/U8/U9/U10/U12/U13; CSS cleanup + e2e audit→U14. `copyLink` feedback→U8. All 7 confirm() sites: TripDetailView→U8, PersonDetailView→U7, remaining 5 (incl. prompt())→U11.
- Deviations from spec, deliberate: native date inputs (JSON-serializable drafts); budget split into two draft keys (independent Save buttons); 401 listener lives in router.js (client.js stays framework-free via event).
- Type consistency: `useDraft` returns `{ draft, isDirty, clear, load, teardown }` — usage in U6–U10 matches; `useNotify` `{ success, error }` — matches; `EmptyState` props `icon/message/ctaLabel` + `cta` event — matches; claim/wave mechanics consistent with AGENTS.md §3.
