# Tripper — Usability & State-Maintenance Design (rev 2)

Date: 2026-07-19
Status: approved (design), pending implementation plan
Rev 2: adopt PrimeVue component lib instead of hand-rolled UI primitives;
added UI-refinement phase. Verified against code 2026-07-19: all problem
claims accurate (zero localStorage use, 7 raw `confirm()` sites,
`location.assign('/login')` on 401, generic `<h1>Trip</h1>` headers,
wizard `next()` never validates).
Scope: in-progress state persistence + top usability/robustness fixes +
UI polish via component lib.

## Problem

App functionally solid at API/store layer (82 server tests, 81 web
tests, full e2e smoke pass; web builds clean; server serves SPA).
Gaps all in UI/UX layer:

1. **No state maintenance anywhere.** Zero `localStorage`/`sessionStorage`,
   zero `route.query`-backed draft state. Every multi-step edit flow keeps
   state in ephemeral component/Pinia refs, so refresh, back/forward,
   accidental navigation, 401, closing tab silently destroys in-progress
   work. `TripWizard` "Add new person" link worst case: navigates `/people`,
   destroys entire wizard.
2. **Inconsistent, quiet feedback.** Errors render ad-hoc red `store.error`
   cards; success invisible (e.g. `copyLink` swallows failures — no "Copied"
   confirmation). Destructive actions use raw browser `confirm()` (7 sites).
3. **Blank/uninformative screens.** Most views show nothing while `onMounted`
   loads, nothing meaningful when lists empty (only `ParticipantView` +
   `TripArchiveView` track `loading`). `TripDetailView` header generic
   `<h1>Trip</h1>` — no name/status wayfinding.
4. **Harsh 401 handling.** `client.js` does `location.assign('/login')` — full
   page reload discards SPA state and (soon) any in-progress drafts.
5. **Weak wizard validation.** Only name `<input>` `required`; `Next`
   never validates, so user can reach step 4 with empty name, fail
   server-side.
6. **(New in rev 2) Homegrown UI at floor level.** ~100 lines custom CSS,
   no component lib, plain-HTML controls everywhere. Original design
   proposed hand-building Toast/ConfirmDialog/Spinner/EmptyState —
   reinventing wheels a mature lib ships tested + accessible.

Out of scope (deferred): dark mode; autosave-on-every-field server-side;
rich mock/demo data.

## Rev-2 decision: PrimeVue 4 as component lib

Deps: `primevue` + `@primevue/themes` (Aura preset) + `primeicons`.

Why PrimeVue over alternatives:
- **ToastService + ConfirmationService** — exact services the original design
  hand-rolled (`useToast`, `useConfirm`), shipped, tested, `aria-live` /
  focus-trap correct.
- **Stepper** — replaces the wizard's DIY badge-row step indicator.
- **Skeleton / ProgressSpinner / Message** — loading + inline states.
- **DatePicker, InputText, Textarea, RadioButton, Checkbox, Select,
  Button, Tag, Card, Dialog, DataTable** — covers every control the
  focused flows use.
