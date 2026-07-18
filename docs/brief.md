# Trip Planner — Expanded Product Brief

**Date:** 2026-07-18
**Status:** Approved brief — input for implementation planning
**Audience:** AI agent producing a detailed implementation plan. This document is the requirements source of truth; the impl plan should trace every task back to a section here.

---

## 1. Context & Intent

A small friend group plans several trips a year — weekend getaways to multi-week travel. Every trip repeats the same manual work: chasing participants for personal info and travel documents, re-collecting preferences everyone already gave last time, hashing out dates and destinations across scattered chats, and building budgets and itineraries from scratch.

This app is a **private, self-hosted tool for one group (≤20 people)**. It is explicitly **not** a commercial product: no multi-tenancy, no billing, no growth features. Its two jobs:

1. **Kill repetition** — reusable people profiles, document vault, checklist templates, trip cloning.
2. **AI-assisted planning** — destination suggestions, itinerary drafts, and budget estimates generated from structured trip inputs, always as editable drafts.

## 2. Locked Decisions (do not re-litigate in the impl plan)

| Decision | Value |
|---|---|
| Project shape | Standalone project, own repo. No dependency on any existing codebase. |
| Frontend | Vue 3 (Composition API), responsive web UI — must work well on phones. |
| Backend | Node.js API server. Framework (Express/Fastify/etc.) is impl agent's choice. |
| Database | SQLite (single file). Scale is ≤20 users, a handful of concurrent trips. |
| AI | **Provider-agnostic LLM adapter** (see §7). No hard dependency on any one vendor. |
| Auth model | **Organizer accounts + tokenized participant links.** Participants never create accounts. |
| Discussions | **None.** No chat, no polls, no comment threads. The app records decisions and collects structured input via forms; conversation happens outside (WhatsApp etc.). |
| Hosting | Self-hosted (laptop or small VPS). Docker Compose setup desirable but optional. |

## 3. Roles & Access

- **Organizer** — logs in with email+password (2–3 people at most). Full CRUD on trips, participants, budgets, itineraries, checklists. Can generate/revoke participant links.
- **Participant** — no account. Receives a **tokenized link** scoped to (person, trip). Through it they can: view trip summary/itinerary, fill/update their own profile and preferences, upload their travel documents, and tick their assigned checklist items. They cannot see other participants' documents or personal details.
- Tokens must be long/unguessable, revocable, and support expiry. Organizer can regenerate a link at any time (old token dies).

## 4. Domain Model

### 4.1 Person (group directory — the reuse backbone)
Persistent across trips. Fields: name, phone, email, emergency contact, dietary preference (veg / non-veg / vegan / allergies free-text), medical notes (optional), general travel preferences (pace: relaxed↔packed; interests tags: trekking, food, nightlife, museums, shopping…; budget comfort band), home city (for transport planning). New trips pull people from this directory — **returning members never re-enter their info**, they only confirm/update via their link.

### 4.2 Travel Documents
Per person, uploaded files: passport, visa, national ID, driving license, vaccination, other. Metadata: type, document number (optional), **expiry date**, file. Requirements:
- Stored on local disk, access-controlled: only the owning participant (via their token) and organizers can view/download.
- **Expiry warnings**: dashboard flags any doc expiring before or within 6 months of the trip's latest possible end date.
- Documents persist in the directory (reused across trips), not per-trip copies.

### 4.3 Trip
- Basics: name, description, status lifecycle: `idea → planning → confirmed → active → archived`.
- **Mood/vibe**: free tags (chill, adventure, party, spiritual, budget, luxury…).
- **Goals/targets**: list of concrete objectives with optional fixed constraints, e.g. "attend X concert on Aug 14 in Bengaluru", "reach Kedarkantha summit", "eat at Y". Goals with fixed dates/places are **hard constraints** for date, destination, and itinerary logic.
- Origin city/cities (where the group starts from).

### 4.4 Dates — flexibility model
A trip's dates are one of three modes, and the mode can tighten over time:
- **Confirmed**: exact start/end.
- **Slight variation**: anchor range ± N days (e.g. "Aug 12–16, can shift by 2 days").
- **Broad window**: one or more candidate windows (e.g. "sometime in October, 4–5 days" → organizer enters candidate windows).
Dates are **organizer-only**: the group discusses availability outside the app; the organizer records candidate windows, then marks final dates, moving the trip toward `confirmed`. Participants see dates read-only.

