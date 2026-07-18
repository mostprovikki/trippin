# Tripper — Usability & State-Maintenance Design

Date: 2026-07-19
Status: approved (design), pending implementation plan
Scope: Focused — in-progress state persistence + top usability/robustness fixes.

## Problem

The app is functionally solid at the API/store layer (82 server tests, 81 web
tests, and the full e2e smoke pass; web builds clean; server serves the SPA).
The gaps are all in the UI/UX layer:

1. **No state maintenance anywhere.** Confirmed by inspection: zero
   `localStorage`/`sessionStorage`, zero `route.query`-backed draft state.
   Every multi-step or edit flow keeps state in ephemeral component/Pinia refs,
   so a refresh, back/forward, accidental navigation, a 401, or closing the tab
   silently destroys in-progress work. The `TripWizard` "Add new person" link is
   the worst case: it navigates to `/people` and destroys the entire wizard.
2. **Inconsistent, quiet feedback.** Errors render as ad-hoc red `store.error`
   cards; success is invisible (e.g. `copyLink` swallows failures — no "Copied"
   confirmation). Destructive actions use raw browser `confirm()`.
3. **Blank/uninformative screens.** Views show nothing while `onMounted` loads
   and nothing meaningful when lists are empty. `TripDetailView` header is a
   generic `<h1>Trip</h1>` with no name/status wayfinding.
4. **Harsh 401 handling.** `client.js` does `location.assign('/login')` — a full
   page reload that discards SPA state and (soon) any in-progress drafts.
5. **Weak wizard validation.** Only the name `<input>` has `required`; `Next`
   never validates, so a user can reach step 4 with an empty name and fail
   server-side.

Out of scope (deferred to separate plans): dark mode; autosave-on-every-field;
rich mock/demo data; comprehensive per-screen audit.

## Goals

- No in-progress work is lost to refresh, back/forward, navigation, 401, or tab
  close, for the focused flow set below.
- Position/mode is shareable and restorable via the URL where it makes sense.
- Consistent, calm feedback for errors, success, and destructive confirmation.
- No blank screens: loading and empty states everywhere in the focused set.
- Explicit Save buttons stay; drafts are a safety net, not a behavior change.

## Architecture

### 1. `useDraft` composable — the reusable state mechanism

`web/src/composables/useDraft.js`. One tested unit; each flow adopts it in a few
lines. Hybrid persistence per the chosen model:

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
  draft; then overlay URL-query fields (URL wins for position). A stored draft
  for a *different* entity id must not bleed across — key includes the id.
- **Persistence:** deep-watch `draft`; debounce-write bulk fields to
  localStorage; write `urlFields` to `route.query` via `router.replace` (no
  history spam).
- **`isDirty`:** true when `draft` differs from the last-cleared/loaded baseline.
- **`clear()`:** remove the localStorage key and strip our query fields; reset
  baseline. Call on successful submit/save.
- **Leave guard:** register `beforeunload` (native browser prompt) while dirty;
  expose a helper the host view wires into `onBeforeRouteLeave` to confirm before
  discarding. Guard is removed after `clear()` and on unmount.

Key namespace: `tripper:draft:<flow>[:<id>]`, e.g. `tripper:draft:trip-new`,
`tripper:draft:person-new`, `tripper:draft:trip:<id>:basics`,
`tripper:draft:trip:<id>:budget`.

### 2. Toast notifications — `useToast`

`web/src/composables/useToast.js` + `web/src/components/ToastHost.vue` mounted
once in `App.vue`. `toast.success(msg)`, `toast.error(msg)`, auto-dismiss,
stackable, dismissible, `aria-live="polite"`. Replaces scattered `store.error`
cards and adds success feedback (save OK, "Link copied", etc.). Store `error`
state remains the source; views surface it via toast instead of bespoke cards.

### 3. Confirm dialog — `ConfirmDialog.vue` + `useConfirm`

A calm modal replacing raw `confirm()`. `await confirm({ title, message,
danger })` resolves boolean. Focus-trapped, Esc-to-cancel, backdrop click
cancels. Used for participant removal, link revoke, discard-draft.

### 4. Loading & empty states

Small `Spinner.vue` / skeleton and an `EmptyState.vue` (icon + message +
optional CTA). Each focused view tracks a `loading` flag around its `onMounted`
fetch and renders spinner → content → empty state.

### 5. Graceful 401

`client.js`: on 401, instead of `location.assign('/login')`, use the router to
`push('/login?redirect=<current path+query>')`. `LoginView` honors `redirect` on
success. Drafts in localStorage survive; the user returns to where they were.
(The client imports the router instance, or dispatches an event the app listens
for, to avoid a hard reload.)

## Application to the focused flow set

| Flow | URL fields | localStorage draft | Extra |
|------|-----------|--------------------|-------|
| **TripWizard** | `step` | full `form` + `windows` | per-step validation; "Add new person" is safe via draft-and-restore — the wizard draft persists, so it links to `/people?new=1&return=/trips/new` and Person "Create" routes back to the wizard, which rehydrates at `step=4` with the new person selectable |
| **Person create/edit** | `new=1` / `edit=1` | `PersonForm` fields | leave guard |
| **Trip Overview basics** | — | `basics` fields | dirty tracking + leave guard; Save stays |
| **Budget** | — | `localLines` + unsaved override rows | dirty tracking + leave guard; Save stays |
| **Itinerary** | — | unapplied AI `draft` | refresh no longer discards an ungenerated/unapplied AI draft |

Wayfinding fixes ride along: `TripDetailView`, itinerary, and budget headers show
the real trip name + status badge instead of generic titles.

## Error handling

- All API errors → `toast.error` with the server message (already normalized by
  `ApiError`). Remove per-view red `store.error` cards once toast covers them.
- Draft writes are best-effort: a `localStorage` failure (quota/private mode) is
  caught and ignored — never blocks editing.
- Leave guard is the only place we intentionally interrupt the user.

## Testing

- **`useDraft`** (Vitest + happy-dom): hydration precedence (factory < local <
  URL), debounce write, id-scoped isolation (no cross-entity bleed), `isDirty`
  transitions, `clear()` removes key + query, guard registered/removed.
- **`useToast` / `useConfirm`**: queue/dismiss; confirm resolves true/false.
- **Component tests**: wizard restores `step` + fields from URL+storage after
  remount; can't advance past Basics without a name; budget/basics restore
  unsaved edits after remount; 401 pushes to `/login?redirect=…`.
- Existing 82+81+e2e suites must stay green (no store/API contract changes).

## Rollout order (for the implementation plan)

1. `useDraft` + tests (foundation).
2. `useToast` + `ToastHost` + `useConfirm`/`ConfirmDialog` + `Spinner`/`EmptyState`.
3. Graceful 401 + `LoginView` redirect.
4. Adopt in TripWizard (highest impact) — incl. validation + "add person" fix.
5. Adopt in Person form, Trip Overview, Budget, Itinerary draft.
6. Wayfinding headers + loading/empty states across the focused views.
