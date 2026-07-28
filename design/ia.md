# Information architecture — Tripper redesign

Companion to `states.md` (the §5 coverage checklist) and `index.html` (the clickable map).
Everything here is argued against the twelve intentions in §2 of `docs/redesign-brief.md`.

---

## 1. The one idea the architecture is built on

> **A trip is a set of decisions, some made and some open.** Everything else is a consequence of
> those decisions.

Dates are a decision. Destination is a decision. The itinerary is *derived* from the dates
decision. The budget's per-person split is derived from the participant decision. Status is derived
from whether the dates and destination decisions still hold (§3.3).

The current build models a trip as **ten peer sections** — dates, destination, goals, budget,
itinerary, checklists, people, readiness, settings, overview — arranged as a nav list. That
flattening is the root cause of most of the numbered problems in §8. When "readiness" is a sibling
of "dates", a readiness signal has nowhere to point *except* another section, which is exactly why
none of them link anywhere (§8.7). When "settings" is a peer of "budget", lifecycle and archival and
cloning and identity-editing all land in it because nothing else will take them (§8.26).

So the redesign is not a re-navigation of ten sections. It is a different object model:

| Layer | What it holds | Surface |
|---|---|---|
| **The decisions** | dates, destination, goals, status, currency base, existence | `trip.html` — one board |
| **The consequences** | itinerary, budget, people & access, checklists | four deep surfaces |
| **The closing** | snapshot, actuals, retrospective, un-archive | `trip-archive.html` |

The board is not a dashboard summarising the deep surfaces. It is where the decisions *are made and
unmade*. That is why "Reopen the date decision" lives on the board and not in a settings page.

---

## 2. Screen inventory

22 pages. Named for the job, not the position.

### Shell and cross-cutting

| File | Job | Notes |
|---|---|---|
| `index.html` | The review map | Every screen, every state, one or two clicks. Not a deliverable of the product. |
| `sign-in.html` | Signed out, sign in, session expired | No signup, no reset, no account management — §4.1.1. |
| `not-found.html` | Unknown URL · trip not found or not yours | The two are one message by design: no existence leaks. |
| `search.html` | Full cross-entity results | Plus the ⌘K palette, which is present on every organizer page. |
| `patterns.html` | **New.** The consequence-and-reversal catalogue | See §6. |

### Portfolio and the reuse backbone

| File | Job | Notes |
|---|---|---|
| `trips.html` | The portfolio across five statuses | §4.1.2. Sorted by *who needs you*, not by date. |
| `trip-new.html` | Start a trip from almost nothing, or from a clone | Merges today's `TripNewView` wizard and the clone action. |
| `people.html` | The people directory | §4.1.4. |
| `person.html` | One traveller: profile, documents, **which trips they're on** | The last part does not exist today (§8.6). |
| `documents.html` | **New.** The document vault and every preview state | See §5. |

### The trip

| File | Job |
|---|---|
| `trip.html` | **The board.** Decided vs open, who you're waiting on, lifecycle, and every reversal. |
| `trip-dates.html` | The three date modes, promoting a window, reopening the decision. |
| `trip-destination.html` | Candidate comparison, deciding, un-deciding. |
| `trip-itinerary.html` | Days derived from dates; items; per-day regeneration. |
| `trip-budget.html` | Eight categories, the split, per-person overrides, the currency lens under stress. |
| `trip-people.html` | Participants, access links, per-person readiness, "who am I waiting on". |
| `trip-checklists.html` | Packing and tasks, templates in and out. |
| `trip-archive.html` | The retrospective document: snapshot, actuals, notes, albums, un-archive. |
| `ai-review.html` | **New.** The single draft-review surface all five AI features share. |

### The participant

| File | Job |
|---|---|
| `participant.html` | One phone page: trip facts → confirm details → documents → checklist → done. |
| `participant-itinerary.html` | Reading the plan during the trip, one-handed. |
| `participant-blocked.html` | Bad link, temporary failure, rate-limited. |

---

## 3. What I merged, split, added and removed

### Merged

**Ten trip sections → one board plus four surfaces.** Dates, destination, goals and lifecycle were
four sections holding, between them, about one screen of content and all of the product's
irreversible actions. They are now regions of the board, with the two that need room
(`trip-dates.html`, `trip-destination.html`) presented as full-width sheets over it. They get their
own files so a reviewer can deep-link them; in the product they are overlays and the board stays
behind.