- Plain-JS friendly (app isn't TS), tree-shakable per-component imports,
  no Tailwind prerequisite (rules out shadcn-vue/reka-ui), lighter footprint
  than Vuetify, more complete services than Naive UI (no confirm service
  there).

Adoption model: **incremental** — PrimeVue mounts as plugin alongside
existing plain-HTML markup; old `.btn`/`.card`/`.field` CSS keeps working.
Focused flows migrate; untouched views keep current markup until later.
Aura theme CSS vars become source of truth for color; existing
`main.css` shrinks to layout helpers (`.page`) over time.

## Architecture

### 1. `useDraft` composable — reusable state mechanism (custom, no lib equivalent)

`web/src/composables/useDraft.js`. One tested unit; each flow adopts in few
lines. Hybrid persistence:

- **Bulk fields → `localStorage`** (namespaced key, debounced ~400ms write).
  Survives refresh *and* tab-close/crash.
- **Navigation-critical fields → URL query** (wizard `step`, active panel,
  `new`/`edit` mode). Survives back/forward/refresh; shareable.

API:

```
const { draft, isDirty, clear, syncQuery } = useDraft(key, factory, {
  urlFields: ['step'],   // mirrored to route.query; everything else → localStorage
  router, route,         // passed in for testability
})
```

Behavior:
- **Hydration on mount:** start from `factory()`; overlay localStorage bulk
  draft; then overlay URL-query fields (URL wins for position). Stored draft
  for *different* entity id must not bleed across — key includes id.
- **Persistence:** deep-watch `draft`; debounce-write bulk fields to
  localStorage; write `urlFields` to `route.query` via `router.replace` (no
  history spam).
- **`isDirty`:** true when `draft` differs from last-cleared/loaded baseline.
- **`clear()`:** remove localStorage key, strip our query fields, reset
  baseline. Call on successful submit/save.
- **Leave guard:** register `beforeunload` (native browser prompt) while dirty;
  expose helper host view wires into `onBeforeRouteLeave` → PrimeVue
  ConfirmationService confirm before discarding. Guard removed after
  `clear()` and on unmount.

Key namespace: `tripper:draft:<flow>[:<id>]`, e.g. `tripper:draft:trip-new`,
`tripper:draft:person-new`, `tripper:draft:trip:<id>:basics`,
`tripper:draft:trip:<id>:budget`.

### 2. Feedback — PrimeVue services (was: hand-rolled useToast/ConfirmDialog)

- `main.js`: register `PrimeVue` plugin (Aura preset), `ToastService`,
  `ConfirmationService`. `App.vue`: mount `<Toast />` + `<ConfirmDialog />`
  once.
- Success/error feedback: PrimeVue `useToast().add({ severity, summary,
  life })`. Thin wrapper `web/src/composables/useNotify.js` (`notify.success`
  / `notify.error`) so call sites stay one-liners and severity/life defaults
  live in one place.
- Destructive actions: replace all 7 raw `confirm()` sites with PrimeVue
  `useConfirm().require({...})` — focus-trapped, Esc-to-cancel, styled.
- Remove per-view red `store.error` cards once toasts land.

### 3. Loading & empty states — PrimeVue Skeleton + thin EmptyState

- Loading: PrimeVue `Skeleton` rows for list views, `ProgressSpinner` for
  detail views. Each focused view tracks `loading` flag around `onMounted`
  fetch → skeleton → content → empty state.
- Empty: tiny `EmptyState.vue` wrapper (primeicons icon + message + optional
  CTA Button) — PrimeVue has no dedicated empty component; this is
  composition, not wheel-reinvention.

### 4. Graceful 401

`client.js`: on 401, instead of `location.assign('/login')`, emit
`auth:unauthorized` event; app-level listener does router
`push('/login?redirect=<current path+query>')`. `LoginView` honors
`redirect` on success. Drafts in localStorage survive; user returns
where they were. (Event, not router import, keeps client.js
framework-free + testable.)

### 5. Wizard — PrimeVue Stepper + per-step validation

`TripWizard` DIY badge row → PrimeVue `Stepper`/`StepList`/`StepPanels`.
`next()` validates current step before advancing (step 1: name required;
step 2: dates coherent for mode); inline `Message severity="error"` for
step errors. Form controls → `InputText`, `Textarea`, `DatePicker`,
`RadioButton`, `Checkbox`.

## Applied to focused flow set

| Flow | URL fields | localStorage draft | Extra |
|------|-----------|--------------------|-------|
| **TripWizard** | `step` | full `form` + `windows` | per-step validation; "Add new person" safe via draft-and-restore — wizard draft persists, so link becomes `/people?new=1&return=/trips/new` → Person "Create" routes back to wizard, rehydrates at `step=4`, new person selectable |
| **Person create/edit** | `new=1` / `edit=1` | `PersonForm` fields | leave guard |
| **Trip Overview basics** | — | `basics` fields | dirty tracking + leave guard; Save stays |
| **Budget** | — | `localLines` + unsaved override rows | dirty tracking + leave guard; Save stays |
| **Itinerary** | — | unapplied AI `draft` | refresh no longer discards ungenerated/unapplied AI draft |

Wayfinding fixes ride along: `TripDetailView`, itinerary, budget headers show
real trip name + status `Tag` instead of generic titles.

## UI refinement pass (rev 2 addition)

After the state/feedback foundation, one polish pass over the focused
flows (not whole app):

- Buttons → PrimeVue `Button` (severity variants replace `.btn`/`.btn-primary`).
- Badges → `Tag` (status colors from theme, replaces `.badge-*`).
- Cards in focused views → PrimeVue `Card` where it reduces markup.
- `AppNav` → `Menubar` (active-route highlight, mobile collapse for free).
- `BudgetTable` → keep `<table class="table">` for now (DataTable migration
  deferred — behavior-heavy, high regression risk, low usability win).
- Delete leftover custom CSS the migrated views no longer use.

## Error handling

- All API errors → toast with server message (already normalized by
  `ApiError`). Best-effort actions (`copyLink`) get explicit success/failure
  toast.

## Testing

- **`useDraft` unit (happy-dom):** hydration precedence (localStorage <
  URL), debounce write, id-scoped isolation (no cross-entity bleed),
  `isDirty` transitions, `clear()` removes key + query, guard
  registered/removed.
- **Component tests:** mount with PrimeVue plugin + services in test config
  (shared `test-utils` mount helper so per-test boilerplate stays zero);
  wizard restores `step` + fields from URL+storage after remount; can't
  advance past Basics without a name; budget/basics restore unsaved edits
  after remount; 401 pushes to `/login?redirect=…`.
- Existing 82+81+e2e suites must stay green (no store/API contract changes).
  E2e selectors that grip on `.btn`/`confirm()` need audit — PrimeVue
  markup differs.

## Rollout order (for the implementation plan)

1. PrimeVue install + plugin registration + Aura theme + shared test mount
   helper; smoke: existing suites still green.
2. `useDraft` + tests (foundation, lib-independent).
3. Feedback: `<Toast />` + `useNotify` + ConfirmationService; replace 7
   `confirm()` sites + `store.error` cards; `copyLink` feedback.
4. Graceful 401 + `LoginView` redirect.
5. TripWizard: Stepper + PrimeVue controls + per-step validation + draft
   adoption + "add person" round-trip fix (highest impact).
6. Adopt draft in Person form, Trip Overview basics, Budget, Itinerary.
7. Loading/empty states + wayfinding headers across focused views.
8. UI refinement pass (Buttons/Tags/Menubar/Card) + CSS cleanup.
