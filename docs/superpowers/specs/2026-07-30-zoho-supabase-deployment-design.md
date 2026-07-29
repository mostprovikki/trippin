# Deployment redesign: Zoho Catalyst + Supabase

Status: draft, pending implementation plan
Date: 2026-07-30

## 1. Motivation

Tripper runs today as a single Docker container (Fastify + better-sqlite3, local-disk
uploads) on an Oracle Cloud "always free" VM. The trigger for this doc: uncertainty about
how many more small apps that one VM can comfortably run side-by-side, combined with an
existing Zoho account the user wants to lean on instead of provisioning more Oracle
capacity. A prior, unrelated tech-stack writeup for a different app (splitease) recommended
Supabase (Postgres + Auth + Storage) for a structurally similar small multi-user app; that
recommendation seeded this one but is not assumed to transfer wholesale — Tripper has more
custom backend logic (LLM-assisted suggestions, tokenized participant links, a readiness
aggregation view) than a CRUD-shaped expense splitter.

This doc is the outcome of an extended design conversation plus hands-on spikes against a
real Zoho Catalyst project, not just documentation review. Every claim below is tagged:

- **VERIFIED** — confirmed by actually running something against the live Catalyst project
  (`project-rainfall`, org `Sathish (933223382)`) during this session.
- **DOCUMENTED** — confirmed by reading current Zoho Catalyst docs, not independently tested.
- **OPEN** — genuinely unresolved; listed under Open Items.

## 2. Current architecture (baseline)

- Backend: Fastify 5 on Node 22, one process, serves API + built Vue 3 SPA from one port.
- Database: better-sqlite3 — single local file, synchronous API, raw SQL (joins,
  one explicit multi-statement transaction).
- File uploads: local disk under `data/uploads`, only ever served through authenticated
  routes, never as static files.
- Auth: bcrypt + JWT (httpOnly cookie) for a handful of organizer accounts (no public
  signup); a *separate* scheme of opaque bearer tokens (`participant_links` table,
  SHA-256-hashed at rest, no email, no identity, organizer-issued and revocable) granting
  scoped access to one trip for participants.
- Deployment: Dockerfile + docker-compose, on an Oracle Cloud VM.
- Scale: a handful of people, a few trips a year. Not a public multi-tenant product.

## 3. Options considered, and why they were rejected or accepted

### 3.1 Zoho Catalyst Data Store (native relational option) — rejected

**DOCUMENTED**: Data Store's query language (ZCQL) supports joins only via explicit
foreign-key relationships and has **no transaction support** (no BEGIN/COMMIT/ROLLBACK),
per Zoho's own community/forum threads. Tripper has at least one real atomic
multi-statement write today (`trips.routes.js`'s date-window replace, wrapped in
`db.transaction(...)`), and the data model (trips, participants, documents, budget lines,
itinerary, checklists) is genuinely relational. Rewriting onto a store with no transaction
primitive is a real regression, not a lateral move. Rejected in favor of a real Postgres.

### 3.2 Catalyst Advanced I/O Functions as the API host — rejected in favor of AppSail

This was the original plan and is **not** what's being recommended now; it's kept here
because ruling it out shaped the final design.

**VERIFIED** (via a deployed spike function, `payloadSpike`, on the live project):
- The scaffolded Node template is **raw `http` req/res** (`module.exports = (req, res) => {...}`),
  not Express as marketing copy suggested — any Fastify app would need to be driven through
  its own request-handling entrypoint manually, not just dropped in.
- No hard request/response payload-size cap exists, but the **response path is throttled to
  roughly 50-90 KB/s** on this project. A 2MB response took ~40 seconds to complete — past
  the function's own **30-second hard execution timeout**. So responses above roughly
  1-1.5MB will time out in practice, not because of a size rejection but because they're too
  slow to finish. (Whether this throttle is specific to the `development` tier of a Catalyst
  project, vs. true in a promoted/production deployment, is **OPEN** — not verified either
  way, and moot given the AppSail alternative below.)
- Uploads showed no such throttle (5MB uploaded in ~1.2s).

**DOCUMENTED**: local disk is not persisted across invocations (standard FaaS assumption;
Zoho doesn't document `/tmp` behavior either way, which is itself a signal).

Given the 30-second cap and the throttled response path, Functions are a poor fit for
serving anything but small, fast JSON responses — workable for isolated small endpoints, but
not for hosting the whole API, and especially not for streaming document downloads.

### 3.3 Catalyst AppSail as the API host — **recommended**

AppSail is Catalyst's PaaS component: a persistent-runtime app host (Node/Java/Python, or a
raw Docker image), explicitly distinct from the Functions FaaS model.

**VERIFIED**, via a real deployed spike (`spikeappsail`, plain Node `http` server, no
framework, deployed with `catalyst appsail:add --stack node18 --source <dir> --command
"node index.js" --port 3000` then `catalyst deploy --only appsail:spikeappsail`):