*Trade-off, stated:* a sheet is harder to link to and harder to bookmark than a page. I took that
cost because the alternative — leaving the date decision as a page you navigate away to — is what
lets today's build present a candidate-window editor that no longer affects anything (§8.2). On the
board, the dates card *shows its own state*, so a vestigial editor cannot hide.

**Readiness dissolved into the board and `trip-people.html`.** There is no readiness screen. §5.8
asks for three composite views; I built them as:

- *the trip's readiness* → the board's **Open / waiting on** column,
- *who am I waiting on right now* → `trip-people.html`, sorted by who is blocking,
- *this person's readiness across the trip* → the person row expanded, and `person.html` for the
  cross-trip view.

Every signal in all three is a link or a button. Not one is a bare coloured mark. That is the whole
reason for the change (§8.7).

**`TripSettingsView`'s four unrelated jobs split up.** Identity editing (name, description, tags,
origin, currency base) is a drawer on the board, because it is editing the trip's own facts.
Lifecycle is the board's footer strip, because status is a decision. Archival is a lifecycle step.
Cloning moved to `trip-new.html`, because the output of a clone is a *new trip* and that is where a
new trip is made. Fixes §8.26.

**The two duplicate forward-status controls (§8.23) collapsed to one**, in the lifecycle strip.

### Split

**Trip creation from trip editing.** `trip-new.html` captures only what is cheap to know at minute
one and does not gate on anything. Everything else is edited on the board afterwards. There is no
"complete your trip setup" nag, because §2.5 says an unfinished trip is not an error.

**Document previewing from document listing.** `documents.html` exists because §3.2 and §5.7 ask for
eleven distinct preview and thumbnail states, and burying them inside `person.html` would have meant
designing two of them and gesturing at the rest.

### Added (does not exist today)

1. **The board itself** — a decided/open surface. §2.2 is called "the product's core value" and today
   there is no screen whose job it is.
2. **`ai-review.html`** — one review pattern replacing five (§8.19).
3. **Promote a candidate window to final dates** — the date workflow had no ending (§8.1).
4. **Every reversal** — un-decide, step back, reopen, un-archive, metadata edit, trip delete (§3.14).
5. **"Which trips is this person on"** on `person.html` (§8.6).
6. **Per-person readiness** (§8.9), and link expiry (§8.10).
7. **The currency viewing lens** (§3.13) — new feature, designed from scratch.
8. **Document thumbnails and previews** (§8.17).
9. **The two-tier expiry rule** rendered as two tiers (§8.12).
10. **`patterns.html`** — see §6.

### Removed

- **The theme cycle control.** Not removed as a feature — see §9. The *control* is gone from the app
  bar in these mockups because the mockups are light-only and a control that cycles to nothing is
  worse than none (§8.28).
- **Three-save-buttons surfaces.** One save per surface, everywhere (§8.22).
- **Toasts.** Every confirmation is inline and persistent, every error is an inline banner at the
  surface it belongs to. This resolves §8.24 by removing one of the three patterns entirely.
- **The comma-separated vibe-tag text field** (§8.31). Tags are chips in and chips out.

---

## 4. Decisions the brief left to me

### 4.1 Trip deletion: yes, but only for a trip that is genuinely junk

A trip may be deleted **only while its status is `idea` and nothing has been added** — no
participants, no dates, no destination candidates, no budget figures, no itinerary, no documents,
no links ever issued. Any trip richer than that must be archived.

*Why:* the failure §8.4 describes is "a trip created by mistake is permanent", and a
created-by-mistake trip is always brand new. Once six people and a budget are attached, deletion is
not the user's real intent — archival is. This gives the escape hatch without adding a way to
destroy real work. The confirm names exactly what exists, so if anything *does* exist the user finds
out there rather than losing it.

*Trade-off:* an organizer who fills in a junk trip before noticing has to archive it and live with
it in the archive. I judged a permanently recoverable archive entry cheaper than a delete button
that can reach a real trip.

### 4.2 Document thumbnails: obscured by default for organizers, plain for the owner

