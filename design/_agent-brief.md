# Build brief for page authors

You are adding pages to a **finished, working design system**. Two pages already exist and are the
canon: **`trip.html`** and **`trip-dates.html`**. Read both before writing anything, plus
`overrides.css`, `_snippets.md` (shared skeleton + the sample data everyone must use) and `ia.md`.

**Your job is to match them, not to improve on them.** If two pages solve the same problem
differently that is a defect. Copy markup from the canon rather than inventing equivalents.

---

## Hard rules — a violation makes the page wrong

1. **Never edit `system.css`.** It is copied verbatim from a shared skill. Additions go in
   `overrides.css` — and check first, because almost everything you need is already there.
2. **No hex colours in markup. Ever.** Only `var(--token)`. A dark theme has to remain possible.
3. **Five semantic hues, one meaning each.** `--bad` destructive/expired/blocking · `--warn`
   degree/severity · `--ok` confirmed/decided/done · `--info` actionable · `--muted` indeterminate.
   Two things needing the same slot are separated by **form** (dashed edge, hatch fill, outline vs
   fill), never by a new hue.
4. **State is coloured text + a dot (`.state`). Filled pills (`.pill--1..4`) are for degree only** —
   in this product that means document-expiry tier and how overdue a task is. Do not spend a pill on
   ordinary status.
5. **Type sizes only from:** 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14.5, 15, 22, 26, 27.
   **No 16px, no 18px.** 17px is `.appbar__brand` only. Weights 400/500/600 only, no 700, no italic
   except where the italic itself means "this value is absent".
6. **Mono + tabular-nums for machine output** — money, dates, counts, times, sizes, IDs, day numbers,
   percentages. **Sans for prose.** Use `.dc__d--sans` when a detail line is a sentence. This is a
   semantic rule; getting it backwards is the most common defect.
7. **Rows are two lines**: identity 13.5px ink, metadata 12px muted.
8. **One primary action per surface.** If the recommended action changes with state, *move* the fill.
9. **Sentence case everywhere. Buttons name the outcome** ("Reopen the date decision", not "Edit").
   **State consequences before the click**, in counts and names, never "Are you sure?".
10. **Empty states never apologise and never just say "nothing here".** State the fact, explain the
    gap, name the risk, offer the action — and if there is nowhere for the action to go, drop the
    button and keep the fact.

## Render gotchas that have already bitten this project

- A clickable row containing links **must not be an `<a>`** — `<a>` inside `<a>` makes the parser
  close the outer one and the grid collapses. Use a `<div class="row row--link" data-href="…">` or a
  `<button class="wait" data-href="…">`; `app.js` handles the click. A `<button>` may not contain a
  link or another button.
- **Label-over-detail children must be `display:block`** — authored as `<span>`s they collapse onto
  one line. The existing classes (`.wait__n`/`.wait__d`, `.defrow__n`/`.defrow__d`) already are.
- `[hidden]` is `!important` in `system.css`, so toggling it beats any `display` rule. Use it.
- Disabled buttons need `disabled` on the element; `.btn:disabled` is already styled.
- Never offer an action the state can't support.

---

## The page skeleton — copy it exactly

Head, `<span id="live" class="sronly" aria-live="polite"></span>`, review strip, app bar, `<main
class="shell">`, `<div class="scrim" id="scrim"></div>`, `<script src="app.js"></script>`. All of it
is at the top of `_snippets.md` and in `trip.html`.

**App bar:** copy from `trip.html`. Include the `.lens` currency control **only on pages that show
money** (trip surfaces, `trips.html`, participant pages). Omit it on `people.html`, `person.html`,
`search.html`, `sign-in.html`, `not-found.html` — a view control with nothing to act on is noise.
When you include it, also copy the `#lensmenu` modal.

**Trip surfaces** additionally get the `.thead` block and the `.tnav` nav (Board · Itinerary · Budget
· People · Checklists) with `aria-current="page"` on the right one. Copy from `trip.html`.

**`#palette`** goes on every organizer page. Copy the short version from `trip-dates.html`.

## The state switcher — mandatory on every page

```html
<div class="rev"><div class="rev__in">
  <span class="rev__k">Review</span>
  <span class="rev__grp" data-axis="state">
    <span class="rev__lbl">Group label</span>
    <button class="rev__b" data-v="populated" aria-pressed="true">Populated</button>
    <button class="rev__b" data-v="empty">Empty</button>
  </span>
  <span class="rev__sp"></span><a href="index.html">All screens</a>
</div></div>
```

