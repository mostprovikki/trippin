# Next steps: Zoho Catalyst + Supabase migration

Status: pre-plan — this is a scoping/checklist document, **not** an implementation plan.
Read this, then write the actual task-by-task plan (per `superpowers:writing-plans`) once
the items below are resolved or explicitly deferred.

**Read first:** `docs/superpowers/specs/2026-07-30-zoho-supabase-deployment-design.md`. It
records the architecture decision (AppSail for the API, Supabase Postgres for the DB, Zoho
Stratus for file storage, Slate for the frontend, auth unchanged) and what's already been
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
- Tripper doesn't have its own Supabase project yet — the pooler-host DNS fix was verified
  against a different app's project, hostname only. Creating Tripper's own project and its
  real connection string is still pending.
- Three throwaway spike resources are still sitting on the real Catalyst project
  (`payloadSpike` function, `spikeappsail` AppSail instance, one test PDF in the `tripper`
  Stratus bucket) — decide whether to clean these up before or after the real build starts.

## 2. Things nobody has checked yet at all

- **How does AppSail actually receive environment variables / secrets?** The Supabase
  connection string, `JWT_SECRET`, LLM API keys, etc. all need to reach the running process
  somehow. Not researched this session — check Catalyst's docs and/or just try it against
  the existing spike AppSail instance before assuming a mechanism.
- **Does AppSail terminate TLS for you**, or does it hand you plain HTTP the way the current
  Oracle/docker-compose setup does (where a separate reverse proxy handles HTTPS)? The
  README's current "the app never terminates TLS itself" assumption may or may not still
  hold — check before assuming either way.
- **What does the AppSail deployment config actually look like** for the real app (not the
  spike) — memory allocation, any health-check path, `app-config.json`/`catalyst-config.json`
  contents, how a Docker-image deploy differs operationally from the source+command mode the
  spike used. The spike used the simplest possible mode; the real app may want the Docker
  image path instead, given it already has a working multi-stage `Dockerfile`.
- **Cookie/session behavior through Catalyst's gateway** — the organizer login flow relies on
  an httpOnly cookie (`tp_session`). Confirm cookies round-trip correctly through whatever
  proxying AppSail/API Gateway does, rather than assuming it's transparent.
- **Region choice** — pick a Supabase region and confirm it's sensible relative to wherever
  AppSail actually runs, for latency. Not discussed at all yet.

## 3. Mechanical migration scope (sizing, not solving)

The design doc already did a code-level read of this; treat the estimate below as a starting
point to confirm or correct, not to re-derive from scratch:

- Every route file's DB calls go from synchronous (`better-sqlite3`) to async (`pg` via the
  Supavisor pooler) — touches all ~13 files under `server/src/routes/`.
- `?`-positional SQL placeholders need to become `$1, $2, ...`.
- The one existing `db.transaction(...)` usage (`trips.routes.js`, date windows) needs a
  small async transaction helper — confirm whether any *other* route relies on
  better-sqlite3's implicit synchronous consistency in a way that isn't obvious from a
  first read (e.g. read-after-write within one handler).
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
