# Trip Planner

A small self-hosted app for a group organizing a trip together: people directory
with documents (passports, visas, tickets), a trip wizard with shareable
participant links, a readiness dashboard, AI-assisted destination suggestions,
and a simple shared budget. See [`docs/brief.md`](docs/brief.md) for the full
product brief and non-functional requirements.

Built for a handful of people and a few trips a year — SQLite + a single Node
process is the whole backend, no external services required.

## Quickstart

### Option A: Docker Compose (recommended)

```bash
cp .env.example .env      # edit JWT_SECRET at minimum
mkdir -p data
docker compose up --build
```

The app is served on **http://localhost:3000** — API and the built SPA share
one port, no separate frontend server.

Seed the first organizer account (run once, inside the container):

```bash
docker compose exec app node server/scripts/seed-organizer.js \
  --email=you@example.com --name="Your Name" --password=change-me
```

### Option B: Plain Node

Requires Node ≥20.

```bash
cp .env.example .env
npm ci
npm run build                      # builds web/dist
node server/scripts/seed-organizer.js --email=you@example.com --name="Your Name" --password=change-me
node server/src/server.js
```

Visit **http://localhost:3000**.

### Local development (hot reload)

```bash
npm ci
npm run dev   # runs server (nodemon-style --watch) + Vite dev server together
```

Ports are derived from `PORT_BASE` (default `43100`, set in `.env` — see
`.env.example`): Vite binds `PORT_BASE` (**http://localhost:43100**, `strictPort`
so it fails instead of drifting to the next free port) and the API server
binds `PORT_BASE + 1` (**43101**). Vite proxies `/api` through to the API port.

In dev mode `web/dist` doesn't exist, so the server's static plugin steps aside
and Vite serves the SPA with hot module reload; API calls proxy through to the
server.

## Seeding the first organizer

There's no public signup — organizer accounts are created via a script so the
app can't be opened up to strangers by accident:

```bash
node server/scripts/seed-organizer.js --email=<email> --name=<name> --password=<password>
```

Running it again with the same `--email` updates that organizer's name/password
(useful for password resets) rather than creating a duplicate.

## Configuration

All configuration is a single `.env` file (see `.env.example`). No secrets or
environment-specific values belong anywhere else.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Node server listens on. |
| `DB_PATH` | `./data/tripplanner.db` | Path to the SQLite database file. Lives under `data/` so it survives container restarts when volume-mounted. |
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
balancer, etc.) that handles HTTPS and forwards to `http://<host>:3000`.

## Backups

Everything the app owns lives under `data/` (SQLite DB + uploaded documents).
See [`docs/backup.md`](docs/backup.md) for the backup/restore procedure.

## Smoke test

`e2e/smoke.mjs` is a dependency-free end-to-end check: it boots the real
server in-process on a random port against a throwaway temp SQLite DB and
uploads dir, then walks the full organizer + participant golden path (seed →
login → people → trip → destination decide → confirm dates → participant
link → profile/doc/checklist as participant → budget → itinerary → readiness
→ archive → clone). Run it with:

```bash
node e2e/smoke.mjs
```

It prints `SMOKE OK` and exits 0 on success, or exits 1 with the failing
assertion on error. No `npm test` wiring needed — it's a plain Node script.
