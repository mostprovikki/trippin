# Redesign Brief — Tripper (group trip planner)

**You are designing the complete UI/UX for this product from scratch, as static HTML pages.**

Read this whole document before you design anything. It describes *what the product must let people
do* and *every state it can be in*. It deliberately does **not** describe the current screen layout
or navigation — that is being thrown away and is not a constraint on you. Where I mention the
existing build at all, it is flagged as `[today]` and is information only, never a target.

**Do not invent a visual style.** The style direction is a house skill: **load the
`dense-product-ui` skill and follow it exactly.** It supplies the palette, the closed type scale,
`assets/system.css`, a kitchen-sink page rendering every component, and a list of render gotchas.
Read its `references/rules.md` before you design any layout or write any copy.

Do not pick your own palette, add a hue, introduce a font, or reach for a CSS framework. If the
skill doesn't have a primitive you need, extend it in its own idiom rather than importing a
different look. Left to your own devices the output drifts into generic indigo-branded framework
defaults — that is the specific failure this instruction exists to prevent.

With the look thereby settled, **judge your own work on information architecture, flow, labelling,
state coverage, and how obvious the next action is.** That is where your effort should go.

**Backend is NOT your job.** No API calls, no persistence, no JS frameworks. Static pages with real
representative content, and just enough vanilla JS to demonstrate states and interactions.

---

## 1. What this product is

A **private, self-hosted planning tool for one friend group** (≤20 people, ~10 trips a year). It is
explicitly not a commercial product: no multi-tenancy, no billing, no signup funnel, no growth
features, no marketing surface, no onboarding tour. The people using it already know why they're
here.

The group plans everything from weekend getaways to multi-week international trips. Every trip
repeats the same manual grind: chasing people for their details and passport scans, re-collecting
preferences everyone already gave last year, arguing about dates across scattered chats, and
rebuilding budgets and itineraries from nothing.

The product exists to do exactly two things:

1. **Kill repetition** — a persistent people directory, a document vault, reusable checklist
   templates, and cloning a past trip into a new one. Nobody should ever type the same thing twice.
2. **AI-assisted drafting** — destination ideas, itinerary drafts, budget estimates, packing lists,
   generated from structured trip inputs and always landing as an *editable draft*.

### Scale implications you should design for

Small, expert, repeat-use. Favour **information density and directness** over hand-holding, wizards
everywhere, or progressive-disclosure-by-default. One organizer will use this app dozens of times a
year and knows every field. At the same time, participants may open their link **once**, on a phone,
possibly for the only time all year — that surface has the opposite requirement (see §4.2).

---

## 2. The twelve intentions that must survive your redesign

These are the non-negotiable ideas. If a design decision breaks one of these, the design is wrong.

1. **Reuse is the whole point.** Anything a returning traveller already told us must arrive
   pre-filled, and be *visibly* pre-filled ("this is what we have from last time — still right?"),
   not silently defaulted. Same for budget shapes, checklists, and past trips.
2. **The app records decisions; it does not host the discussion.** There is no chat, no comments, no
   polls, no threads, no voting. Debate happens in WhatsApp. Therefore the app's job is to make
   **what was decided** and **what is still open** completely unmistakable at a glance. That
   decided/open distinction deserves real design attention — it is the product's core value.
3. **AI drafts, humans decide.** No AI output is ever committed automatically. Every generated thing
   arrives as a reviewable draft that can be compared against what exists, then applied or
   discarded, in whole or in part. Design the review step as a first-class moment, not a modal
   afterthought.
4. **The app must be fully usable with AI switched off.** A deployment may have no LLM provider
   configured. Every AI feature is an accelerator on top of a complete manual workflow. When AI is
   unavailable, the interface must feel *complete and intentional*, not broken or nagging.
5. **Plans start vague and tighten over time.** Dates begin as "sometime in October", destination
   begins as "somewhere warm". The UI must be genuinely comfortable holding unknowns — never demand
   precision the user doesn't have yet, never make an unfinished trip look like an error. Show
   *degrees* of commitment, and make tightening feel like progress.
6. **Chasing people is the real pain.** The single most valuable screen answers "are we ready, and
   who am I waiting on?" Design toward *actionability* — who to nudge, about what, right now — not
   toward a pretty aggregate percentage.
7. **The participant surface is a two-minute job on a phone.** No account, one link, dead simple,
   fast. It must work for someone who has never seen the app and won't return.
8. **Privacy boundaries are structural, not cosmetic.** A participant sees their own data and shared
   trip facts — never another participant's documents, phone number, medical notes, or profile.
   Design so this is obvious and unbreachable-looking.
9. **Irreversibility must be visible before the click, not explained after.** Revoking an access
   link, archiving a trip, and deleting things with children all have consequences that must be
   stated concretely in the moment of confirmation.
10. **Mobile is not a secondary target.** The organizer will use this on a phone on a train.
    Participants almost always will. Design mobile as its own considered layout, not a squeeze.
11. ★ **Nothing is concrete. Everything is reversible, with consequences stated.** Plans change
    constantly, including after they were "decided". A confirmed date can shift. A decided
    destination can be abandoned. An active trip's itinerary gets rewritten the night before. An
    archived trip can turn out to need reopening. **The design must never trap a user in a state**
    — every commitment is a *current best answer*, not a one-way door. The corollary: because
    reversal is always available, the design's job shifts from *preventing* the change to
    **explaining what the change will cost** — concretely, in the moment, naming the specific things
    that will break. See §3.14 and §5.12; this is a primary theme of the redesign, not a detail.
12. **The group is not all in one currency.** Money is entered and reasoned about in one currency
    per trip, but the people reading it aren't all in that country — this group has members joining
    from Europe. Anyone must be able to *view* any amount in a currency they think in, without that
    view ever corrupting the underlying numbers. See §3.13.

---

## 3. The domain — entities, fields, and rules

This is the complete data surface. Every field below needs to be creatable, readable, and (unless
noted) editable somewhere in your design. Enums are listed exhaustively — use these exact value sets.

### 3.1 Person (the reuse backbone — persists across all trips)

| Field | Type / values | Notes |
|---|---|---|
| name | text | **required** |
| phone | text | private |
| email | text | private |
| emergency_contact | text | private |
| dietary | `veg` / `non_veg` / `vegan` / unset | drives itinerary food notes |
| allergies | text | private |
| medical_notes | text | private, sensitive |
| pace | `relaxed` / `moderate` / `packed` / unset | drives itinerary density |
| interests | list of free tags | e.g. hiking, museums, street food |
| budget_band | `low` / `medium` / `high` / unset | |
| home_city | text | used for transport planning |

