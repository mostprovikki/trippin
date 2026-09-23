# Trip Planner

A small self-hosted app for a group organizing a trip together: people directory
with documents (passports, visas, tickets), a trip wizard with shareable
participant links, a readiness dashboard, AI-assisted destination suggestions,
and a simple shared budget. See [`docs/brief.md`](docs/brief.md) for the full
product brief and non-functional requirements.

Built for a handful of people and a few trips a year — a single Node process
against Postgres (Neon in production; local Postgres for dev) is the whole
backend. File storage goes through a driver seam: local disk in dev, Zoho
Catalyst Stratus in production (see `docs/superpowers/specs/2026-07-30-zoho-supabase-deployment-design.md`).

## Quickstart

### Local development

Requires Node ≥22 and a local Postgres (see `scripts/pg-dev.mjs` — no Docker
needed; it wraps `pg_ctl` against a throwaway data dir).

```bash
cp .env.example .env      # edit JWT_SECRET at minimum
npm ci
npm run db:up              # starts local Postgres on 127.0.0.1:43105 (idempotent)
npm run build               # builds web/dist (or skip and use `npm run dev` below)
node scripts/seed-organizer.mjs <email> <password> "<Name>"
node server/src/server.js
```

Visit **http://localhost:43101** — `PORT_BASE` in `.env` defaults to `43100`, and
the server listens on `PORT_BASE + 1`. Set `PORT` to pin it somewhere else.

### Local development (hot reload)

```bash
npm ci
npm run db:up
npm run dev   # runs server (--watch) + Vite dev server together
```

Ports are derived from `PORT_BASE` (default `43100`, set in `.env` — see
`.env.example`): Vite binds `PORT_BASE` (**http://localhost:43100**, `strictPort`
so it fails instead of drifting to the next free port) and the API server
binds `PORT_BASE + 1` (**43101**). Vite proxies `/api` through to the API port.

In dev mode `web/dist` doesn't exist, so the server's static plugin steps aside
and Vite serves the SPA with hot module reload; API calls proxy through to the
server.

### Docker Compose (VM fallback)

`Dockerfile`/`docker-compose.yml` still work as a portable fallback deploy
target (see the design doc) but now need `DATABASE_URL` pointed at a real
Postgres (Neon or otherwise) via `.env` — there is no bundled/embedded DB, and
the `./data` volume in `docker-compose.yml` is no longer needed for the
database (uploads only, and only when `STORAGE_DRIVER=local`). This path
hasn't been re-verified since the Postgres migration; see
`docs/superpowers/specs/2026-07-30-zoho-supabase-deployment-design.md` before
relying on it.

## Seeding the first organizer

There's no public signup — organizer accounts are created via a script so the
app can't be opened up to strangers by accident:

```bash
node scripts/seed-organizer.mjs <email> <password> "<Name>"
```

Running it again with the same `--email` is a no-op (`ON CONFLICT DO NOTHING`) —
it does not update the password. To reset a password, do so directly against
the `organizers` table for now.

## Configuration

All configuration is a single `.env` file (see `.env.example`). No secrets or
environment-specific values belong anywhere else.

| Variable | Default | Description |
|---|---|---|
| `PORT_BASE` | `43100` | Base of this repo's allocated local port block. The Vite dev server binds `PORT_BASE`, the Node server `PORT_BASE + 1`. Single source of truth for local dev ports. |
| `PORT` | *(derived: `PORT_BASE + 1`)* | Explicit override for the Node server's port. Takes precedence over `PORT_BASE`. Docker Compose sets it to `3000` so the in-container port is fixed regardless of the host block. |
| `API_PORT` | `43101` | **Compose only** — host port mapped to the container's `3000`. Not read by the app itself. |
| `DATABASE_URL` | `postgres://tripper:tripper@127.0.0.1:43105/tripper_test` | Postgres connection string. Local dev: `npm run db:up` starts one at this address. Production: a Neon connection string. |
| `DB_DRIVER` | `pg` | `pg` (local/VM Postgres, plain TCP) or `neon` (`@neondatabase/serverless`, WebSocket-based — required for Neon/serverless environments like AppSail). |
| `UPLOADS_DIR` | `./data/uploads` | Directory where uploaded documents (passports, tickets, etc.) are stored. Never served as static files — only through authenticated API routes. |
| `JWT_SECRET` | *(none — must be set)* | Secret used to sign organizer sessions / participant tokens. Set to a random string ≥32 characters; never reuse the placeholder in production. |
| `DEFAULT_CURRENCY` | `INR` | Currency code used as the default for new trip budgets. |
| `LLM_PROVIDER` | `none` | Which LLM backend powers destination suggestions / budget drafts: `none`, `anthropic`, `openai`, or `mock`. `openai` also covers any OpenAI-compatible endpoint (e.g. Ollama) via `LLM_BASE_URL`. |
| `LLM_MODEL` | *(empty)* | Model name/id to request from the configured provider. Ignored when `LLM_PROVIDER=none`. |
| `LLM_API_KEY` | *(empty)* | API key for the configured LLM provider. Ignored for `none`/`mock`. |
| `LLM_BASE_URL` | *(empty)* | Override API base URL — used to point the `openai` driver at a self-hosted/Ollama-compatible endpoint instead of OpenAI's API. |

