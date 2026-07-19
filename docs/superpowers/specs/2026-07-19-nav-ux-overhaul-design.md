# Nav + UX Overhaul — Design

**Date:** 2026-07-19
**Status:** Approved approach A (nested-route app shell + theme system)
**Scope:** Frontend only (`web/`). API contract unchanged. No legacy URL compatibility — app is pre-launch, break freely.

## Problem

Navigation was bolted on per-ticket: `TripTabs` rendered only on the Overview view; Budget/Itinerary/Checklists/Readiness/Archive were flat, disconnected routes with duplicated page shells and no way back except browser history. Overview crammed basics, dates, goals, destination, and participants into one long page. Visual identity was inconsistent (green buttons, blue links/tabs). Verification was test-driven, so cross-section navigation gaps were invisible.

## Goals

1. Navigation structurally baked in: a trip section **cannot exist** outside the trip shell.
2. Every screen reachable from every other in ≤2 clicks; always a visible way back.
3. Glanceable Overview dashboard; each piece of info has exactly one home.
4. One cohesive warm-travel visual identity from theme tokens, not per-component CSS.
5. Participant share-link page mobile-first (it's what most invitees see).
6. UI verified by driving the real app in a browser and reviewing screenshots — not by test output alone.

## Information architecture

```
/login               Login (bare)
/                    Trips — card grid grouped by status
/trips/new           Trip wizard (kept, restyled)
/people              People list
/people/:id          Person detail
/p/:token            Participant page (bare, mobile-first)
/trips/:id           TripLayout (parent route, persistent shell)
  ├─ (default) overview     Dashboard
  ├─ dates                  Date windows editor
  ├─ destination            Candidates + decide
  ├─ goals                  Goals editor
  ├─ people                 Participants + share links (moved out of Overview)
  ├─ budget                 Budget
  ├─ itinerary              Itinerary
  ├─ checklists             Checklists
  ├─ readiness              Readiness
  └─ settings               Trip basics (name/desc/origin/vibes), status control, archive/clone
```

Old flat routes (`trip-budget` etc.) and the standalone Archive view are deleted. Child route names: `trip-overview`, `trip-dates`, `trip-destination`, `trip-goals`, `trip-people`, `trip-budget`, `trip-itinerary`, `trip-checklists`, `trip-readiness`, `trip-settings`.

## Components

### App shell (all authenticated pages)
- `AppNav` becomes a slim top bar: brand ("Tripper" + icon) → breadcrumb → spacer → Logout.
- Breadcrumb: `Trips` on list; `Trips / <name>` inside a trip; `Trips / <name> / <Section>` on sections; `People / <name>` on person detail. Segments are links.

### TripLayout (`web/src/layouts/TripLayout.vue`)
- Fetches trip once on mount / `:id` change; owns loading (skeleton shell) and error (not-found state with link back to Trips). Provides trip via the existing `useTripsStore().current` — children stop re-fetching trip name themselves.
- Also fetches readiness summary (lightweight) to power sidebar badges and dashboard; refreshed on section navigation.
- Desktop (≥768px): 240px left sidebar + content outlet.
- Sidebar top: trip name, status `Tag`, status-advance button (Plan → Confirm → Activate; visible from every section).
- Sidebar nav, grouped:
  - Overview
  - **Plan:** Dates, Destination, Goals
  - **People:** People
  - **Logistics:** Budget, Itinerary, Checklists
  - Readiness
  - Settings
- Each item: PrimeIcon + label + optional hint badge:
  - Dates: ✓ when confirmed, else warn dot
  - Destination: ✓ when decided, else warn dot
  - People: count of unconfirmed profiles (badge, hidden at 0)
  - Checklists: overdue count (badge, hidden at 0)
  - Readiness: percent
- Mobile (<768px): sidebar becomes a sticky horizontal scrollable section rail under a compact trip header. Same items, icon+label pills, active state visible. No hamburger.
- Active section highlighted via `router-link-active`.

### Section page pattern
Every section view renders: section header (title + one-line description + primary action button, right-aligned) then content cards. No `<h1>`/`main.page` per view — the layout owns the page chrome. Consistent empty states via `EmptyState` (icon, message, CTA). Loading via `Skeleton` blocks shaped like the content.

## Pages

### Trips list `/`
Card grid (auto-fill, min 280px). Card: name, destination or "Destination TBD", date range, participant count, status tag as colored left-edge accent + tag. Hover lift. Status groups in order idea → planning → confirmed → active → archived, group headers as plain labels. "New trip" primary button in header row. Empty state kept.

### Trip Overview (dashboard)
- Hero card: trip name, destination, date range, vibe tags; status stepper (idea → planning → confirmed → active) with current highlighted.
- Stat cards (link to sections): Budget total (+currency), Readiness %, Checklist done/total, Participants confirmed/total.
- "Next actions" card: derived list from readiness data — e.g. "Confirm dates" → Dates, "Decide destination" → Destination, "2 profiles unconfirmed" → People, "3 overdue checklist items" → Checklists. Empty when trip is fully ready ("All set 🎉").
- New/empty trip: guided setup list (name it, add dates, pick destination, invite people) replacing empty stat cards.

### Dates / Destination / Goals
Existing editors (`DateWindowsEditor`, `DestinationPanel`, `GoalsEditor`) each moved to their own section page with proper header + description. Logic unchanged.

### Trip People
Participant list as cards/rows: name, profile-confirmed tag, docs count, active-link indicator; actions: create/copy/revoke share link, remove. Add-participant select + add button in section header area. The link-reveal ("shown only once") stays but styled as a highlighted callout.

### Budget / Itinerary / Checklists / Readiness
Content largely as-is, re-homed into the shell with the section-header pattern, consistent tables/cards, and skeleton loading. Budget keeps AI-draft flow. Readiness keeps decision chips/participant table/checklist progress but restyled.

### Settings
Trip basics form (name, description, origin city, vibe tags) with save; status control (same advance action as the sidebar quick button, plus explanation of the lifecycle — sidebar is the shortcut, Settings is the authoritative home); archive + clone actions (from old Archive view) with confirm dialogs. Draft persistence (`useDraft`) and route-leave guards kept.

### Participant page `/p/:token`
Mobile-first single column, max-width 480px centered on desktop. Trip hero (name, destination, dates, vibe tags, description). 3-step progress header — 1 Profile, 2 Documents, 3 Checklist — each step a card with completion tick; steps collapsible, current step expanded. Invalid-link state kept.

## Visual identity

- PrimeVue `definePreset(Aura, …)` in `main.js` (or `web/src/theme.js`): primary = deep teal scale (600 ≈ `#0f766e`), warm amber for warn/highlights, warm off-white surface (`#faf9f7` body), neutral warm grays.
- `main.css` reduced to: reset, typography scale, `--app-*` layout tokens (radius 8/12px, shadow sm/md, content max-width), utilities actually used. Legacy `.btn`, `.table`, `.badge` utilities deleted after all usages converted to PrimeVue (`Button`, `DataTable`, `Tag`).
- Links, active nav, buttons all inherit primary teal — kills green/blue split.
- All type from existing system font stack; scale: 24/18/16/15/13.

## Data flow

- `TripLayout` → `useTripsStore.fetchTrip(id)` + `useReadinessStore.fetch(id)`; children read stores.
- Sidebar badges + dashboard read the same readiness store — one source.
- Readiness store refreshed after mutations that affect it only via section navigation (cheap endpoint; no websocket/polling).
- Draft persistence (`useDraft`) and `onBeforeRouteLeave` guards unchanged, but guards now also fire on sidebar navigation (same router mechanism — works for free).

## Error handling

- TripLayout: 404/error → friendly "Trip not found" panel + link to Trips.
- Sections keep toast-on-error (`useNotify`) pattern.
- Participant page keeps invalid-link message.

## Testing & verification

- Update router/view unit tests for nested routes; add `TripLayout` tests (renders sidebar, active state, badges from store data).
- `e2e/smoke.mjs` stays green (API untouched).
- **Browser click-through (required, not optional):** playwright-core script — login → create trip via wizard → visit every section via sidebar → breadcrumb back to Trips → participant link at 375px viewport. Screenshot every screen; screenshots reviewed visually before claiming done. Failures here block completion regardless of test results.

## Process rules (carry-forward)

Added to AGENTS.md as part of this work:
1. Every new view renders inside a shared layout with persistent nav + a way back. No bare flat routes (login/participant token pages exempt).
2. UI change isn't done until the golden path is click-driven in a real browser and screenshots reviewed. Tests passing ≠ done.

## Out of scope

- Backend/API changes, dark mode, offline, i18n, drag-drop itinerary upgrades, People list redesign beyond shell/theme consistency.