A person can be deleted **only if** they are not a member of any non-archived trip.

### 3.2 Travel document (belongs to a person, reused across trips)

`doc_type` (**required**): `passport` / `visa` / `national_id` / `driving_license` /
`vaccination` / `other`. Plus `doc_number` (optional), `expiry_date` (optional), and the file
itself (**max 10 MB**, one at a time). Also carries original filename, mime type, size, uploaded-at.

**These are almost always images or PDFs** — a phone photo of a passport page, a scanned visa, a PDF
vaccination certificate. Design for that as the normal case:

- ★ **Thumbnails in every list.** A document row should show a visual thumbnail, not a filename and a
  file-type icon. Recognising your own passport scan at a glance is the entire point — filenames like
  `IMG_4823.jpg` carry no information.
- ★ **A real preview.** Opening a document should show it in place, at a readable size, without a
  download round-trip. Images render directly; for a multi-page PDF, the first page is the thumbnail
  and the preview needs page navigation.
- **The rare no-preview case.** Occasionally something arrives that can't be rendered. Design that
  fallback deliberately — filename, type, size, and a download action — as a designed state, not a
  broken image. Do not build the whole UI around this rare case.
- **Previews are sensitive.** A passport thumbnail is legible personal data. Only the owning
  participant and organizers may ever see it (§4.2). Consider whether thumbnails should be visible by
  default or revealed on intent — an organizer scrolling a readiness screen in public is a real
  scenario, and this is worth an opinion in `ia.md`.
- `[today]` uploads accept **any** file type with no validation and show no preview at all, so a
  `.zip` can be filed as a passport and nothing notices. Design the type expectation and the
  rejection state for something outside it.

Documents cannot be edited — only deleted and re-uploaded. So correcting a mistyped expiry date
currently means re-uploading the file. Design for that honestly, and consider arguing for
metadata-only editing (§3.14).

**Expiry warning rule (design must express both tiers):** the reference point is the trip's end
date, falling back to the latest candidate date-window end, falling back to today. The horizon is
*trip end + 6 months*. A document with an expiry date is flagged if it expires before that horizon:
level **expired** if it expires before or during the trip (blocking), level **warning** if it
expires within six months after the trip ends (worth renewing). Documents with no expiry date are
never flagged. `[today]` the UI only shows a crude expired/not-expired binary — designing the
two-tier warning properly is part of your job.

### 3.3 Trip

| Field | Type / values | Notes |
|---|---|---|
| name | text | **required** |
| description | long text | |
| status | `idea` → `planning` → `confirmed` → `active` → `archived` | see lifecycle below |
| vibe_tags | list of free tags | chill, adventure, temples, street food, luxury… |
| origin_city | text | where the group starts from |
| currency | the trip's **base** currency, default **INR** | all amounts are entered and stored in this; see §3.13 for viewing in another |
| date_mode | `confirmed` / `slight` / `broad` | see §3.4 |
| start_date / end_date | dates | |
| flex_days | integer | only meaningful in `slight` mode |
| destination_mode | `decided` / `open` | see §3.5 |
| destination | text | |
| archived_at | timestamp | |

**Lifecycle rules.** The intended progression is idea → planning → confirmed → active → archived.
Moving to `confirmed` requires the trip to have final dates *and* a decided destination — your
design must show why the step isn't available yet and what to fix, not just disable a button.

**But the progression is not a ratchet.** `[today]` status moves forward only, with no way back from
any state, and archiving is one-way and also revokes every participant access link. **Per intention
§2.11, your redesign must make every one of these reversible.** Specifically, design:

- **Stepping a trip backwards** — confirmed → planning because the dates fell apart; active →
  confirmed because departure got pushed. What does the user see, and what does it warn about?
- **Un-archiving a trip.** Note the real complication: archiving revokes every participant link and
  freezes a snapshot. Un-archiving therefore has to answer *"and what happens to the six links you
  killed, and to the snapshot?"* — reissuing links is a per-person action with a one-time secret
  (§3.10), so this can't be a silent restore. This is the hardest reversal in the product; give it
  real thought rather than a plain "Unarchive" button.
- ★ **Status rolls back automatically when a major change invalidates it.** This is decided, not open:
  status is *derived from whether its preconditions still hold*, not a free-floating label. Un-confirm
  the dates of a `confirmed` trip and it returns to `planning`, because `confirmed` requires final
  dates. Same for abandoning a decided destination.

  The precise rule, which matters: **status rolls back when a change breaks the precondition of the
  current status — not merely because something changed.** Shifting a confirmed trip from 6–15 Nov to
  8–17 Nov keeps exact dates, so it stays `confirmed`. Reverting those dates to a broad window
  destroys the precondition, so it drops to `planning`. Design both cases; the difference between
  "edited" and "invalidated" is the whole idea.

  The rollback must be **announced before the click, never discovered after**: the consequence
  warning for the change has to say *"this will move the trip back to Planning"* alongside the other
  damage it names (§5.12). A status that silently changes underneath the user is worse than one that
  drifts.

### 3.4 Dates — the flexibility model (three genuinely different UIs)

- **Confirmed** — exact start and end date. Locked-in, this is the goal state.
- **Slight variation** — an anchor date plus ± N flex days ("Aug 12–16, could shift by 2").
- **Broad window** — one or more **candidate windows**, each with a start, an end, and a note
  ("sometime in October, 4–5 days" → several candidate windows to choose between).

Dates are **organizer-only**. The group settles availability outside the app; the organizer records
candidate windows, then marks the final dates. Participants see dates strictly read-only.

Design all three modes and the transitions between them. Three specific requirements, because the
dates surface is currently the most broken part of the product in both directions at once:

1. ★ **Promoting a candidate window into the trip's final confirmed dates.** `[today]` this action
   does not exist in the UI at all — the organizer can propose windows forever and never convert one
   into the actual answer. Treat it as required, and make it feel like the moment of decision it is.
2. ★ **Candidate windows must stop pretending to matter once dates are confirmed.** `[today]` the
   full window editor stays visible and fully editable *after* the trip's dates are locked, with
   nothing indicating those windows are now vestigial — so the user can keep carefully editing
   proposals that affect nothing. Decide what candidate windows *mean* post-confirmation: history of
   what was considered? Hidden? Available again only if the user reopens the date decision? Any
   coherent answer beats today's silent no-op.