- **No 30-second cap**: a route that deliberately sleeps 35 seconds returned `200` cleanly
  in ~35.9s wall time. This is a persistent runtime, not a capped invocation.
- **Cold start is fast**: first request after deploy completed in ~1.5s round-trip
  (`uptime=0.2s` reported by the process itself at response time).
- **Arbitrary outbound TCP works, not just HTTPS**: raw TCP connects to `1.1.1.1:443`,
  `1.1.1.1:53`, and `smtp.gmail.com:587` (a non-web TCP service, chosen as a closer analog
  to Postgres's 5432 than an HTTP(S) port) all succeeded in 16-34ms. This is the load-bearing
  fact for the Supabase decision below — Postgres's wire protocol needs a raw TCP connection
  on port 5432, not an HTTP call, and nothing in Catalyst's egress rules blocked that pattern
  in this spike. (Reachability to the *actual* Supabase host specifically is still **OPEN** —
  see Open Items — but the general capability is no longer a guess.)

**DOCUMENTED**: AppSail bills by **wall-clock instance uptime** (GB-hours), not per-request,
scaling down after **5 minutes of inactivity per instance**. Free tier: **15 GB-hours/month**,
$0.08/GB-hour beyond that. A naive "always-on" assumption blows this immediately (a bare
~128MB process running continuously for a month is ~91 GB-hours). But for Tripper's real
usage pattern — bursty, a handful of people, a few trips a year — realistic active time is
nowhere near continuous; even a generous 20 active hours/month at 256-512MB stays at 5-10
GB-hours, comfortably under the free allocation. This is a real judgment call based on usage
pattern, not a certainty — flagged as a risk to watch, not a blocker.

**Why this replaces the Functions plan entirely**: because AppSail runs a persistent process
from source + a startup command (or a Docker image), the existing Fastify app can very
plausibly run close to as-is — no rewrite into stateless per-invocation handlers, no 30s
timeout to design around, no throttled response path. The same Dockerfile-shaped deployment
that runs on the Oracle VM today via docker-compose can, with the DB/storage clients swapped,
target AppSail instead. This is a materially smaller migration than the original
Functions-based plan.

### 3.4 Database: Supabase Postgres — **recommended**

Real Postgres: proper transactions, real joins, no rewrite of the relational model. The
user already maintains a Supabase account for another app, and Tripper's scale won't come
close to Supabase's free tier (500MB DB / 50k MAU-equivalent limits are far beyond a
handful-of-people app).

**Code-level migration analysis** (read directly from `server/src/migrations/*.sql` and
representative route files, not a spike — this is a mechanical-cost estimate, not a
feasibility question):

- Schema itself ports cleanly: TEXT primary keys (UUIDs), CHECK constraints, foreign keys
  with `ON DELETE CASCADE`, JSON-as-TEXT columns — all valid in Postgres verbatim or with
  trivial changes (`datetime()` → `now()`, `date('now')` → `CURRENT_DATE`).
- **The pervasive cost**: better-sqlite3's API is fully synchronous (`.get()`/`.all()`/`.run()`);
  `pg` (or any Postgres driver) is async. Every route handler's DB calls need an `await` —
  mechanical, but it touches all ~13 route files, not a contained change.
- Placeholder style changes (`?` positional → `$1, $2, ...` named), which most route files
  use extensively.
- One genuine SQLite-transaction-helper usage (`app.db.transaction((windows) => {...})` in
  `trips.routes.js`) needs a small async equivalent (`BEGIN`/commit/rollback wrapper) —
  a single reusable helper, not a design problem, since Postgres has real transactions
  (the exact thing Data Store lacked).

Net assessment: a real, contained migration — not a lift-and-shift, but not a rewrite of the
data model either. Bounded mechanical cost, not an open design risk.

### 3.5 File storage: Zoho Catalyst Stratus — **recommended** (not File Store)

**File Store (the originally-considered service) is past end-of-life** — deprecated
2025-08-27, EOL 2026-04-30, both before today (2026-07-30). It was ruled out entirely once
this surfaced, not chosen and later reconsidered.

**Stratus** is File Store's GA replacement: bucket/object model, Node SDK v2 with
multipart/transfer-manager support for large uploads.

**DOCUMENTED + SDK-inspected** (read directly from the vendored `zcatalyst-sdk-node`
package on the live project, not just marketing docs): `bucket.generatePreSignedUrl(key,
'GET', { expiryIn, activeFrom, versionId })` exists as a real method, alongside
`putObject`/`getObject`/`headObject`/multipart-upload methods. This matches the intended
pattern: the AppSail-hosted API writes objects directly (fast, no throttle observed on
uploads anywhere in this investigation), and for *reads* it hands back a short-lived signed
URL for the client to fetch directly from Stratus — never proxying file bytes through the
app process. This preserves today's "documents never served as unauthenticated static
files" rule (the signed URL is itself time-limited and scoped) while being one hop shorter.