Content declares when it exists: `data-when="loading failed"` / `data-when-not="loading"`. A bare
token means the `state` axis; `lens:eur` addresses the lens axis. Several `.rev__grp`s may share
`data-axis="state"` — that just groups the buttons visually.

Anything in the product UI can drive it too: `data-set="state:loading"` on a button (used for
"Try again"), `data-set="lens:eur"` on a link.

**Every state you are asked for must be reachable from the strip and must actually render.** A state
that only exists in a comment is not delivered.

## Money — the currency lens

```html
<span class="money" data-m data-inr="₹80,000" data-eur="≈ €730" data-vnd="">₹80,000</span>
```

`data-inr` is authoritative. An empty/missing attribute for the active lens means "no rate" — the
base value keeps showing and a `data-when="lens:vnd"` banner explains why. `app.js` sets
`data-converted`, which mutes the figure. **Never put a converted value in a form field** — an input
is always in the trip's base currency; show the conversion beside it with `.inp__aside`.

Exact figures and rates: `_snippets.md`. Rounding: converted values round to the nearest 10 above
100, carry `≈`, and abbreviate (`≈ ₫142.3M`) only in slots too narrow for the full number.

## Components already built — check `overrides.css` before adding anything

`.rev` review strip · `.revnote` reviewer note · `.lens` · `.thead` `.tnav` · `.board` `.dgrid` `.dc`
decision card (`data-state="ok|warn|bad|info|open"`) · `.wait` waiting row · `.money` `.conv` `.prov`
rate provenance · `.thumb` (+ `--hide` `--none` `--pending`, `.thumb__lock` `.thumb__pg`) `.reveal`
`.pv` previewer · `.fg` `.fgrid` `.inp` `.inp__aside` form fields · `.prefill` `.carried` "from last
time" · `.dirty` `.saved` · `.modal` (+ `--wide` `--sheet`) `.damage` `.reassure` `.typeconfirm` ·
`.cmp` AI compare grid · `.gen` generating · `.aioff` AI unavailable · `.privacy` · `.day` `.it`
`.catm` `.anchor` `.overlap` itinerary · `.sk` `.skrow` skeletons · `.tick` `.undo` checklists ·
`.pshell` `.ptop` `.pstep` `.pbar` `.pdone` `.pblock` participant · `.lc` lifecycle · `.pal` `.kbd`
palette · `.drop` `.upl` upload · `.metrics` `.metric` (+ `--off` for never-drafted) · `.frozen`
`.frozen__k` · `.linkish`.

From `system.css`: `.card` `.row` `.dtable` `.facts` `.kv` `.defrow` `.banner` `.blank` `.state`
`.pill` `.tag` `.chip` `.segs` `.tabs` `.drawer` `.actionbar` `.ratio` `.progress` `.tl` `.snippet`
`.split` `.side`.

If you genuinely need something new, add it to `overrides.css` **in the system's idiom** with a
comment saying why, and mention it in your report.

## Sample data

**Use `_snippets.md` verbatim.** Same six people, same budget figures, same rates, same overdue
tasks, same sibling trips, on every page. No lorem ipsum, no "Trip Name Here". Realistic content is
what exposes layout problems.

Dates render as `6–15 Nov 2026` / `12 Jan 2027`. Money as `₹4,80,000` (Indian lakh grouping). Enums
always humanised: `non_veg` → "Non-veg", `primary_transport` → "Primary transport", `national_id` →
"National ID". **Never leak a raw enum.**

## Quality bar

Semantic HTML, headings in order, real `<button>`/`<a>` for their actual jobs, labels tied to inputs,
`<table>` only for genuinely tabular data. Keyboard reachable with visible focus. Modals get
`role="dialog" aria-modal="true"` and an `aria-labelledby`. Never colour alone — always a word too.
Wide content scrolls in `.dtable__scroll`; the page body never scrolls sideways. Include a mobile
consideration: the layout must be deliberate at 640px, not a squeeze.

## When you are done

Report back, in at most 25 lines: the files you wrote, every state you made reachable and its
`#state=` value, anything you added to `overrides.css` and why, and anything in your spec you could
not do. Do not paste HTML into your report.

---
---

# Page specs

Each spec lists the states that must be reachable. Add more if the page needs them.