### 4.5 Destination
Two entry paths:
- **Pre-decided**: organizer sets destination(s) at creation.
- **Open**: organizer requests **AI destination suggestions** (see §7). Inputs: vibe tags, goals, date window/season, budget band, origin city, group size, aggregated group preferences (dietary mix, interest tags, pace). Output: 3–7 ranked candidates, each with rationale, best-fit dates within the window, rough per-person budget, and key caveats (weather, permits, travel time). Organizer shortlists, discusses offline, and marks one as decided. Candidates and their AI rationale/budget snapshots are kept for reference.

### 4.6 Budget
Category-based estimate per trip. Fixed category set (extensible): **primary transport** (flights/trains to destination), **secondary transport** (local — cabs, rentals, metro), **stay**, **food**, **activities**, **shopping**, **leisure**, **misc/buffer**.
- Each category: estimated amount, basis note (e.g. "4 nights × ₹3k × 3 rooms"), per-trip total and **per-person split** (equal split by default; per-person overrides allowed for people skipping segments).
- **AI-assisted draft**: given destination, dates, group size, origin, and vibe, the LLM proposes per-category estimates with reasoning; organizer edits everything.
- **Scenario compare**: when destination is open, each candidate carries its own budget sketch so options can be compared side by side.
- Currency: single configurable currency per deployment (default INR). No FX handling.

### 4.7 Itinerary
Day-by-day plan for a trip with confirmed destination + dates.
- Structure: days → ordered items. Item: title, time-of-day or time range, location, category (travel/food/activity/rest/logistics), est. cost, notes, link.
- **AI draft generation** honoring hard constraints: goal events pinned to their fixed dates, dietary mix (e.g. always note veg-friendly food options), group pace preference, arrival/departure logistics.
- Fully editable after generation: add/remove/reorder items, edit any field. **Per-day regeneration** ("redo day 3, more relaxed") without touching other days.
- Version note: keep it simple — no branching/history requirements beyond the archive snapshot (§4.9).

### 4.8 Checklists (packing + tasks)
- Two kinds: **packing lists** (per-person items) and **task lists** (trip-level to-dos: book tickets, get permits, reserve stay) with optional assignee + due date.
- **Templates**: reusable, tagged by trip type (trek, beach, city, concert…). Creating a trip's checklist from a template copies items. Completing a trip can promote its edited checklist back into a template.
- AI can suggest a packing list from trip type, destination climate, and duration — again as an editable draft.
- Participants tick their own packing items via their link; organizers see completion status.

### 4.9 Post-trip Archive
On archiving a trip:
- Immutable **snapshot**: final itinerary, final budget (estimates), participant list.
- Optional **actuals**: simple total-actual-spent per category (single number entry, no expense-splitting or who-paid-what).
- **Photos link**: external album URL(s) (Google Photos etc.) — the app stores links only, never media.
- Free-text notes/learnings ("book buses earlier", "hotel X was great").
- **Clone as template**: create a new trip pre-filled with this trip's structure (categories, checklists, participant shortlist) — the core repetition-killer.

## 5. Key User Flows

1. **Create trip** — wizard: basics → vibe/goals → date mode + windows → destination (decided or open) → pick participants from directory (or add new people). Result: trip in `idea` or `planning`.
2. **Collect participant input** — organizer generates per-person links, shares them via existing chat apps (copy button; no in-app messaging). Participant opens link, confirms/edits profile, uploads/refreshes docs, done. Organizer dashboard shows per-person completion.
3. **Decide destination** — (if open) run AI suggestions → review candidates with budgets → mark decided.
4. **Confirm dates** — organizer sets final dates (after offline discussion) → trip becomes `confirmed`.
5. **Budget** — generate AI draft → edit categories → per-person view.
6. **Itinerary** — generate AI draft → edit/regenerate days → publish (visible read-only through participant links).
7. **Prep** — instantiate checklists from templates → assign tasks → readiness dashboard (info/docs/availability/checklist completion, doc-expiry warnings) until departure.
8. **Archive & reuse** — after the trip: enter actuals (optional), attach photo links, write notes, archive. Next similar trip: clone.