3. ★ **Changing dates after they were confirmed** — including on an `active` trip, mid-planning or
   even mid-trip. This must be possible (intention §2.11), and it must warn concretely, because
   itinerary days are *derived* from the trip's dates (§3.8). Shifting a confirmed 6–15 Nov trip by
   two days doesn't just edit two fields — it changes which days exist. The warning has to say what
   happens to the content of the days that no longer exist, and to the goals pinned to specific
   dates (§3.6) that now fall outside the trip. "Are you sure?" is not sufficient here; name the
   damage. Consider whether shifting a whole trip (preserving day contents, sliding the dates) and
   re-dating a trip (dropping day contents) are two different user intents deserving two different
   actions.

### 3.5 Destination — two entry paths

- **Pre-decided** — the organizer already knows where.
- **Open** — the organizer collects **candidates** (added manually and/or generated by AI, 3–7 at a
  time), compares them, discusses offline, then marks exactly one as decided.

Candidate fields: `name` (**required**), `rationale`, `best_dates` (free text), `est_budget_per_person`,
`caveats` (weather, permits, travel time), `source` (`ai` / `manual`), `decided` flag.

Exactly one candidate per trip can be decided. Deciding is exclusive. A decided candidate cannot be
deleted. `[today]` there is also no way to *un-decide*, which is a design gap worth solving.

The comparison of candidates — several options side by side, each with its own rough per-person
budget and caveats — is a genuine decision-support surface. Give it real thought rather than
rendering a list of cards.

### 3.6 Goals / targets (hard constraints on planning)

Per trip, a list of concrete objectives: `title` (**required**), `fixed_date`, `fixed_place`,
`notes`. Examples from real data: *"Angkor Wat at sunrise — the whole reason for the Cambodia leg"*
(fixed to a date and place), *"Hoi An tailoring with time for two fittings"* (fixed place, no date),
*"Keep two half-days completely unplanned"* (neither).

Goals with fixed dates or places are **hard constraints** — they are fed to the itinerary generator
as non-negotiable anchors. Your design should make the difference between a hard-constrained goal
and a soft wish visible, because it changes what the planner can do.

### 3.7 Budget

