# Next steps: Zoho Catalyst + Neon migration

(Revised 2026-08-01: database host changed from Supabase to Neon — see the design doc's
§3.4 for the rationale. Filename kept for link stability.)

Status: **superseded 2026-08-01** — the implementation plan now exists:
`2026-08-01-neon-appsail-migration-plan.md`. Everything below is either resolved (marked
inline), encoded in that plan, or explicitly deferred there. Kept as the record of what was
checked and decided.

**Read first:** `docs/superpowers/specs/2026-07-30-zoho-supabase-deployment-design.md`. It
records the architecture decision (AppSail for the API, **Neon** Postgres for the DB —
revised from Supabase 2026-08-01, see its §3.4 — Zoho Stratus for file storage, Slate for
the frontend, auth unchanged) and what's already been
verified live vs. only documented vs. still open. Don't re-derive any of that — this doc
picks up where it left off.

This deliberately does not prescribe exact solutions — it says what to check and what
question to answer, not how to answer it. Some of these may already have an obvious answer
once you look; others may need a small spike the same way the design doc's spikes were done
(deploy something small against the real `project-rainfall` Catalyst project and observe,
don't reason from docs alone when the docs have already proven incomplete once).

## 1. Things the design doc left open

- AppSail's actual GB-hour usage under real traffic is unverified — the 15 GB-hour free tier
  assumption is a judgment call. Worth instrumenting or at least estimating early.
- Slate (frontend hosting) was never hands-on verified this session — deploy the real built
  `web/dist` (or even a placeholder) and confirm it actually serves and routes correctly
  (SPA fallback routing in particular — does Slate need config for that, the way most static
  hosts do?).
- ~~Tripper doesn't have its own Neon project yet.~~ **DONE 2026-08-01** — project created
  (`us-east-2`), spike run from the real AppSail instance, all green: wss connectivity (both
  hosts), nested-savepoint transaction PASS, node22 stack + native WebSocket. Full results
  in the design doc §3.4. Connection strings live in `server/.env.spike` (git-ignored).
- Three throwaway spike resources are still sitting on the real Catalyst project
  (`payloadSpike` function, `spikeappsail` AppSail instance, one test PDF in the `tripper`
  Stratus bucket) — decide whether to clean these up before or after the real build starts.

## 2. Things nobody has checked yet at all

- ~~How does AppSail actually receive environment variables / secrets?~~ **VERIFIED
  2026-08-01**: `app-config.json` → `env_variables` map lands in `process.env` on the
  deployed instance (both Neon connection strings arrived). Note: the values sit in
  plaintext in `app-config.json`, so that file must stay out of git for the real app.
- ~~Does AppSail terminate TLS for you?~~ **VERIFIED 2026-08-01**: yes — app listens plain
  HTTP on `X_ZOHO_CATALYST_LISTEN_PORT`, public URL is HTTPS. Current "app never terminates
  TLS" assumption holds unchanged.
- **What does the AppSail deployment config actually look like** for the real app (not the
  spike) — memory allocation, any health-check path, `app-config.json`/`catalyst-config.json`
  contents, how a Docker-image deploy differs operationally from the source+command mode the
  spike used. The spike used the simplest possible mode; the real app may want the Docker
  image path instead, given it already has a working multi-stage `Dockerfile`.
- ~~Cookie/session behavior through Catalyst's gateway~~ **VERIFIED 2026-08-01**: an
  app-set `HttpOnly; SameSite=Lax` cookie passed the gateway unmodified and rode back on
  the next request. The gateway injects its own `zalb_*`/`ZD_CSRF_TOKEN` cookies alongside —
  harmless, the app ignores unknown cookies.
- ~~Region choice~~ **DONE 2026-08-01**: Neon `us-east-2`; measured ~85-100ms warm queries
  from AppSail (AppSail runs US-side), ~80ms/statement in transactions. Acceptable; noted
  that N-statement transactions cost ~N×80ms — keep hot paths to few statements.

## 3. Mechanical migration scope (sizing, not solving)

The design doc already did a code-level read of this; treat the estimate below as a starting
point to confirm or correct, not to re-derive from scratch:

- Every route file's DB calls go from synchronous (`better-sqlite3`) to async
  (`@neondatabase/serverless`, pg-compatible `Pool`/`Client` over WebSocket — WebSocket mode
  is required for interactive transactions/savepoints; don't mix in the HTTP `neon()` mode) —
  touches all ~15 files under `server/src/routes/`, ~148 `prepare()` calls.
- `?`-positional SQL placeholders need to become `$1, $2, ...`.
- **14 `db.transaction(...)` call sites across 7 route files** (not one — the design doc's
  original count was wrong; corrected there 2026-08-01): trips, itinerary ×5, destinations,
  budget ×2, checklists ×2, archive ×3. The async helper must support **savepoint nesting**
  (`itinerary.routes.js` nests transactions deliberately). Also confirm whether any route
  relies on better-sqlite3's implicit synchronous consistency in a way that isn't obvious
  from a first read (e.g. read-after-write within one handler).
- `documents.routes.js` (or wherever uploads/downloads currently touch local disk) needs to
  move to Stratus: writes go through the app, reads return a signed URL instead of proxying
  bytes — confirm every current call site that touches `UPLOADS_DIR` or serves a file.
- Decide and document the actual cutover story for existing data: is there real production
  data in the current SQLite file that needs migrating, or is this pre-launch enough that a
  fresh Postgres schema is fine? This changes whether a migration *script* is in scope at
  all versus just a fresh `CREATE TABLE` pass translated to Postgres syntax.

## 4. Decisions to make explicit in the real plan (not yet decided here)

- Whether to deploy AppSail via the existing Dockerfile (image mode) or via source+command
  (the mode the spikes used) — the design doc noted the Docker path as plausible but never
  tested it.
- Whether the Oracle VM deployment stays wired up and tested as a live fallback, or becomes
  documentation-only ("the code still runs there if needed, but nobody's actively deploying
  to it").
- Rollout order: does Postgres migration land before or after the AppSail move, or together?
  They're logically separable (either could ship first against the Oracle VM), which changes
  risk and review size per step.