## 6. Dashboard / Readiness View

Per active trip, one screen answering "are we ready?":
- Participant grid: profile confirmed? docs uploaded? doc expiry OK vs trip dates?
- Decision status: dates confirmed? destination decided? budget drafted? itinerary published?
- Checklist/task completion, overdue tasks.

## 7. AI Integration (provider-agnostic)

- **Adapter interface**: one internal module, e.g. `llm.generate({ system, prompt, jsonSchema }) → parsed object`. All AI features go through it. Concrete providers (Anthropic, OpenAI, Ollama, …) are thin drivers selected by env config (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL`). Impl plan should define the interface and ship at least one driver plus a mock driver for tests.
- **Structured output**: every AI feature defines a JSON schema for its response (destination candidates, budget lines, itinerary days, packing items). Responses are validated; on validation failure retry once, then surface a friendly error.
- **Features**: destination suggestions (§4.5), budget draft (§4.6), itinerary draft + per-day regen (§4.7), packing suggestions (§4.8).
- **Human-in-the-loop**: AI output is always a draft the organizer reviews/edits. Nothing auto-commits.
- **Graceful degradation**: with no provider configured, all AI buttons are disabled with a hint; every feature remains fully usable manually.
- **Privacy**: prompts include trip parameters and aggregated preferences only — never document files, document numbers, phone numbers, or medical notes.

## 8. Non-Functional Requirements

- **Scale**: ≤20 people, ≤10 trips/year, low concurrency. Optimize for simplicity, not throughput. SQLite + single Node process is sufficient.
- **Security**:
  - Organizer auth: email+password with hashed passwords, session or JWT — impl agent's choice, keep it boring.
  - Participant tokens: ≥128-bit random, stored hashed, revocable, optional expiry; rate-limit token lookups.
  - Document files served only through authorized endpoints (never a public static dir); stored under a non-web-served path. Encryption at rest is a nice-to-have; access control is mandatory.
  - HTTPS assumed at deployment (reverse proxy); app should not implement TLS itself.
  - No third-party analytics/telemetry.
- **Backup**: everything lives in the SQLite file + one uploads directory; document a simple backup/restore procedure.
- **Deployment**: `docker compose up` preferred; plain `node` + built Vue assets must also work. Single `.env` for all config.
- **UX**: mobile-responsive (participants will almost always open links on phones). Participant-link pages must be lightweight and dead simple.

## 9. Out of Scope (explicit)

- Chat, comments, polls, or any discussion features.
- Realtime collaboration/websockets.
- Booking or payment integrations (flights/hotels APIs).
- Expense splitting / settle-up / who-paid-what (only single actuals number per category in archive).
- Notifications infrastructure (email/push). Link sharing is manual copy-paste. (Optional future: ICS calendar export.)
- Multi-group/multi-tenant support, i18n, offline mode.
- Photo/media storage (links only).

## 10. Suggested Build Order (for the impl plan)

1. **Foundation**: repo scaffold, DB schema + migrations, organizer auth, Vue shell.
2. **People & docs**: directory CRUD, document upload/expiry, access control.
3. **Trips & participant links**: trip wizard, token links, participant self-service pages.
4. **Readiness dashboard**.
5. **LLM adapter + destination suggestions**.
6. **Budget** (manual first, then AI draft).
7. **Itinerary** (manual editor first, then AI draft + per-day regen).
8. **Checklists + templates** (+ AI packing suggestions).
9. **Archive, actuals, clone-as-template**.
10. **Deployment packaging + backup docs**.

Each phase should land usable on its own; AI features always arrive after their manual equivalent works.

## 11. Open Choices Delegated to the Impl Agent

- Node framework, ORM/query layer, Vue component library (or none), state management.
- Session vs JWT for organizer auth.
- Exact DB schema shape (must cover §4 model).
- File upload handling library and size limits (suggest 10 MB/doc default).
- Testing strategy (unit + a thin e2e over the participant-link flow is strongly recommended).