## `trips.html` — the portfolio

The organizer's home. Six trips across five statuses. **Sorted by who needs you, not by date** — a
trip with three overdue tasks and an expired passport outranks a confirmed one that's fine.

Row per trip (use `.row row--link` with a `data-state` rail): name, status `.state`, dates (or "a
window in October" / "no dates yet"), destination (or "3 candidates" / "not decided"), people count,
and a **needs-you** cell naming the single most urgent thing ("Nikhil's passport expired", "5 of 9
unconfirmed", "nothing — ready to go"). Include a `.segs` filter by status with mono counts, and the
currency lens.

States: `populated` (6 trips) · `loading` (skeletons matching the row geometry) · `empty` (first run,
no trips ever) · `failed` (load failed, with retry, **explicitly distinct from empty** — a silent
failure rendering as "no trips yet" is a real bug this product had) · `archivedmixed` (archived trips
in among live ones, visibly different without being greyed corpses).

## `trip-new.html` — start a trip, or clone one

Must tolerate knowing almost nothing: only the name is required. No wizard gating, no "complete your
setup" nag. One form, one save, `data-section` per section, and a **draft-restored** notice.

States: `blank` (fresh) · `filling` (partly filled, dirty, save bar showing what will be saved) ·
`invalid` (name missing, with the error) · `restored` (a `.banner` saying a local draft was restored
and when — never a silent restore) · `newperson` (the "the person I want isn't in the directory yet"
case: add them inline **without losing in-progress work**) · `nopeople` (the directory itself is
empty — different copy and a different action from a first-run empty) · `clone` (see below) ·
`saving` (in-flight, controls disabled and legible) · `savefailed` (inline banner, **input preserved**).

The `clone` state is the repetition-killer and must state the carry-over/reset split **explicitly and
concretely** before the click — two columns, "comes with you" vs "starts fresh", with counts:
carried = name (new), vibe tags, origin city, currency, goal titles and notes, the 6 participants,
8 budget estimates and their bases, checklists with their items; reset = all dates, destination back
to open, the whole itinerary, budget overrides, goal fixed dates/places, checklist assignees and
done-state, documents, links.

## `people.html` — the directory

The reuse backbone. 20 people at realistic scale. Row: name, home city, preferences summary, document
count with the worst expiry tier as a `.pill`, and **which trips they're on** (count + the live one).

States: `populated` (20) · `loading` · `empty` (first run) · `failed` · `deleteblocked` (deleting a
person who is on a non-archived trip — name the trip, offer to open it) · `deleteok` (a person on no
live trip: confirm naming what goes, including their documents).

## `person.html` — one traveller

Profile (all §3.1 fields), documents with thumbnails, and **which trips they're on** — which does not
exist in the product today and is the reason this page exists. Also **this person's readiness across
the current trip**.

Documents are **obscured by default** here (`.thumb--hide` + `.thumb__lock`) with per-document
`.reveal` and a "Reveal all" — an organizer opens this in public. Type and expiry stay legible
through the blur.

States: `populated` (Asha Kumar — vegan, moderate pace, 1 passport to 2032, on 4 trips) ·
`noprefs` (every optional field unset — em dashes and italic "not set", never blank) · `manydocs`
(8 documents, half problematic: one expired, two warning, one unpreviewable, one very tall scan) ·
`nodocs` · `editdoc` (the metadata-only edit — type/number/expiry editable, **the file is not**, and
say so) · `saving` · `savefailed`.

## `trip-budget.html` — eight categories, and the currency lens under real stress

The highest-risk page. Eight fixed categories (not extensible — say so where a user would look for
"add category"), each with an estimate and a **basis** note. Trip total, equal per-person split, and
**per-person overrides** where overridden people come out of the equal-split maths — show that
arithmetic, don't just assert it. Figures in `_snippets.md`.

`state` axis: `populated` · `never` (never drafted — hatch `.metric--off`, and **visibly different
from** `zeros`) · `zeros` (every estimate genuinely `₹0`, plain mono — §8.13, these render
identically today and must not) · `loading` · `saving` · `savefailed` · `dirty` (unsaved, one save
bar naming what changed) · `override` (adding an override; plus the **blocked** case: you cannot
override for someone who isn't a participant — explain and offer to add them) · `aioff` · `aigen` ·
`aifailed`.

`lens` axis: `inr` `eur` `vnd` (unsupported — base values keep showing) `vndlive` (a source that
*does* have the dong: nine-digit numbers, `₫142,300,000` — **prove the table survives it**, full
digits in the table so the column aligns, abbreviated only in narrow card slots) `zero` (converted
zero) `stale` `failed`.

Also required: **an editable money field while a converted lens is active.** The input stays in
rupees; the conversion sits beside it in `.inp__aside`. Make it impossible to mistake which is which
— someone saving 734 into a field that means ₹80,000 must be structurally impossible.

AI draft links to `ai-review.html#state=budget`.

## `trip-itinerary.html` — days derived from dates

Ten days, 6–15 Nov 2026, ~41 items. Days **cannot be added or deleted by hand** — they are the trip's
dates. Say that where a user would look for "add day".

Each `.day` has a head (day number, date, where, item count, day cost roll-up) and `.it` rows: grab
handle, structured time, title + location + category `.catm` + notes, cost, actions. Reorderable —
`app.js` already handles ↑/↓ on `.it__grab`; also offer a drag affordance. Categories are Travel /
Food / Activity / Rest / Logistics, rendered as neutral `.catm` letter marks (category is not a
severity, so it gets no hue).

Times are **structured**, not free text (a deliberate change from today's build — say so once). An
item with no time sorts to the end of its day under a "no fixed time" divider. Two items overlapping
in one day show a **non-blocking** `.overlap` notice naming both.

A date-pinned goal appears as an `.anchor` row inside its day: "Ha Long junk" on Day 3 (8 Nov),
"Angkor Wat at sunrise" on Day 10 (15 Nov).

States: `populated` · `gaps` (Day 6 and Day 9 empty — and one of them is *meant* to be, because
"keep two half-days completely unplanned" is a goal; distinguish deliberate emptiness from an
oversight) · `nodates` (**dependency-blocked**: no itinerary because the trip has no dates. Different
copy and a different action from a first-run empty — route to `trip-dates.html`) · `loading` ·
`failed` · `packed` (one day with twelve items) · `dayregen` (per-day regeneration: a free-text
instruction box, "redo day 3, more relaxed", linking to `ai-review.html#state=day`) · `aioff` ·
`aigen` · `deleteitem` (confirm naming the item's time, location, cost and notes) · `readonly` (how a
participant sees it — link to `participant-itinerary.html`).

Include the currency lens: item costs, day roll-ups and the trip roll-up all convert consistently.

## `ai-review.html` — one review pattern for all five AI features

This page replaces five slightly different implementations. Use `.cmp` throughout: current on the
left, draft on the right, aligned row by row, each row individually keepable, and a `.actionbar`
counting exactly what applying will do.

`state` axis, one per AI feature plus the shared lifecycle states:
`budget` (8 categories — some changed, one unchanged, one new, one that was hand-edited 2 days ago
and is flagged as such) · `itinerary` (whole trip: 10 days, collapsed per day with counts, expandable)
· `day` (single-day regeneration from the instruction "redo day 3, more relaxed") · `packing` (items
to add to a packing list) · `destinations` (3–7 suggested candidates).
Then: `idle` (the invitation to generate — what it will be given) · `generating` (`.gen`, honest about
taking many seconds, saying what it is working from) · `failed` (recoverable, non-destructive,
existing work untouched, retry) · `aioff` (`.aioff` — a permanent expected condition, NOT an error;
the screen must feel complete and the manual path obvious; do not nag and do not point at a setting
the user cannot change) · `applied` (what happened, and an undo) · `partial` (some rows kept, some
skipped — use `data-skip` on `.cmp__row`) · `discard` (confirm discarding a draft) · `overwrite`
(applying over hand-edited content: say how much existing work is about to be replaced).

Also required: the **privacy reassurance** (`.privacy`) — an itemised list of what leaves the
deployment (aggregated preference counts, trip-level parameters like duration/destination/climate,
budget shape) and what never does (names, phones, emails, emergency contacts, medical notes,
allergies, document numbers, files). Two columns, `.privacy__c` and `.privacy__c--no`.

## `trip-people.html` — participants, links, and "who am I waiting on"

Carries two of the three composite readiness views: **who am I waiting on right now** (`#state=waiting`,
sorted by who blocks) and **this person's readiness on this trip** (an expandable row).

Per person: name, home city, profile confirmed `.state`, document count + worst expiry `.pill`, link
state, and what they're blocking. Every signal is a link or a button — never a bare mark.

Access links are the sharp edge. Design:
- **The link shown exactly once, at creation** — `.copyfall` fallback is already in `overrides.css`
  and `app.js` wires `[data-copy]`. Make the "you will never see this again" consequence clear
  *before* the user navigates away, and copying effortless.
- **Creating a link when one exists silently kills the old one** — warn *before*, not after.
- **Revoking** — immediate, irreversible; keep it irreversible and make re-issuing the obvious
  recovery. Say plainly that tokens are hashed, which is *why* an active link can't be re-copied.
- **Optional expiry in days** — supported by the backend, no UI exists today. Design it.
- **Link history** with creation timestamps and revoked/expired/active states, so the organizer can
  see who currently has access.

States: `waiting` (default) · `populated` · `twenty` (20 participants — awkward scale, must stay
readable) · `empty` (no participants; and the **dependency** case where the people directory itself
is empty) · `loading` · `failed` · `newlink` (the one-time reveal) · `relink` (warning that it kills
the existing one) · `revoke` (confirm) · `remove` (removing someone from the trip) · `expiry` (setting
an expiry) · `noclipboard` (clipboard denied — the fallback).

## `trip-checklists.html` — packing and tasks, templates in and out

Two kinds: **packing** (per-person items, participants tick their own) and **tasks** (trip-level, with
optional assignee and due date; overdue matters). Use `.tick` rows and `.undo`.

Deleting a checklist **item** gets **no confirmation** — instead the row is replaced in place by
`.undo` for a few seconds. Deleting a whole **checklist** does confirm, and states how many items go
with it. That inconsistency is deliberate; `ia.md` §4.8 justifies it, don't re-litigate it.

Overdue degree: `.pill--3` for ≥7 days, `.pill--2` for 1–6 days. Show what's overdue, when it was due,
and whose it is.

Templates: instantiate a template into the trip, and promote the trip's edited checklist back into a
template for next time. Templates belong to the organizer, not the trip.

States: `populated` · `overdue` · `forty` (40 items — awkward scale) · `empty` · `notemplate`
(**dependency-blocked**: can't instantiate because no templates exist yet) · `noassignee`
(**dependency-blocked**: can't assign a task because the trip has no participants) · `packingonly`
(AI packing suggestions are packing-only — a task-kind checklist cannot be suggested for; explain
rather than disable silently) · `templates` (the template library) · `promote` (promoting to a
template) · `deletelist` (confirm, naming the item count) · `deleteitem` (the no-confirm undo row) ·
`loading` · `failed` · `aioff` · `aigen`.

## `participant.html` — one phone page, no account, two minutes

Phone-first by construction: `.pshell` is a 460px column at every width. 44px touch targets. Use
`.ptop` (sticky, counts what's left), numbered `.pstep` sections, `.pbar` (fixed bottom), `.pdone`.

Order: trip facts → ① your details → ② your documents → ③ your checklist → ④ the itinerary (links to
`participant-itinerary.html`).

The **pre-filled** moment is the whole payoff of §2.1 and must be unmistakable: `.prefill` with
"This is what we have from Sri Lanka 2025 — still right?" and a single confirm. Not a silent default.

They must **never** see other participants' documents, phones, emails, emergency contacts, medical
notes, allergies or profiles; the budget; or the participant list. Say so somewhere reassuring.

Their own documents ARE shown plainly — no reveal step for your own passport on your own phone.

Include the currency lens: the two Europe-based members are the motivating case. Same read-only lens.

States: `prefilled` (default — Asha Kumar returning) · `newperson` (brand-new, empty profile) ·
`saved` (confirmed, persistent — a returning participant must be able to tell they already confirmed;
today that state is session-local and vanishes on reload) · `done` (the overall "you're done" finish
state) · `tbd` (trip dates and/or destination undecided — must read as *reassuring*, not broken) ·
`docsnone` · `docsproblem` (a document that is a problem for THIS trip) · `upload` (choosing,
progress, success) · `uploadbig` (rejected over 10 MB) · `uploadtype` (rejected unsupported type) ·
`checklistempty` · `checklistpartial` · `checklistdone` · `loading` · `savefailed` (input preserved) ·
`invalid` (name missing).

## `participant-itinerary.html` — reading the plan during the trip

Phone, one-handed, possibly poor signal. Ten days; today's day surfaced first and marked. No editing
anywhere. Times, places, costs, notes. Their own packing items for the day if any.

States: `today` (default, mid-trip — Day 3) · `beforetrip` (nothing has started; Day 1 is next) ·
`daydetail` · `emptyday` (a deliberately unplanned half-day — reads as intentional) · `loading` ·
`stale` (loaded a while ago, pull to refresh) · `notbuilt` (organizer hasn't built it yet — say what
to expect and when). Include the currency lens.

## `participant-blocked.html` — the link doesn't work

`.pblock`. **Expired, revoked and never-existed are deliberately indistinguishable** — one message
covering all three, to prevent enumeration. Written for a non-technical person on a phone, with a
sensible suggestion (ask the organizer for a new link) and **no retry-forever loop**.

States: `bad` (default — the one message) · `temporary` (a retryable server failure, visibly
*distinct* from a bad link, with a retry) · `ratelimited` (30 requests/minute — say when to try
again) · `loading`.

## `documents.html` — the vault and every preview state

Exists because the product has no preview at all today and accepts any file type. Accepted types:
JPEG, PNG, HEIC, WebP, PDF. Max 10 MB, one at a time.

Thumbnail states: `.thumb--pending` (generating) · image thumbnail · PDF first-page thumbnail with a
`.thumb__pg` page-count badge · `.thumb--none` (nothing renderable — a designed state, not a broken
image icon) · a thumbnail whose source fails after the fact · `.thumb--hide` obscured with
`.thumb__lock`. Plus a very tall scan, a very wide one, and a low-quality phone photo in the same
fixed slot — these break naive layouts, so render them and check.

Previewer (`.pv`): image in place at a readable size; multi-page PDF with page navigation; the
no-preview fallback showing filename, type, size and a download action.

Use real embedded images — build them as tiny inline `data:` URI SVGs (a fake passport page, a visa
sticker, a vaccination certificate). Do not hotlink anything; every page must open by double-click
with no network.

States: `mixed` (default — a list mixing images, PDFs and one unpreviewable file) · `previewimage` ·
`previewpdf` · `previewnone` · `obscured` · `revealed` · `pending` · `thumbfailed` · `tall` · `wide` ·
`lowquality` · `upload` · `toobig` (over 10 MB, rejected, stating the actual size) · `badtype` (a
`.zip` filed as a passport — rejected, naming the accepted list) · `editmeta` (metadata-only edit;
the file itself is immutable and replacing it is an upload) · `delete` (confirm) · `empty` ·
`loading` · `failed`.

Also state, once and quietly, that files are served only through authorised access and never a public
URL.

## `search.html` — the full results page

Cross-entity over six kinds: trips, people, documents, itinerary items, checklist templates,
archived-trip notes. Minimum 2 characters. Results grouped by kind with mono counts, and `mark.hit`
on the matched substring.

**Checklist templates are the one kind that is not independently navigable** — render them
differently: a non-interactive row that states why and offers "use it on a trip" instead. Not a dead
row, not a silently disabled one.

Explain the relationship to the ⌘K palette: the palette is the fast path (top 3 per kind), this page
is for browsing and overflow.

States: `results` (default, all six kinds) · `noquery` (say what is searchable) · `tooshort` (under 2
characters) · `loading` · `nomatch` (state what *was* searched, don't apologise) · `failed` ·
`keyboard` (a note showing the palette's keyboard model — or demo the palette itself).

## `trip-archive.html` — a retrospective document, not a greyed-out corpse

Sri Lanka 2025, archived, with actuals recorded. The **frozen/editable boundary must be visually
obvious** — this is contradictory in the product today. Frozen: itinerary, budget estimates,
checklists (use `.frozen` + `.frozen__k`). Editable forever: retrospective notes, photo album links
(external URLs only — the app never stores media), and actuals (one real-spend number per budget
category against the estimate).

Actuals vs estimates: a real table with variance per category and a total. No expense splitting, no
who-paid-what, ever.

**Un-archiving is the hardest reversal in the product.** It must answer: what happens to the six links
archiving killed (they were hashed — they do not come back; re-issuing is per-person with a one-time
secret), and what happens to the frozen snapshot, and to the recorded actuals. Give it real thought;
a plain "Unarchive" button is a failure.

Currency: an archived trip's actuals were spent at the rates of the time, so converting them at
today's rate shows a number that was never true. The rate date must be **unmissable** here —
this is the surface where a reader is most likely to mistake a converted figure for what was paid.

States: `populated` · `noactuals` (archived but nothing recorded yet) · `partialactuals` · `unarchive`
(the dialog) · `rearchive` (**blocked**: cannot re-archive an already-archived trip — explain) ·
`editnotes` · `addalbum` · `loading` · `failed`. Lens axis: `inr`, `eur` (with the unmissable rate
caveat), `stale`.

## `trip-destination.html` — comparing candidates is a decision-support surface

Not a list of cards. Three to seven candidates compared side by side so the group can actually choose:
name, rationale, best dates (free text), estimated per-person budget, caveats (weather, permits,
travel time), and source (AI or manual). Use a real comparison table that scrolls in
`.dtable__scroll`, with the per-person figures aligned in a mono column so they can be compared.

Exactly one candidate can be decided; deciding is exclusive; a decided candidate cannot be deleted.

Note that a candidate's free-text "best dates" and the trip's actual dates are two different notions
of *when* — reconcile them visibly rather than leaving them unrelated (a listed problem).

States: `open` (3 candidates being compared — Alleppey, Kumarakom, Munnar for the Kerala trip) ·
`decided` (Vietnam & Cambodia chosen, with the un-decide path) · `undecide` (the dialog: a budget and
a 10-day itinerary were built around this choice — name what that means) · `empty` (no candidates) ·
`sparse` (a candidate with only a name and nothing else filled in) · `deletecandidate` (confirm) ·
`deleteblocked` (it's the decided one — explain) · `invalid` (candidate name missing) · `aioff` ·
`aigen` · `aisuggest` (3–7 generated, linking to `ai-review.html#state=destinations`) · `loading` ·
`failed`. Lens axis: `inr`, `eur`, `vnd`.

## `sign-in.html` — and the session that expired

Email + password. **No signup, no password reset, no account management** — organizer accounts are
provisioned outside the app. Do not design a registration flow, and do not link to one.

States: `idle` · `submitting` (control disabled and legible) · `wrong` (wrong credentials — one
message, no hint about which field) · `expired` (**session expired mid-work**: say what the user was
doing, whether their unsaved input survived, and return them to where they were, not to a home page.
This is the state that matters most on this page) · `signedout` (a deliberate sign-out) · `failed`
(the server is unreachable — distinct from wrong credentials).

## `not-found.html` — unknown URL, and a trip that isn't yours

Two states, one of which is deliberately ambiguous.

States: `url` (an unknown URL — plain, with a route back) · `trip` (**trip not found, or not yours —
indistinguishable by design**, because distinguishing them would leak whether a trip exists. Say
enough to be useful without leaking) · `person` (same for a person).

## `patterns.html` — the consequence-and-reversal catalogue

Renders every consequence dialog and reversal path **inline, side by side, not as overlays**, so a
reviewer can see that eleven warnings are one system. Explain at the top why the page exists and that
each dialog also lives in its real context (link to it).

Every row of the reversibility catalogue: advance status · step back · archive · un-archive · mark a
destination decided · un-decide · confirm dates · promote a window · reopen the date decision · shift
vs re-date a confirmed trip · shift an active trip · revoke a link · create a link over an existing
one · delete a person / document / goal / itinerary item / checklist / checklist item · delete a trip
· edit a document · apply an AI draft over hand-edited content · change the trip's base currency.

Group them under two headings that the product treats differently, and say why:
**genuinely destructive** (data is gone) versus **merely decided** (a choice that can be re-opened).
Only the first deserves finality.

Also carry, prominently, the **reassuring inverse** (`.reassure`): the notice shown when an action IS
safely reversible. Half the value of "nothing is concrete" is users feeling free to commit because
backing out is cheap, and a warning that over-dramatises a reversible change is its own failure.

Include the **status-rollback** explanation at `#state=rollback` (linked from `trip.html`): editing
confirmed dates 6–15 Nov → 8–17 Nov keeps them exact so the trip stays Confirmed; reverting them to a
broad window destroys the precondition so it drops to Planning. The difference between "edited" and
"invalidated" is the whole idea, and the rollback is announced before the click, never discovered
after.

This page needs no `state` axis if everything is inline; if it gets long, group with `.segs` filters
and give it a `state` axis of `all`, `destructive`, `decided`, `rollback`.