A document thumbnail is blurred, hatched, and captioned `hidden` in every organizer-side list, with
a per-document **Reveal** and a per-list **Reveal all**. On the participant's own surface, their own
documents are shown plainly with no reveal step.

*Why:* §3.2 poses the real scenario — an organizer scrolling readiness on a train. The passport
number and photograph are legible personal data and there is no reason for them to be on screen by
default when the *readiness* question is answered entirely by type + expiry, which stay legible
through the blur. Conversely, asking someone to click Reveal to check their own passport on their
own phone is theatre.

*Trade-off:* an organizer verifying that six scans are the right documents pays six clicks, or one
on Reveal all. Acceptable — that is a rare task, and Reveal all exists for it.

### 4.3 Documents get a metadata-only edit

Type, number and expiry are editable. The file is not: replacing it is an upload, and the confirm
says the current file will be dropped. §3.14 invited the argument and I am making it — the
alternative is that fixing one mistyped digit costs a re-upload of a 4 MB phone photo over hotel
wifi, and the expiry date is the field that drives the entire warning rule.

### 4.4 Itinerary item times become structured

Two optional selects (start, end) on a 15-minute grid instead of free text. A day with overlapping
items shows a **non-blocking** notice naming the two items.

*Why:* §8.16. Free text means nothing can sort, validate or detect a conflict, and the itinerary is
the surface participants read during the trip.

*Trade-off, and it is real:* free text can hold "morning-ish" and "after the market closes", which a
15-minute grid cannot. Mitigation: both fields are optional and an item with no time sorts to the end
of the day under a "no fixed time" divider, which is a designed state rather than a blank. This is a
data-model change, not just a UI one — flagged for the backend.

### 4.5 One dirty-state policy, applied to all ten surfaces

- **One save per surface.** A single sticky action bar; the primary button names what it will save.
- **Per-section dirty dots** so a long editor tells you *where* the unsaved change is.
- **Draft kept locally** and restored on reload, with a visible "restored from a draft" notice — not
  a silent restore, which would be a worse bug than losing it.
- **A navigation guard** when dirty.

§5.3 asked for one coherent policy rather than today's two-of-ten (§8.20). Autosave was the
alternative; I rejected it because half these surfaces are money and dates that other people are
reading, and "I was still thinking" needs to be a state the system can hold.

### 4.6 Loading: skeleton when the layout is known, spinner only inside a control

Lists, boards and tables get skeletons that match the real row geometry. A spinner appears only
inside a control that is in flight (a Save button, a Generate button). Nothing ever renders blank
(§8.25).

### 4.7 Save confirmation is inline and persistent

The action bar becomes `Saved · 2 minutes ago` and the section dots clear. No toast anywhere.

*Why:* a toast is missable and unrecoverable, and this product deliberately has no notification
system at all (§6 of the brief) — introducing an ephemeral notification channel for save
confirmations alone would be the only such channel in the app.

### 4.8 Deleting a checklist item gets no confirmation

It is the highest-frequency delete in the product and trivially re-creatable. Instead the row is
replaced in place by an undo affordance for a few seconds.

This *is* an inconsistency with the other deletes and I am keeping it deliberately, which §5.4 asked
me to be able to justify: a confirm dialog is priced in interruption, and the price is only worth
paying when the loss is expensive or hard to reverse. Retyping "Rain shell" is neither. The rule I
applied everywhere: **confirm when the loss is unrecoverable or the user cannot see what they are
about to lose.** A checklist item fails both tests.

### 4.9 Changing a trip's base currency offers both readings explicitly

Neither silent option is acceptable, so the change is a choice with a live preview of both:

- **Reinterpret** (default) — ₹80,000 becomes €80,000. The numbers you typed stay; only the label
  changes.
- **Convert at today's rate** — ₹80,000 becomes €734, and the rate and date are recorded on the trip.

*Why default reinterpret:* conversion rewrites authored figures using an approximate daily rate, and
those figures came with bases like "9 nights × 3 rooms × ₹4,000" that conversion silently falsifies.
Reinterpreting is wrong in an obvious way you can see and fix; converting is wrong in a way that
looks right. The dialog says exactly that.

### 4.10 Search keeps both paths

⌘K palette on every organizer page (top 3 per kind, "see all N" into the full page) plus
`search.html` for browsing. §3.12 says a fast keyboard path is high value for a repeat expert, and a
palette cannot show 40 matches usefully.