**Not yet spiked live**: an actual upload → sign → fetch round trip. The SDK's `bucket()`
method requires a bucket that already exists, and bucket creation has **no CLI or SDK
method** — it's console-only. This is a genuine, low-effort Open Item (create one bucket,
run the same kind of round-trip spike already done for AppSail/Functions) rather than a
design risk — presigned-URL object storage is an extremely standard pattern and the SDK
surface matches it exactly.

### 3.6 Auth — unchanged, by design

Neither Supabase Auth nor Catalyst Authentication models Tripper's participant-link scheme
(opaque bearer token, no email, no identity, organizer-issued/revocable) — both platforms'
auth products are built around email/OAuth identity flows, which is a different problem
("prove you own this email") from "here's a scoped capability for whoever holds this link."
Verified directly against the actual code (`server/src/routes/links.routes.js`,
`server/src/plugins/auth.js`), not assumed. Decision: **keep all current auth code
unchanged**, running inside the AppSail-hosted process exactly as it runs today. Organizer
login *could* optionally move to Supabase Auth's custom-token flow later since organizers do
have real emails — noted as a future option, not part of this migration.

### 3.7 Frontend hosting: Zoho Slate — recommended, not yet spiked

**DOCUMENTED**: native Vue/Vite support, git-based auto-deploy, positioned as Web Client
Hosting's more modern successor. Lower risk than the compute/storage/DB questions above (a
static SPA host is a well-worn category), so it wasn't prioritized for a live spike in this
session — listed as an Open Item, not a design risk.

### 3.8 LLM: keep the existing pluggable provider

**Researched, not spiked** (no code path to test without an implementation): Zoho has no
general-purpose callable "Zia" generative API — Zia inside Zoho's own apps is literally
OpenAI under the hood, BYOK. The one real option, Catalyst QuickML's **LLM Serving**
(open Qwen 2.5 models, genuine prompt-in/text-out REST endpoint, 128k context), is real but
new, thinly documented, and not frontier-tier. Decision: leave `LLM_PROVIDER`
(`anthropic`/`openai`/`mock`) exactly as it is today; treat a future `zoho`/QuickML driver
as an experiment behind the same interface, not a dependency of this migration.

## 4. Recommended architecture

| Layer | Choice | Status |
|---|---|---|
| Frontend hosting | Zoho **Slate** (static Vue 3 build) | Documented, not spiked |
| API / business logic | **Catalyst AppSail**, existing Fastify app, persistent process | Verified (spike app; real app not yet ported) |
| Database | **Supabase Postgres** | Migration scope analyzed at code level; no live connectivity test yet |
| File storage | **Zoho Catalyst Stratus** (writes via app, reads via signed URL) | Documented + SDK-verified; no live round trip yet |
| Auth | Unchanged custom code (bcrypt+JWT organizer, tokenized participant links) | No change required |
| LLM | Unchanged pluggable `LLM_PROVIDER` | No change required |
| Portability | Same app process/Docker-shaped deploy targets both Oracle VM (docker-compose, as today) and AppSail (source+command or Docker image) | Direct consequence of choosing AppSail over Functions |

## 5. Open items (before or during implementation)

1. **Supabase connectivity from AppSail, against the real host.** Arbitrary outbound TCP is
   verified in general (1.1.1.1, smtp.gmail.com); the actual Supabase Postgres endpoint on
   5432 has not been dialed from a Catalyst AppSail instance. Needs a live Supabase project
   for this app (the user has a Supabase *account*, not yet a *project* for Tripper) —
   creating one is a hands-on step, then a five-minute connectivity spike confirms it.
2. **Stratus bucket + signed-URL round trip**, live. Needs one bucket created via the
   Catalyst console (no CLI/SDK path exists for bucket creation) — hands-on, then scriptable
   the same way the AppSail/Functions spikes were.
3. **AppSail free-tier usage under real traffic** is a judgment call based on assumed usage
   patterns, not a guarantee — worth a look at actual GB-hour consumption after the first
   month live, not before.
4. **Whether the Functions response throttle found in §3.3 is dev-tier-specific** is
   unresolved and, given AppSail replaces Functions as the API host, no longer load-bearing
   for this design — left unresolved deliberately.
5. **Slate** hasn't been hands-on verified this session (lower risk, deprioritized in favor
   of the compute/storage/DB questions that were genuinely uncertain).
6. Two throwaway spike resources (`payloadSpike` function, `spikeappsail` AppSail instance)
   are still live on the real `project-rainfall` Catalyst project. AppSail's scale-to-zero
   means no ongoing cost, but they're cruft — no CLI command exists to delete an AppSail
   instance, so removal (if wanted) is a console action, left to the user rather than done
   automatically.

## 6. Non-goals of this migration

- Not adopting Supabase Auth or Catalyst Authentication for organizer or participant login —
  the current custom scheme stays.
- Not adopting Catalyst QuickML/any Zoho LLM service now — the pluggable provider stays.
- Not decommissioning the Oracle VM — the portable design means it remains a valid fallback
  target for the same app, not an either/or decision.