Exactly **eight fixed categories**, not extensible by the user: `primary_transport` (getting there),
`secondary_transport` (local movement), `stay`, `food`, `activities`, `shopping`, `leisure`, `misc`
(buffer). Each carries an `estimate` and a `basis` note explaining the maths ("4 nights × ₹3k × 3
rooms").

Plus: a trip total, an **equal per-person split**, and **per-person overrides** (a specific person
pays a different `amount`, with a `note` — for someone skipping a segment). Overridden people come
out of the equal-split maths.

AI can draft all eight category estimates with reasoning. When the destination is still open, each
destination candidate carries its own budget sketch so options can be compared.

### 3.8 Itinerary

Days are **derived from the trip's confirmed start and end dates** — they cannot be added or deleted
by hand, and an itinerary cannot exist before the trip has dates. Each day holds ordered items.

Item fields: `title` (**required**), `time_range` (free text like "09:00–11:00"), `location`,
`category` (`travel` / `food` / `activity` / `rest` / `logistics`), `est_cost`, `notes`, `link`.
Items are reorderable within a day.

AI can draft the whole trip at once, **or regenerate a single day** given a free-text instruction
("redo day 3, more relaxed") without disturbing the other days. Per-day regeneration is a
distinctive, valuable interaction — design it well. Drafts must be reviewable against the current
content before being applied.

The itinerary is what participants read on their phones during the trip. Consider that reading
context, not just the editing context.

### 3.9 Checklists (two kinds, plus templates)

- **Packing lists** — per-person items. Participants tick their own.
- **Task lists** — trip-level to-dos ("book the Ha Long junk", "get Cambodia e-visas"), each with an
  optional **assignee** and **due date**. Overdue matters.

Item fields: `title` (**required**), `assignee`, `due_date`, `done`, position.

**Templates** are the reuse mechanism: reusable checklists tagged by trip type (trek, beach, city,
concert…). You can instantiate a template into a trip, and you can promote a trip's edited checklist
back into a template for next time. Templates belong to the organizer, not to a trip.

AI can suggest packing items from destination, climate, and duration — packing lists only.

### 3.10 Participant access links (no accounts, ever)

Participants never create accounts. The organizer generates a **tokenized link** scoped to exactly
one (person, trip) pair and shares it via WhatsApp by copy-paste. There is no in-app messaging and
no email sending — copy-to-clipboard is the entire distribution mechanism.

Critical UX facts:

- The raw link is shown **exactly once**, at creation. It is never recoverable afterwards. Your
  design must make that consequence clear *before* the user navigates away, and make copying
  effortless (including a fallback when clipboard access is denied).
- Creating a new link for the same person **silently kills their previous link**. That is the only
  "regenerate" mechanism. Say so plainly.
- Links can be **revoked** — immediate, irreversible loss of access.
- Links support an **optional expiry** in days. `[today]` the backend supports this but no UI
  exposes it — design it.
- Past and revoked links are visible as a history, with creation timestamps, so the organizer can
  see who currently has access.
- Archiving a trip revokes every link on it.

### 3.11 Archive / retrospective, actuals, and clone

Archiving a trip freezes an **immutable snapshot** of the final itinerary, the final budget, and the
checklists. After archiving, only three things stay editable: retrospective `notes`
("book buses earlier, hotel X was great"), **photo album links** (external URLs only — the app never
stores media), and **actuals**: one real-spend number per budget category, compared against the
estimate. No expense splitting, no who-paid-what, ever.

**Clone** is the repetition-killer and deserves prominence. Cloning a trip carries over: name (new),
vibe tags, origin city, currency, goals (titles and notes only), the participant list, budget
category estimates and bases, and checklists with their items. It resets: all dates, destination
(back to open), the itinerary entirely, budget overrides, goal fixed-dates/places, checklist
assignees and done-state, documents, and links. Your design must state this carry-over/reset split
explicitly at the moment of cloning — a surprise here is expensive.

An archived trip is a **retrospective document**, not a greyed-out corpse. Design it as something
worth revisiting.

### 3.12 Search

Cross-entity search over six kinds: **trips**, **people**, **documents**, **itinerary items**,
**checklist templates**, and **archived-trip notes**. Minimum 2 characters. Results arrive grouped
by kind. Note that checklist templates aren't independently navigable — they only make sense in the
context of a trip's checklists, so a template result needs different treatment from the others.

`[today]` there's both a keyboard-invoked command palette and a full results page. Whether you keep
one, both, or something else is your call — but a fast keyboard path to any entity is high value for
a repeat expert user.

### 3.13 Currency: one base, any viewing lens (new feature — design from scratch)

Each trip has one **base currency** (default INR) in which every amount is entered and stored:
budget estimates, per-person splits and overrides, itinerary item costs, destination candidate
per-person sketches, and post-trip actuals.

**Add a viewing-currency switch.** Any viewer can pick a currency they think in, and every monetary
figure on screen re-displays converted into it. The Europe-based members of this group should be able
to read the budget in EUR without anyone re-typing anything.

**Think of it as a display filter, not a feature.** This is settled, not a design question:

- **Every input is always in the trip's base currency.** Always. The viewing currency never applies
  to a form field, never round-trips, never gets saved. There is no such thing as entering an amount
  in VND.
- **Converted figures are read-only output**, in the same way a search highlight or a text filter is
  read-only output. Nothing downstream — no total, split, override, or actual — is ever *computed*
  from a converted value.
- Therefore an editable money field stays in base currency even while a converted view is active.
  Show the conversion *beside* the input as an aid if it helps, but the input itself does not change
  units. **A user accidentally saving 71 (EUR) into a field that means 6,300 (INR) must be structurally
  impossible, not merely discouraged.**

Because it's a viewing lens, the currency choice belongs to **the person looking**, not to the trip
— a per-viewer preference that persists across trips and screens, sitting near other view controls.
It is emphatically not a trip setting and must not look like one.

**Rates are daily, external, and imperfect.** I verified the two viable no-key sources so you can
design against reality rather than a guess:

| Source | Key needed | Coverage | Behaviour |
|---|---|---|---|
| `api.frankfurter.dev` | No | ~30 ECB currencies. **No VND, no THB.** | Silently returns *fewer* rates for unsupported codes — no error |
| `open.er-api.com` | No | 161 currencies incl. VND | Reports `time_last_update` and `time_next_update` |
| `api.exchangerate.host` | **Yes** | — | Now key-gated; unusable |

That table dictates several states you must design:

- ★ **"Rates as of <date>" must always be visible** next to converted figures. These are daily
  reference rates, not live market rates, and never what a card issuer will actually charge. Say so
  once, quietly, somewhere it will be believed.
- ★ **Converted values are approximations.** Distinguish them visually from authoritative base-currency
  figures — an `≈`, a lighter treatment, coarser rounding. A converted total should not look as
  precise as an entered one.
- ★ **Unsupported currency.** The likeliest real request for this trip is INR→VND, and the
  ECB-backed source silently omits it. Design what the user sees when their chosen currency has no
  rate: a clear "we can't convert to VND" that keeps showing base values, not blank cells or
  zeroes.
- **Rate fetch failed / offline / stale.** Fall back to base currency with a visible notice. Never
  present a stale or unavailable rate as current.
- **Switching back to base** — always one obvious action away, and the base view should feel like
  home rather than one option among many.
- **Archived trips.** An archived trip's actuals were spent at the rates of the time, so converting
  them at today's rate shows a number that was never true. Since the rate date is always on screen
  anyway, labelling is enough — but make the label impossible to miss on a retrospective, where a
  reader is most likely to mistake a converted figure for what was actually paid.
- Participants get the switch too (§4.2 — the two members joining from Europe are the motivating
  case). It is the same read-only lens for them.

Still out of scope: entering amounts in mixed currencies, per-line currencies, FX gain/loss
tracking, or anything resembling accounting. One base currency in, any lens out.

### 3.14 The reversibility catalogue

Per intention §2.11, this is the complete list of currently one-way actions. **Every one needs a
designed path back**, and every one needs its consequences named at the point of the *forward*
action too, since users will now expect to be able to undo.

**Do not let the current API constrain you here.** None of this reversibility exists server-side yet;
it will be built afterwards, informed by what you design. Your job is to establish the *direction* —
what reversal should feel like, how it's offered, and how its consequences are communicated. Design
what's right and the backend will follow.

| Action | `[today]` | What your design must provide |
|---|---|---|
| Advance trip status | Forward only, no revert from any state | A way back at every step, with warnings |
| Archive a trip | One-way; also revokes all links, freezes a snapshot | Un-archive, answering what happens to killed links and the snapshot |
| Mark a destination decided | Irreversible, and no confirmation at all | Either a confirm or an un-decide (ideally the latter) |
| Confirm trip dates | No promote action exists; once set, no reopen | Promote a window, *and* reopen the date decision later |
| Revoke an access link | Irreversible by design (correct — tokens are hashed) | Keep irreversible; make re-issuing the obvious recovery, and warn clearly *before* |
| Create a link over an existing one | Silently kills the previous link | Warn before, not after |
| Delete a person / document / goal / itinerary item / checklist | Hard delete, gone | Consider whether any deserve undo or a recovery window; at minimum, warn with specifics |
| Trip deletion | **Does not exist** — a trip created by mistake is permanent | Decide: is archive genuinely the answer for a junk trip, or is delete needed? |
| Edit a document | Impossible — delete and re-upload the file to fix a typo'd expiry | At minimum acknowledge this in the UI; a metadata-only edit is worth arguing for |
| Apply an AI draft | Overwrites existing content with no undo | Consider undo, or a diff-and-choose review (§5.5) |

Distinguish two genuinely different things in your design: **destructive** (data is gone — deletes,
revoked tokens) and **merely decided** (a choice that can be re-opened — status, dates, destination,
applied drafts). Today the UI treats them with the same finality. Only the first group deserves it.

---

## 4. Jobs to be done

Design around these. How they map onto pages is entirely yours to decide.

### 4.1 Organizer

1. **Sign in.** Email + password. There is **no signup, no password reset, and no account
   management** — organizer accounts are provisioned outside the app. Do not design a registration
   flow. Do design what a signed-out visitor sees and what happens when a session expires mid-work.
2. **See the portfolio.** All trips across five statuses at once; know instantly which need
   attention and which are done.
3. **Start a trip.** Capture: name, description, origin city, vibe tags, goals, date mode with its
   mode-specific fields, destination decided-or-open, and initial participants pulled from the
   directory. Must tolerate starting with almost nothing known. Must handle "the person I want isn't
   in the directory yet" without losing in-progress work. Must survive a reload.
4. **Maintain the people directory.** Add, edit, and remove travellers independent of any trip; see
   their profile, preferences, documents, and which trips they're on. `[today]` "which trips is this
   person on" doesn't exist anywhere — it should.
5. **Chase participant input.** Generate a link per person, copy it, share it externally, watch
   completion arrive, re-issue or revoke as needed.
6. **Converge on dates.** Record candidate windows, tighten the mode, promote a window to final
   dates.
7. **Converge on a destination.** Collect candidates manually or via AI, compare them with budgets
   and caveats, mark one decided.
8. **Build the budget.** Draft with AI or by hand, edit all eight categories with reasoning notes,
   see the per-person split, add per-person exceptions.
9. **Build the itinerary.** Initialise days from the dates, draft with AI, then edit relentlessly:
   add, edit, reorder, delete items, regenerate individual days with instructions.
10. **Prepare.** Instantiate checklists from templates, assign tasks with due dates, track overdue
    items, get AI packing suggestions.
11. **Answer "are we ready?"** One place showing: whose profile is confirmed, who has uploaded
    documents, whose documents expire too close to the trip, who has no working link, which
    decisions are still open, and what tasks are overdue. Every one of those should be a route to
    fixing it, not just a red mark. `[today]` nothing on this screen links anywhere.
12. **Advance the trip through its lifecycle,** understanding what each step requires.
13. **Close the loop.** Archive with retrospective notes, record actual spend against estimates,
    attach photo album links.
14. **Do it again cheaply.** Clone a past trip into a new one; promote a proven checklist into a
    template.
15. **Find anything fast.**

### 4.2 Participant (no account, phone, one link, two minutes)

1. **Understand the trip** — name, description, dates, destination, vibe, goals. Read-only. Must
   read well when dates or destination are still undecided.
2. **Confirm their profile** — arriving pre-filled from previous trips, needing confirmation more
   than data entry. This is *the* moment where "returning members never re-enter their info" either
   pays off or doesn't. The fields are those in §3.1, including the sensitive ones.
3. **Upload and refresh travel documents** — their own only, with type, optional number, optional
   expiry. They should understand whether a document is a problem for *this* trip.
4. **Tick their checklist** — their packing items (assigned to them, plus shared unassigned ones)
   and the tasks assigned specifically to them. Nothing belonging to anyone else.
5. **Read the itinerary during the trip** — think about this reading context on a phone, possibly
   offline-ish, possibly one-handed.
6. **Know they're done.** A clear finish state, so they close the tab confident nothing is
   outstanding.

They must **never** see: other participants' documents, phone numbers, emails, emergency contacts,
medical notes, allergies, or profiles; the budget; or the participant list.

---

## 5. State coverage matrix — the anti-miss list

**This is the completeness contract.** Every row below must be visibly designed somewhere in your
deliverable, and accounted for in your coverage checklist (§7). Do not skip a state because it's
"just an error". Rows marked ★ are the ones most often missed and most valuable to get right.

### 5.1 Session and shell

- Signed-out view; sign-in idle / submitting / wrong credentials.
- ★ Session expired mid-work — what the user sees, and whether they lose their place or their
  unsaved input.
- Unknown URL / not found.
- Trip not found, or not yours (indistinguishable by design — no existence leaks).
- ★ **Theme — a known open question, do not silently resolve it.** The `dense-product-ui` system is
  **light-mode only**, so build these mockups in light mode. But the current product ships light,
  dark, *and* follow-the-OS theming, so dropping dark mode would be a real regression. Therefore:
  design light-mode now, and **do not make choices that would be impossible to theme later** — keep
  colour in tokens, never hard-code a hex in markup, and don't lean on a light background to carry
  meaning. Flag it in `ia.md` as an unresolved product decision rather than quietly deciding it.
- State must never be conveyed by colour alone, in any theme.
- Mobile layout for every screen you produce (breakpoints around 640px and 768px; touch targets
  ≥44px).

### 5.2 Lists and collections — every one of these needs all four

For trips, people, documents, goals, date windows, destination candidates, itinerary days, itinerary
items within a day, checklists, checklist items, templates, participant links, and search results:

- **Loading** (and pick deliberately between skeleton and spinner — be consistent about which
  situation gets which).
- **Empty, first-run** — never a blank box. Explain what goes here and offer the action.
- ★ **Empty because of a dependency, not because it's new** — e.g. no itinerary because the trip has
  no dates yet; no participants to assign a task to because none have been added; no templates to
  instantiate; the people directory is empty when you're trying to add someone to a trip. These
  need *different* copy and a *different* action from first-run empty.
- **Load failed** — with a retry, and distinct from empty. (A silent failure that renders as "no
  trips yet" is a real bug this product already had.)
- Populated at realistic small scale, and at awkward scale (a 14-day itinerary, 20 people, 40
  checklist items, six trips across five statuses).

### 5.3 Forms and editing

- Idle, focused, filled.
- Validation failure, per required field: person name, trip name, goal title, candidate name,
  checklist name and kind, checklist item title, itinerary item title, clone name.
- Cross-field validation: end date before start date; negative flex days.
- Saving / in-flight, with the control disabled and legible.
- Saved confirmation — decide deliberately between transient toast and inline persistence, and be
  consistent.
- Save failed, with the user's input preserved.
- ★ **Dirty state and unsaved-work protection.** Long-form editors (trip basics, budget, person
  profile) must not silently discard work on navigation. `[today]` some screens persist drafts
  across reloads and warn on exit; most don't. Decide one coherent policy and apply it everywhere.
- ★ **Multi-save screens.** Some surfaces `[today]` have three independent save buttons with no
  unified dirty indicator. Resolve this — either one save, or unmistakable per-section state.
- Read-only / locked variants: participants see dates and itinerary read-only; an archived trip's
  snapshot is frozen while its notes, photo links, and actuals stay editable. ★ Make the frozen/
  editable boundary on an archived trip visually obvious — this is currently contradictory.

### 5.4 Genuinely destructive actions (data loss)

Each needs a confirmation that names the concrete consequence. Note the distinction drawn in §3.14:
only *genuinely destructive* actions belong here. Actions that are merely *decisions* — status,
dates, destination, applied drafts — belong in §5.12 and must be reversible rather than guarded.

- Delete a person — and the **blocked** case: they're still on an active trip. Explain which trip.
- Delete a document.
- Remove a participant from a trip.
- ★ Revoke an access link — immediate, irreversible loss of access.
- ★ Create a link when one already exists — this silently kills the old one. Warn *before*.
- Delete a checklist — state how many items go with it.
- Delete a checklist item — high-frequency, trivially re-creatable; ★ decide deliberately whether
  this one warrants a confirm at all, and be able to justify the inconsistency if you keep it.
- Delete an itinerary item — names its time, location, cost, notes.
- Delete a destination candidate — and the **blocked** case: it's the decided one.
- Mark a destination decided — currently irreversible with no confirm; ★ design either a confirm or
  an undo.
- Archive a trip — locks the plan *and* revokes every participant link.
- Discard an AI draft.
- Discard unsaved edits.

### 5.5 AI states — every AI feature needs all five

The features: destination suggestions, whole-trip budget draft, whole-trip itinerary draft, single-day
itinerary regeneration with a free-text instruction, and packing suggestions.

1. **Available and idle** — the invitation to generate.
2. **Generating** — this can take many seconds. Design for the wait honestly; a disabled button with
   a spinner is the low bar.
3. ★ **Unavailable because no provider is configured** — a permanent, expected condition, not an
   error. The screen must feel complete and the manual path obvious. Do not nag, and do not point at
   a setting the user cannot change from the UI.
4. **Generation failed** — the model returned something unusable after a retry, or the provider
   errored. Recoverable, non-destructive, existing work untouched.
5. ★ **Draft ready — the review moment.** Draft content shown against what already exists, so the
   user can judge it. Apply or discard. This pattern recurs in five places `[today]` implemented
   five slightly different ways — ★ **unify it into one recognisable system**, and consider whether
   partial acceptance (take these three items, not those two) is worth designing.

Also design the trip-level reassurance that **nothing was sent to an AI provider that shouldn't be**:
only aggregated preference counts and trip-level parameters ever leave. Never names, phones, emails,
emergency contacts, medical notes, allergies, document numbers, or files. If you can express that
trustworthily in the UI, do.

### 5.6 Blocked-by-precondition states ★

These are the highest-value states in the product and the easiest to fumble. Each needs to explain
*what's missing* and *offer the route to fix it* — never a dead disabled control:

- Cannot confirm the trip: needs final dates and a decided destination.
- Cannot build an itinerary: the trip has no dates.
- Cannot advance from `active`: there is nowhere forward except archiving.
- Cannot add a per-person budget override for someone who isn't a participant.
- Cannot instantiate a checklist from a template when no templates exist yet.
- Cannot assign a task when the trip has no participants.
- Cannot suggest packing for a task-kind checklist (packing lists only).
- Cannot re-archive an already-archived trip.
- Cannot add itinerary days by hand — they come from the dates.
- Cannot edit a document — delete and re-upload instead.

### 5.7 Upload states

Idle; file chosen (with a local preview before upload, where possible); uploading, with progress;
succeeded; failed; **rejected for exceeding 10 MB**; rejected as an unsupported type. Plus
downloading, and the fact that files are served only through authorised access, never a public URL.

Preview and thumbnail states (§3.2), all of which need designing:

- Thumbnail generating / not yet available.
- Image thumbnail and image preview.
- PDF first-page thumbnail, and the multi-page preview with page navigation.
- ★ The no-preview fallback for a file that can't be rendered — a designed state, not a broken image
  icon.
- A thumbnail whose source fails to load after the fact.
- ★ Sensitive-content handling — a legible passport thumbnail in a list an organizer might open in
  public. Show your opinion on default-visible versus reveal-on-intent.
- A very tall or very wide scan, and a low-quality phone photo, in a fixed thumbnail slot — these
  break naive layouts.
- A document list mixing images, PDFs, and one unpreviewable file.

### 5.8 Readiness signals

Design each of these, plus the mixed reality of a real trip where some are green and some aren't:

- Per participant: profile confirmed or not; document count; document expiry warnings at both tiers
  (**expired** and **warning**); whether they have a working access link.
- Trip decisions: dates confirmed; destination decided; budget drafted; itinerary built (a raw day
  count — you decide what "ready" means and say so).
- Checklists: done vs total, and the overdue list with what's overdue, when it was due, and whose it
  is.
- ★ Every signal should lead somewhere. Three composite views to consider: "the trip's readiness",
  "this person's readiness across the trip", and "who am I waiting on right now".
- The extremes: a brand-new trip where nothing is ready (must feel like a starting line, not a wall
  of failure), and a fully-ready trip (must feel finished).

### 5.9 Participant surface states ★

- Loading.
- Valid link, everything present.
- ★ **Bad link** — expired, revoked, and never-existed are **deliberately indistinguishable** to
  prevent enumeration. One message covering all three, written for a non-technical person on a
  phone, with a sensible suggestion (ask the organizer for a new link) and no retry-forever loop.
- Temporary failure — retryable, distinct from a bad link.
- Rate-limited (30 requests/minute).
- Trip details still undecided — dates and/or destination TBD, rendered as *reassuring* rather than
  broken.
- Profile pre-filled from previous trips ★ — signal clearly that this came from last time and just
  needs a look.
- Profile empty (a brand-new person).
- Profile saved and confirmed.
- No documents yet; documents present; a document that's a problem for this trip.
- Nothing on their checklist yet.
- Checklist partially and fully complete.
- ★ Overall "you're done" state.
- Every one of these designed phone-first.

### 5.10 Search states

Query too short (under 2 characters); no query yet (say what's searchable); loading; no matches;
grouped results across all six kinds; a result kind that isn't independently navigable (checklist
templates); keyboard navigation and selection; and the relationship — if any — between a fast
keyboard path and a full results view.

### 5.11 Content edge cases

- Very long trip names, person names, goal titles, and destination names.
- A trip with no destination, no dates, no participants, no budget, no itinerary — all at once.
- A destination candidate with only a name and nothing else filled in.
- A budget where every estimate is zero versus one that has never been drafted — ★ these are
  different and `[today]` render identically. Distinguish them.
- A 14-day itinerary; a day with no items; a day packed with twelve.
- A person with no preferences set at all (every optional field unset).
- A person with 8 documents, half of them problematic.
- 20 participants on one trip.
- Archived trips mixed in with live ones.
- Currency display (₹, thousands separators) and date display — pick one convention and hold it.
- Enum values rendered for humans: `non_veg` → "Non-veg", `primary_transport` → "Primary transport",
  `national_id` → "National ID". Never leak a raw enum into the UI.

### 5.12 Reversal and consequence warnings ★

Every row of the §3.14 catalogue needs its path back designed and visible. Beyond those, design
these specific consequence moments — each must name the *actual damage*, not ask "are you sure?":

- Shifting or re-dating a **confirmed** trip that already has an itinerary — which days disappear,
  what was in them, which date-pinned goals now fall outside the trip.
- Shifting the dates of an **active** trip (departure pushed, or mid-trip) — same, plus the fact that
  participants are currently reading this itinerary on their phones.
- Reopening the date decision when dates are already confirmed — what happens to the candidate
  windows, and to the trip's status.
- Un-deciding a destination that a budget and itinerary were built around.
- Stepping a trip back from `confirmed` or `active` — and the status-drift question (§3.3).
- Un-archiving — the killed links, the frozen snapshot, the recorded actuals.
- Applying an AI draft over hand-edited content — how much existing work is about to be replaced.
- Changing a trip's base currency after amounts have been entered — are the numbers reinterpreted or
  converted? (Say what you chose; both are defensible, silence isn't.)
- ★ The reassuring inverse: when an action *is* safely reversible, say so. Half the value of
  intention §2.11 is users feeling free to commit because backing out is cheap. A warning that
  over-dramatises a reversible change is its own failure.

### 5.13 Currency viewing states ★

- Viewing in the trip's base currency (the default, and unmistakably the authoritative view).
- Viewing converted, with the "rates as of <date>" provenance visible.
- The currency switch itself — discoverable, and clearly a *view* control rather than a trip setting.
- ★ An editable money field while a converted view is active — the input stays in base currency
  (§3.13), so show how that reads without looking like a bug or inviting a mis-entry.
- Chosen currency unsupported by the rate source (INR→VND is the live example).
- Rate fetch loading, and rate fetch failed → graceful fall back to base with a notice.
- Stale rates (source updates daily; the user is here at 23:00 having loaded at 09:00).
- Converted **zero** and converted **very large** values — INR→VND multiplies by ~300, so a ₹80,000
  budget becomes a nine-digit number. Check your layouts survive it, and think about whether
  abbreviation is warranted.
- Every money surface converted consistently: budget categories, trip total, per-person split,
  per-person overrides, itinerary item costs, day and trip cost roll-ups, destination candidate
  per-person sketches, and archive actuals-versus-estimates.
- ★ An archived trip's actuals under conversion, with the rate date unmissable (§3.13).
- The participant view under conversion.

---

## 6. Out of scope — do not design these

- Chat, comments, polls, voting, threads, reactions, mentions, or any discussion feature.
- Notifications of any kind: email, push, or in-app. Link sharing is manual copy-paste, full stop.
- Booking or payment integrations; flight or hotel search.
- Expense splitting, settle-up, or who-paid-what. Only a single actual-spend number per budget
  category, after the trip.
- Photo or media storage. External album URLs only.
- Multiple groups, multi-tenancy, team management, roles beyond organizer/participant.
- Signup, registration, password reset, email verification, account settings, billing, plans.
- Internationalisation or localisation.
- Offline mode or realtime collaboration.
- Analytics, telemetry, cookie banners, marketing pages, landing pages.
- Any admin surface for configuring the AI provider (that's environment config, not UI).

---

## 7. Deliverables

### 7.1 Files

Produce a self-contained static site in a single directory:

- **`index.html`** — a clickable map of everything you built: every screen, and every state variant
  within it, reachable in one or two clicks. This is how the work gets reviewed. Make it genuinely
  navigable, not a bare list of links.
- **One HTML file per screen** in your information architecture, named for the job it does (e.g.
  `trip-workspace.html`, not `page-4.html`).
- **`states.md`** — the coverage checklist. Every row in §5 mapped to the file and anchor where it
  can be seen. Anything you deliberately chose not to design gets an explicit line saying so and
  why. **A row with no mapping is an incomplete deliverable.**
- **`ia.md`** — your information architecture rationale: the screen inventory, what you merged, what
  you split, what you added that doesn't exist today, what you removed, and *why* in terms of the
  twelve intentions in §2. Where you made a judgement call that could reasonably have gone the other
  way, say so and name the trade-off.
- **`system.css`** — copied from the `dense-product-ui` skill's `assets/`, linked by every page, and
  left unmodified. Put any additions in a second `overrides.css` so it stays obvious what you added
  and why. Load the IBM Plex Sans / IBM Plex Mono `<link>` the skill specifies.

No build step, no framework, no bundler. Every page must open by double-clicking the file.

### 7.2 How to show states

Every screen with multiple states carries a clearly-marked state switcher — a small strip, visually
distinct from the product UI and labelled as a review tool — that swaps between that screen's states
in place (loading, empty, dependency-blocked, populated, error, saving, AI-generating, AI-off,
AI-draft-ready, and so on as applicable). Vanilla JS, toggling classes or swapping DOM. The point is
that a reviewer can *see* every state without reading code.

Don't hide states in comments or in prose. If it isn't visible in a browser, it isn't delivered.

### 7.3 Content

Use realistic content throughout. **No lorem ipsum, no "Trip Name Here", no placeholder greeking.**
Real content exposes layout problems that placeholders hide.

Anchor sample data on this real trip, and invent siblings in the same spirit:

> **"Vietnam & Cambodia 2026"** — status `active`, dates confirmed 6–15 Nov 2026, destination
> decided, currency INR. Description: *"Ten days north-to-south through Vietnam, then over the
> border for the Angkor temples. Six of us, two joining from Europe. Street food first, museums
> second, one proper beach afternoon."* Vibe tags: street food, temples, boats, photography,
> first-time SE Asia. Six participants including **Asha Kumar** (Chennai, vegan, moderate pace, one
> passport on file expiring 2032). Goals: *"Angkor Wat at sunrise — the whole reason for the
> Cambodia leg"* (fixed 15 Nov, Siem Reap), *"One night on a Ha Long Bay junk"* (fixed 8 Nov, Bai Tu
> Long Bay), *"Hoi An tailoring with time for two fittings"* (Hoi An, no date), *"A proper
> Vietnamese cooking class, vegan-friendly"* (Tra Que herb village), *"Keep two half-days completely
> unplanned"*. Packing items like *"Passport + 2 photocopies, kept separately"*, *"Printed Cambodia
> e-visa (one per person)"*, *"Rain shell — Hoi An can still get wet in November"*.

Also build out: a trip still at `idea` with a broad date window and three competing destination
candidates; a trip at `planning` mid-chase with half the participants unconfirmed; and an archived
trip with actuals recorded against estimates, retrospective notes, and photo links.

For the currency work (§3.13, §5.13), use real figures — a ₹80,000-per-person Vietnam budget, viewed
in EUR by the two members joining from Europe (≈ €734 at the rate I verified), and attempted in VND
to demonstrate the unsupported-currency state.

### 7.4 Quality bar

- **Semantic HTML.** Real headings in order, real `<button>`s and `<a>`s used for their actual
  purposes, real labels tied to inputs, real tables for tabular data, real lists.
- **Keyboard reachable.** Every interactive thing focusable, in a sensible order, with a visible
  focus style. Any modal or overlay traps focus and closes on Escape.
- **Accessible states.** Never colour alone — pair it with text, an icon, or a shape. Live regions
  where content changes without navigation.
- **Responsive.** Every screen designed at mobile width as a deliberate layout, not a reflow
  accident. Wide content (tables, long itineraries) scrolls inside its own container; the page body
  never scrolls sideways.
- **Consistent.** One pattern per job. If two screens solve the same problem differently, that's a
  defect — the current build has several of these and you're expected to resolve them, not inherit
  them.

From the `dense-product-ui` rules, the ones this product will stress hardest:

- ★ **State versus degree — this app has both, and confusing them will cost you.** *State* is
  binary or categorical: trip status, profile confirmed or not, link active or revoked, item done or
  not. Per the skill, state is coloured text plus a dot. *Degree* is graded severity: document expiry
  (**expired** is worse than **warning**), how overdue a task is, how ready a trip is. Filled pills
  are reserved for degree. If you spend the pill on ordinary status, expiry severity has nowhere left
  to go — and expiry severity is the higher-value signal.
- **One hue, one meaning — including the greys.** The grey that means "secondary text" must not also
  mean "undecided" or "archived". This product has a lot of indeterminate states (dates TBD,
  destination open, nothing assigned yet) that will all reach for the same muted tone; separate them
  by form, not by inventing a hue.
- **Mono with `tabular-nums` for machine output.** Money, dates, day numbers, counts, durations,
  file sizes, timestamps. Sans for prose. In a budget-and-itinerary product this is most of the
  screen, and it's a semantic rule, not a stylistic one — columns of amounts must align.
- **One primary action per surface.** Note the tension with today's build, where some screens carry
  three competing save buttons (§5.3). If the recommended action changes with state, move the fill;
  don't add a second.
- **Copy: say what happened, not what the system is.** "Dates are no longer confirmed, so the trip
  moved back to Planning" beats "Invalid state". Buttons name the outcome — "Reopen the date
  decision", not "Edit". And **state consequences before the click**, which is exactly what §5.12
  demands.
- **Render every page and look at it.** Read the skill's `references/render-gotchas.md` — it lists
  the failures whose source looks correct and whose output isn't.

---

## 8. Freedoms — and an explicit invitation

You are **not** bound by the current app's structure. In particular you should feel free to:

- Merge screens that are artificially separate, or split any that are doing too many unrelated jobs.
- Invent surfaces that don't exist today if a job in §4 has no good home — several do.
- Change how a trip's sections are navigated, or abandon the section model entirely.
- Rethink where trip creation ends and trip editing begins.
- Rethink whether "readiness" is one screen, several, or something ambient throughout.
- Rethink whether the participant surface is one page or a short sequence.
- Decide what belongs on a trip's landing surface, if a trip should have one at all.

### Known problems in the current build — fix these, don't reproduce them

Details are in the sections above. Grouped by how much they matter.

**Dead ends and missing actions (highest value):**

1. No way to promote a candidate date window into the trip's final dates — the date workflow has no
   ending. (§3.4)
2. Conversely, the candidate-window editor stays fully editable *after* dates are confirmed, so the
   user can keep editing proposals that now affect nothing. (§3.4)
3. Nothing is reversible: status is forward-only, archive is one-way, a decided destination can't be
   un-decided. (§3.14)
4. No trip deletion at all — a trip created by mistake is permanent.
5. Documents can't be edited; fixing a mistyped expiry date means deleting and re-uploading the
   file.
6. "Which trips is this person on" doesn't exist anywhere in the people directory.
7. Readiness signals lead nowhere — nothing on that screen is a link to the thing that needs fixing.
8. Overdue items are one flat trip-level list, so "who am I waiting on" has to be assembled by hand.
9. There's no per-person readiness view, only per-trip.
10. Participant link expiry is supported but no UI exposes it.
11. An active link's URL can't be re-copied after you navigate away — the only recovery is to revoke
    and re-issue, which is correct given tokens are hashed, but nothing tells the user that.

**Wrong or misleading information:**

12. Document expiry is a crude expired/not-expired binary; the real rule has two tiers (**expired**
    and **warning**) computed against the trip's dates plus six months. (§3.2)
13. A budget where every estimate is zero renders identically to one that was never drafted. (§5.11)
14. An archived trip's UI says archiving locks the plan, then lets the basics be edited anyway.
15. Trip dates, a destination candidate's free-text "best dates", and a goal's fixed date are three
    unconnected notions of *when*, with nothing reconciling them.
16. Itinerary item times are free text ("09:00–11:00"), so nothing can validate, sort, or detect
    conflicts within a day.
17. Uploads accept any file type with no validation, so a `.zip` can be filed as a passport and
    nothing flags it. There's no preview or thumbnail either.
18. A returning participant can't tell they already confirmed their profile — the "confirmed" state
    is local to the session and vanishes on reload.

**Inconsistency (one job, several patterns):**

19. The same AI draft-review pattern is implemented five different ways across five features.
20. Dirty-state protection exists on two screens and not the other eight.
21. Confirm dialogs are applied unevenly — present for low-risk deletes, absent for irreversible
    decisions.
22. Some screens have three independent save buttons with no unified dirty indicator.
23. The forward-status control is duplicated verbatim in two places with no distinction.
24. Error presentation varies — toast, inline banner, and unstyled block, chosen inconsistently.
25. Loading treatment varies between skeleton, spinner, and nothing at all (one screen renders blank
    while fetching).

**Smaller, still worth fixing:**

26. A settings surface doing four unrelated jobs: identity editing, lifecycle, archival, and cloning.
27. Itinerary items reorder via ↑/↓ buttons only, though arbitrary reordering is supported.
28. Theme has light, dark, and follow-the-OS modes, but the control only cycles light↔dark — the
    system option is unreachable.
29. The "AI is off" message points at nothing and explains nothing; it reads as a fault.
30. Checklist-template search results are dead rows — not navigable, not visibly disabled.
31. Vibe tags are edited as a comma-separated text field but displayed as chips.
32. Budget categories are a fixed set of eight with no way to hide the ones a trip doesn't use.

**What would make this deliverable a failure:** missing states from §5; placeholder content; a
design that only works when everything is filled in; treating AI as required; a participant surface
that assumes a returning desktop user; or reproducing the current structure out of caution. If you
find yourself designing a screen that only ever looks good with complete data, you've missed the
point of §2.5.

Start with `ia.md` — decide the architecture and justify it before you write a single page.