**Checklist templates are the one result kind that is not independently navigable.** In the palette
they render as a non-interactive row with the reason stated inline and a link to a trip's checklists
instead. Not a dead row (§8.30), not a disabled-looking row with no explanation.

### 4.11 The currency lens is in the app bar, and only where money is

It sits with the other view controls in the app bar as `INR ▾`. It is a per-viewer preference, so it
persists across trips and screens and is never rendered inside a trip's own settings — §3.13 is
emphatic and it would be easy to get wrong, because the trip *also* has a currency field and that
one is a trip setting.

It is **omitted on `people.html`, `search.html`, `sign-in.html` and `not-found.html`**, which have no
monetary figure on them. A view control with nothing to act on is noise. It is present on every trip
surface, on `trips.html` (which shows budgets), and on the participant surface — §3.13 names the two
Europe-based members as the motivating case.

### 4.12 Checklists got a fourth deep surface

The chosen architecture named three deep surfaces (itinerary, budget, people). I added a fourth for
checklists: 40 items across two kinds, with templates flowing in and out, does not fit a drawer, and
the overdue tasks on the board need somewhere to land. Recorded here because it is a departure from
what was approved.

### 4.13 Converted figures round coarsely, and abbreviate only in tight slots

A converted amount carries `≈`, sits in the muted ink, and rounds to the nearest 10 above 100. In a
table it prints in full so the column aligns; in a card slot too narrow for nine digits it
abbreviates (`≈ ₫142.3M`). §5.13 asked whether abbreviation is warranted: it is, but only where the
full number would truncate — abbreviating a column would break the alignment that makes the column
readable.

---

## 5. The document surface

§3.2 says these are almost always phone photos and PDFs, and §8.17 says today there is no preview at
all and no type validation. `documents.html` designs:

- thumbnail generating, image thumbnail, PDF first-page thumbnail with a page-count badge, the
  no-preview fallback, and a thumbnail whose source fails after the fact;
- the in-place previewer for an image and for a paged PDF;
- a very tall scan and a very wide one in the same fixed slot, and a low-quality phone photo;
- a list mixing all of the above plus one unpreviewable file;
- the two expiry tiers computed against *this* trip;
- rejection for exceeding 10 MB and rejection for an unsupported type.

**Accepted types:** JPEG, PNG, HEIC, WebP, PDF. Everything else is rejected at selection with the
reason and the accepted list — a `.zip` filed as a passport is §8.17's exact bug.

---

## 6. `patterns.html`, and why a catalogue page is legitimate

Every consequence dialog also exists in its real context: archiving on the board, revoking a link on
`trip-people.html`, applying a draft on `ai-review.html`, and so on. `patterns.html` renders the
whole §3.14 catalogue and the whole §5.12 list **inline, side by side, not as overlays**.

Two reasons. First, §7.4 says "if two screens solve the same problem differently, that's a defect" —
consequence warnings appear in eleven places and the only way to *see* that they are one system is
to put them next to each other. Second, a reviewer checking §5.12 coverage should not have to find
and open eleven overlays across eight pages.

It also carries the reassuring inverse §5.12 ends on: the notice shown when an action **is** safely
reversible. A warning that over-dramatises a reversible change is its own failure, so the system
needs a component for "this is cheap to undo" and needs it to look like it belongs to the same family
as the one for "this destroys six links".

---

## 7. State versus degree — how the two colour systems are spent

The skill warns that spending the filled pill on ordinary status leaves expiry severity nowhere to
go, and that this product will stress exactly that. So:

| Signal | Kind | Treatment |
|---|---|---|
| Trip status (idea…archived) | state | coloured text + dot, `.state` |
| Profile confirmed / not | state | `.state--ok` / `.state--muted` |
| Link active / revoked / expired | state | `.state` |
| Checklist item done / not | state | checkbox + strike |
| Decision decided / open | state | `.state`, plus a **dashed** card edge for open |
| **Document expiry** | **degree** | `.pill--4` expired · `.pill--3` warning |
| **How overdue a task is** | **degree** | `.pill--3` ≥7 days · `.pill--2` 1–6 days |
| Readiness | neither | a count and a labelled ratio bar, never a percentage badge |

