# v0 — working prototype UI baseline

Captured **2026-07-25** from the working prototype, before any redesign. Purpose:
a fixed reference to diff a later UI pass against.

## Capture conditions (reproduce these for v1, or the comparison is unfair)

| | |
|---|---|
| Viewport | 1512 × 945 logical px (a maximised Chrome window on a 3024×1964 Retina display) |
| Device scale | 2× — PNGs are 3024 × 1890 |
| Themes | `light` and `dark`, driven by OS `prefers-color-scheme` in a fresh browser context (no in-app toggle, so no mid-transition frames) |
| Browser | headless Chromium via playwright-core |
| Scrollbars | hidden (`--hide-scrollbars`) so they don't show up as a diff |

## How to re-capture

```bash
# 1. servers up: Vite on :43100, API on :43101 (both derived from PORT_BASE in .env)
npm run dev
# 2. seed the demo data
node e2e/seed-demo.mjs
# 3. capture into a NEW version dir — do not overwrite v0, it is the baseline
node e2e/capture-screenshots.mjs e2e/baseline/v1
```

Ports were `:3100`/`:5174` when v0 was captured, before local dev moved onto this
repo's allocated block (`PORT_BASE=43100`). That change does not affect the captures
themselves, but the commands above would not work as originally written.

Both scripts live in `trip-planner/e2e/`. `capture-screenshots.mjs` prints a
warning for any screen that came out blank, spinner-only, or in the wrong theme —
a clean run reports none.

## Naming

`<nn>-<screen>--<theme>.png`, plus `--fullpage` for screens taller than the
window (the viewport frame shows what a user actually sees on arrival; the
fullpage frame preserves everything below the fold).

## Seed data behind these shots

Four trips covering every status, so the trips list and the sidebar states aren't
empty:

- **Vietnam & Cambodia 2026** — `confirmed`, the flagship: destination decided
  from 4 candidates, dates 2026-11-06 → 11-15, 5 goals, 6 participants (4 of 6
  profiles confirmed), 8 budget lines (₹970,300) + 2 per-person overrides,
  10 itinerary days / 44 items, 2 checklists (13 of 22 done, 2 overdue),
  **readiness 88%** — deliberately not 100%, so pending rows are visible
- **Ladakh Overland Expedition** — `idea`: 3 undecided candidates, 3 date windows
- **Kerala Backwaters Reunion** — `active`
- **Bali Family Escape** — `archived`, with recorded actuals

7 people, fully populated, with 7 uploaded documents — expiries staged so one is
**expired** and two are in **warning** range (Priya Iyer's detail screen shows
both).

## Coverage

Every route in `web/src/router.js`, in both themes: login, trips list, command
palette (⌘K), new-trip, all 10 flagship trip sections, the idea/active/archived
trip variants, people list, person detail, search results, 404, and the public
participant view in both confirmed and pending states.

Not included: mobile/tablet breakpoints, hover/focus states, form validation
states, and modal dialogs beyond the command palette.