## HTTPS

The app never terminates TLS itself — it always runs plain HTTP on `PORT`.
Put it behind a reverse proxy (nginx, Caddy, Traefik, your cloud load
balancer, etc.) that handles HTTPS and forwards to whichever port the server is
listening on — `PORT` if set, otherwise `PORT_BASE + 1`, and `3000` inside the
Compose container.

## Backups

The database is Postgres (Neon in production — see Neon's own backup/PITR
features); uploaded documents live under `UPLOADS_DIR` locally or in Stratus
in production. See `docs/backup.md` for the current (Postgres/Neon/Stratus)
backup story.

## Smoke test

`e2e/smoke.mjs` is a dependency-free end-to-end check that boots the real
server in-process on a random port against a throwaway Postgres schema (on
the same local dev Postgres — `npm run db:up` first), then walks the full
organizer + participant golden path (seed → login → people → trip →
destination decide → confirm dates → participant link → profile/doc/checklist
as participant → budget → itinerary → readiness → archive → clone). Run it
with:

```bash
node e2e/smoke.mjs
```

It prints `SMOKE OK` and exits 0 on success, or exits 1 with the failing
assertion on error. It creates and drops its own `tp_smoke_*` schema, so it's
safe to run repeatedly against the same dev database.

## E2E gates

`e2e/` also has 12 `qa-*.mjs` browser gates (Playwright, headless Chromium)
plus `ui-walk.mjs` — each drives the real app in a browser against the dev
stack and asserts something specific (contrast, dark mode, datepicker
keynav, search, upload reset, template isolation, etc). All are wired into
npm scripts via `scripts/run-e2e.mjs`, which runs them **sequentially**
(they share one dev server + Postgres — parallel runs would collide) with a
per-gate timeout (`E2E_GATE_TIMEOUT_MS`, default 180s — measured
2026-09-23: `qa-datepicker.mjs` alone takes ~150s, so 120s killed it
mid-run) and prints a pass/fail summary, exiting non-zero if any gate
failed or timed out.

```bash
npm run test:e2e            # all 12 qa-*.mjs gates
npm run test:e2e:smoke      # smoke.mjs only (fast confidence check)
npm run test:e2e:ui-walk    # ui-walk.mjs only
npm run test:all            # unit suites (npm test), then npm run test:e2e
```

**Prerequisites** — the script checks these itself and fails fast with
guidance rather than hanging if they're missing:

- `test:e2e` / `test:e2e:ui-walk` need the dev stack up on its usual ports
  (web `43100`, API `43101`) and the seeded QA accounts:
  ```bash
  npm run db:up && npm run dev
  node server/scripts/seed-organizer.js --email=demo@tripper.dev --name="Demo Organizer" --password=tripper1234
  node server/scripts/seed-organizer.js --email=demo@example.com --name="Demo Example" --password=demo-pass-123
  ```
  `qa-format-polish.mjs` and `qa-dates-confirmed.mjs` resolve the
  flagship/idea trip ids at runtime via `GET /api/trips` (matched by
  `status`); override with `QA_TRIP_ID`, or `QA_CONFIRMED_TRIP_ID` /
  `QA_IDEA_TRIP_ID`, only if a DB ever has more than one trip of either
  status. Re-run `e2e/seed-demo.mjs` if a gate reports it can't find its
  trip at all.
- `test:e2e:smoke` only needs `npm run db:up` (smoke.mjs boots its own
  in-process server on a random port + throwaway schema — it doesn't touch
  43100/43101 or the seeded accounts above).

The runner does not boot servers on your behalf (`E2E_BOOT`-style
auto-boot was considered and deliberately left out — doing it robustly
would mean managing Vite/Fastify lifecycles and readiness polling, more
than belongs in a thin fail-fast wrapper). Start the stack yourself first.