Readiness deliberately gets no pill and no percentage. §2.6 says design toward actionability, not a
pretty aggregate — so the board says `2 of 6 profiles`, `1 document expired`, `3 tasks overdue`, each
a link, and never `68% ready`.

### One hue, one meaning — including the greys

This product has many indeterminate states that would all reach for the same muted tone: dates TBD,
destination open, nothing assigned, preference unset, never drafted. They are separated **by form**:

| Indeterminate thing | Form |
|---|---|
| An open decision | dashed card edge + dashed rail (`.dc[data-state="open"]`) |
| A value never entered | italic sans in `--muted` |
| A budget never drafted | hatch fill (`.metric--off`) — distinct from a budget of zeros, which prints `₹0` in plain mono. §8.13. |
| A frozen archived region | diagonal hatch overlay + a `Frozen` chip |
| An unset preference | em dash in `.dash`, never blank |
| A rate that could not be fetched | dashed lens border + a stated notice |

Grey-as-secondary-text and grey-as-indeterminate are therefore never confusable: the second one
always has a texture or a shape.

---

## 8. Mobile

Two breakpoints, 768px and 640px, and the participant surface is phone-first by construction rather
than by media query — it is a 460px column at every width, because that is its real context.

- The board's two columns stack, **open/waiting first**. On a phone the organizer is answering "who
  do I chase", not admiring what is settled.
- The itinerary item row re-grids from five columns to a two-line stack; time and cost drop to the
  second line rather than shrinking.
- The AI compare grid drops the "now" column at 900px and inlines the previous value under the
  proposed one — a two-column diff does not work at 380px, and shrinking the type is not an answer.
- Modals become bottom sheets with stacked full-width 44px buttons.
- Wide content (budget table, 20-person list) scrolls in its own container; the body never scrolls
  sideways.

---

## 9. The theme question — flagged, not resolved

**This is an open product decision and I have not decided it.**

`dense-product-ui` is light-mode only, so these mockups are light-mode only. But the current product
ships light, dark, and follow-the-OS, and dropping dark mode would be a real regression for a group
that will read an itinerary in a hotel room at 1 a.m.

What I did to keep the door open:

- every colour in `overrides.css` is a token or derived from one — there is no hex in any page's
  markup;
- no meaning is carried by "it is on a light background" — every state has a word, and every
  indeterminate state has a form (§7 above), so the whole system survives a background inversion;
- the hatch and dash textures are defined once as `--hatch-off` and `--dash-line`, so a dark theme
  restyles them in two places;
- the obscured-thumbnail treatment is a blur plus an overlay, not a light wash.

**What needs deciding, by you:** whether dark mode is re-implemented as a second token set (cheap,
given the above), and whether the follow-the-OS option returns — today it exists but is unreachable
because the control only cycles light↔dark (§8.28). If dark returns, the control needs three states,
which means it stops being a toggle and becomes a small menu.

---

## 10. Judgement calls that could reasonably have gone the other way

1. **Dates and destination as sheets over the board rather than pages.** Argued in §3. The other way
   is defensible; I traded linkability for making a vestigial editor impossible to hide.
2. **No readiness screen at all.** A single "are we ready" page is what §4.1.11 literally asks for. I
   read the *intent* (§2.6, §8.7) as "make every signal actionable", and a dedicated page tends to
   become a place signals go to be counted. If the board's waiting column proves too cramped in real
   use, `trip-people.html` is already the page it would grow into.
3. **The trip's landing surface is the board, not the itinerary.** For an `active` trip the itinerary
   is arguably what the organizer wants first. I kept the board because the board is where a
   mid-trip date change is made, and §5.12 makes that a first-class scenario. The board's itinerary
   card links straight through, so the cost is one click.
4. **Goals live on the board, not with the itinerary.** They are constraints on planning, not plan
   content — but they are *read* while editing the itinerary. Mitigation: a date-fixed goal renders
   as an anchor row inside its itinerary day, so the constraint is visible where it binds.
5. **Trip status is shown but not celebrated.** No progress bar across the five statuses as a
   ratchet, because §2.11 says it is not one. The lifecycle strip shows where you are and what each
   neighbouring step requires, in both directions.
6. **One save per surface rather than autosave.** Argued in §4.5.
7. **Reinterpret as the default on a base-currency change.** Argued in §4.9.
