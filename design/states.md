# states.md — the coverage checklist

Every row of §5 of `docs/redesign-brief.md`, mapped to the file and state where it can be seen.
**A row with no mapping is an incomplete deliverable**, so anything deliberately not designed carries
an explicit line saying so and why.

**How to read a mapping.** `trip.html#state=empty` opens that page with that state already selected.
Each page's dark **Review** strip at the top switches states in place; the strip is a review tool and
is visually distinct from the product. Two axes exist: `state` and `lens` (the currency lens), and
they compose — `trip-budget.html#state=populated&lens=vndlive`.

`index.html` is the clickable map of all of it.

---

## 5.1 Session and shell

| Row | Where |
|---|---|
| Signed-out view | `sign-in.html#state=signedout` |
| Sign-in idle | `sign-in.html#state=idle` |
| Sign-in submitting | `sign-in.html#state=submitting` |
| Sign-in wrong credentials | `sign-in.html#state=wrong` |
| ★ **Session expired mid-work** | `sign-in.html#state=expired` — says what the user was doing, whether the unsaved input survived, and returns them to where they were rather than to a home page |
| Unknown URL / not found | `not-found.html#state=url` |
| Trip not found, or not yours (indistinguishable by design) | `not-found.html#state=trip`, and `not-found.html#state=person` for a person. One message; no existence leak |
| ★ **Theme — an open question, not resolved** | `ia.md` §9, and the banner at the top of `index.html`. Light-mode only was built; every colour is a token, no meaning rests on the background, and the hatch/dash textures are two variables — so dark remains buildable. **The decision is flagged for you, not made.** |
| State never conveyed by colour alone | Systemic. `.state` is always colour **plus a word plus a dot**; `.pill` always carries a word; indeterminate states are separated by *form* (dashed edge, hatch fill) not hue. See `ia.md` §7. |
| Mobile layout for every screen | Breakpoints at 768px and 640px in `overrides.css`; the participant surface is a 460px column at every width. Every page was rendered at 500px. Note: headless Chrome clamps to a 500px minimum on macOS, so 500 is the narrow check. |

## 5.2 Lists and collections — all four states each

Loading is a **skeleton** wherever the layout is known in advance; a spinner appears only inside an
in-flight control. That policy is stated in `ia.md` §4.6 and applied without exception.

| Collection | Loading | Empty, first-run | ★ Empty by dependency | Load failed |
|---|---|---|---|---|
| Trips | `trips.html#state=loading` | `trips.html#state=empty` | n/a — a trip list has no upstream dependency | `trips.html#state=failed` (explicitly **distinct** from empty; a silent failure rendering as "no trips yet" is a real bug this product had) |
| People | `people.html#state=loading` | `people.html#state=empty` | `trip-new.html#state=nopeople` — the directory is empty *while you are trying to add someone to a trip* | `people.html#state=failed` |
| Documents | `documents.html#state=loading` | `documents.html#state=empty` | `participant.html#state=docsnone` — nothing to show because the person hasn't uploaded | `documents.html#state=failed` |
| Goals | skeleton in `trip.html#state=loading` | `trip.html#state=empty` (goals card) | n/a | `trip.html#state=failed` |
| Date windows | `trip-dates.html` loading region | `trip-dates.html#state=empty` | n/a | `trip.html#state=failed` |
| Destination candidates | `trip-destination.html#state=loading` | `trip-destination.html#state=empty` | n/a | `trip-destination.html#state=failed` |
| Itinerary days | `trip-itinerary.html#state=loading` | `trip-itinerary.html#state=gaps` (empty days) | ★ `trip-itinerary.html#state=nodates` — **no itinerary because the trip has no dates.** Different copy, different action | `trip-itinerary.html#state=failed` |
| Itinerary items within a day | same page | `trip-itinerary.html#state=gaps` | `trip-itinerary.html#state=nodates` | `trip-itinerary.html#state=failed` |
| Checklists | `trip-checklists.html#state=loading` | `trip-checklists.html#state=empty` | ★ `trip-checklists.html#state=notemplate` (no templates to instantiate) and `#state=noassignee` (no participants to assign to) | `trip-checklists.html#state=failed` |
| Checklist items | same | `trip-checklists.html#state=empty` | `trip-checklists.html#state=noassignee` | same |
| Templates | `trip-checklists.html#state=templates` | `trip-checklists.html#state=notemplate` | — | same |
| Participant links | `trip-people.html#state=loading` | `trip-people.html#state=links` (nobody issued yet) | `trip-people.html#state=empty` — no links because no participants | `trip-people.html#state=failed` |
| Search results | `search.html#state=loading` | `search.html#state=noquery` | `search.html#state=tooshort` — under two characters | `search.html#state=failed` |

**Populated at realistic and at awkward scale:** 6 trips across 5 statuses (`trips.html#state=populated`),
20 people (`people.html#state=populated`), 20 participants on one trip
(`trip-people.html#state=twenty`), a 14-day itinerary and a day with twelve items
(`trip-itinerary.html#state=packed`), 40 checklist items (`trip-checklists.html#state=forty`),
8 documents on one person (`person.html#state=manydocs`).

## 5.3 Forms and editing

| Row | Where |
|---|---|
| Idle, focused, filled | `trip-new.html#state=blank` → `#state=filling`; `.fg` in `overrides.css` carries the focus treatment |
| Validation: person name required | `people.html` / `person.html` name field |
| Validation: trip name required | `trip-new.html#state=invalid` |
| Validation: goal title required | `trip.html` → **Edit goals** dialog, which shows the empty-required state inline |
| Validation: candidate name required | `trip-destination.html#state=invalid` |
| Validation: checklist name and kind required | `trip-checklists.html` add-checklist form |
| Validation: checklist item title required | `trip-checklists.html` |
| Validation: itinerary item title required | `trip-itinerary.html` item form |
| Validation: clone name required | `trip-new.html#state=clone` |
| Cross-field: end date before start date | `trip-dates.html#state=invalid` |
| Cross-field: negative flex days | `trip-dates.html#state=slight`, sidebar |
| Saving / in-flight, control disabled and legible | `trip-budget.html#state=saving`, `trip-new.html#state=saving`, `person.html#state=saving` |
| Saved confirmation | **Inline and persistent**, never a toast — the action bar becomes `Saved · 2 minutes ago` and the section dots clear (`.saved` in `overrides.css`). Decided deliberately; `ia.md` §4.7 |
| Save failed, input preserved | `trip-budget.html#state=savefailed`, `trip-new.html#state=savefailed`, `participant.html#state=savefailed` |
| ★ **Dirty state and unsaved-work protection** | One policy everywhere: `trip-budget.html#state=dirty` shows section dots plus one save bar; `trip-new.html#state=restored` shows a **visible** "restored from a draft" notice rather than a silent restore; `app.js` installs the navigation guard. `ia.md` §4.5 |
| ★ **Multi-save screens resolved** | There are none. One save per surface, everywhere. The three-independent-save-buttons pattern is gone; `ia.md` §4.5 |
| Read-only: participants see dates read-only | `trip-dates.html#state=readonly` |
| Read-only: participants see the itinerary read-only | `participant-itinerary.html`, and `trip-itinerary.html#state=readonly` |
| ★ **Frozen vs editable on an archived trip** | `trip-archive.html#state=populated` — `.frozen` hatch overlay plus a `Frozen` chip on the snapshot; notes, album links and actuals visibly editable |

## 5.4 Genuinely destructive actions

Each names the concrete consequence. The distinction §3.14 draws is structural here: these are the
actions where **data is gone**. Actions that are merely *decisions* live in §5.12 and are reversible
rather than guarded.

| Row | Where |
|---|---|
| Delete a person | `people.html#state=deleteok` — names their documents and trip history |
| Delete a person — **blocked**, still on a live trip | `people.html#state=deleteblocked` — names *which* trip and links to it |
| Delete a document | `documents.html#state=delete` |
| Remove a participant from a trip | `trip-people.html#state=remove` |
| ★ Revoke an access link | `trip-people.html#state=revoke` — immediate, irreversible, and says re-issuing is the recovery |
| ★ Create a link when one exists | `trip-people.html#state=relink` — warns **before**, because it silently kills the old one |
| Delete a checklist | `trip-checklists.html#state=deletelist` — states how many items go with it |
| ★ Delete a checklist item | `trip-checklists.html#state=deleteitem` — **deliberately no confirm.** An `.undo` row replaces it instead. High-frequency and trivially re-creatable; justified in `ia.md` §4.8 |
| Delete an itinerary item | `trip-itinerary.html#state=deleteitem` — names its time, location, cost and notes |
| Delete a destination candidate | `trip-destination.html#state=deletecandidate` |
| Delete a destination candidate — **blocked**, it's the decided one | `trip-destination.html#state=deleteblocked` |
| ★ Mark a destination decided | `trip-destination.html#state=decided` has the confirm, and `#state=undecide` is the undo. **Both** were designed; §5.4 asked for either |
| Archive a trip | `trip.html` → **Archive** — locks the plan *and* revokes all five links, each stated separately with the hashing consequence |
| Discard an AI draft | `ai-review.html#state=discard` |
| Discard unsaved edits | `trip-budget.html#state=dirty` → the save bar's discard; `trip.html` details drawer |
| Delete a trip | `trip.html#state=empty` → **Delete this trip**. Only offered while nothing is attached; `ia.md` §4.1 |

## 5.5 AI states — all five, for all five features

The five features are destination suggestions, whole-trip budget, whole-trip itinerary, single-day
regeneration with a free-text instruction, and packing suggestions. **One review pattern serves all
five** — this replaces five slightly different implementations, and that unification is the point.

| Row | Where |
|---|---|
| 1 · Available and idle | `ai-review.html#state=idle`, plus the invitation on `trip-budget.html`, `trip-itinerary.html`, `trip-destination.html`, `trip-checklists.html` |
| 2 · Generating (many seconds, honestly) | `ai-review.html#state=generating` (`.gen` — says what it is working from, not just a spinner); also `trip-budget.html#state=aigen`, `trip-itinerary.html#state=aigen` |
| 3 · ★ **Unavailable — no provider configured** | `ai-review.html#state=aioff`, `trip-budget.html#state=aioff`, `trip-itinerary.html#state=aioff`, `trip-destination.html#state=aioff`, `trip-checklists.html#state=aioff`. A permanent expected condition, hatched and quiet, pointing at the manual path — **not** an error, no nagging, and it does not point at a setting the user cannot change |
| 4 · Generation failed | `ai-review.html#state=failed`, `trip-budget.html#state=aifailed` — recoverable, non-destructive, existing work untouched |
| 5 · ★ **Draft ready — the review moment** | `ai-review.html` — `#state=budget`, `#state=itinerary`, `#state=day`, `#state=packing`, `#state=destinations`. Current on the left, draft on the right, aligned row by row |
| ★ Unified into one recognisable system | The whole of `ai-review.html`. One `.cmp` grid, one consequence bar, one apply/discard pair, for all five features |
| Partial acceptance | `ai-review.html#state=partial` — per-row keep/skip, and the bar counts what will actually happen |
| Applying over hand-edited content | `ai-review.html#state=overwrite` — says how much existing work is about to be replaced, and which rows were hand-edited |
| Applied, with an undo | `ai-review.html#state=applied` |
| **Nothing sensitive was sent** | `ai-review.html` — the `.privacy` block itemises what leaves (aggregated preference counts, duration, destination, climate, budget shape) and what never does (names, phones, emails, emergency contacts, medical notes, allergies, document numbers, files) |

## 5.6 Blocked-by-precondition ★

Every one explains *what's missing* and offers the route to fix it. **There is no dead disabled
control anywhere in this deliverable** — where an action isn't available, pressing it explains why.

| Row | Where |
|---|---|
| Cannot confirm the trip: needs final dates and a decided destination | `trip.html#state=planning` → **Move to Confirmed**, which opens the blocked dialog naming both gaps with a route to each |
| Cannot build an itinerary: the trip has no dates | `trip-itinerary.html#state=nodates`; also the itinerary card on `trip.html#state=planning` and `#state=idea` |
| Cannot advance from `active`: nowhere forward but archiving | `trip.html#state=active` — the lifecycle bar says so in words |
| Cannot add a budget override for a non-participant | `trip-budget.html#state=overrideblocked` |
| Cannot instantiate a checklist from a template when none exist | `trip-checklists.html#state=notemplate` |
| Cannot assign a task when the trip has no participants | `trip-checklists.html#state=noassignee` |
| Cannot suggest packing for a task-kind checklist | `trip-checklists.html#state=packingonly` |
| Cannot re-archive an already-archived trip | `trip-archive.html#state=rearchive` |
| Cannot add itinerary days by hand | `trip-itinerary.html#state=populated` — stated where a user would look for "add day" |
| Cannot edit a document | `documents.html#state=editmeta` — metadata **is** editable (a deliberate argument, `ia.md` §4.3); the file is not, and replacing it is an upload |

## 5.7 Upload states

| Row | Where |
|---|---|
| Idle | `documents.html#state=empty`, `participant.html#state=docsnone` (`.drop`) |
| File chosen, with a local preview before upload | `documents.html#state=upload` |
| Uploading, with progress | `documents.html#state=upload` (`.upl`), `participant.html#state=upload` |
| Succeeded | `participant.html#state=docsproblem` shows a just-uploaded document in place |
| Failed | `documents.html#state=failed` |
| **Rejected over 10 MB** | `documents.html#state=toobig`, `participant.html#state=uploadbig` — states the actual size |
| Rejected unsupported type | `documents.html#state=badtype`, `participant.html#state=uploadtype` — names the accepted list. A `.zip` filed as a passport is the exact bug this fixes |
| Downloading | `documents.html#state=previewnone` — the download action on an unpreviewable file |
| Files served only through authorised access, never a public URL | Stated once, quietly, on `documents.html` |
| Thumbnail generating / not yet available | `documents.html#state=pending` (`.thumb--pending`) |
| Image thumbnail and image preview | `documents.html#state=previewimage` |
| PDF first-page thumbnail, multi-page preview with page navigation | `documents.html#state=previewpdf` (`.thumb__pg` badge + `.pv__pager`) |
| ★ No-preview fallback | `documents.html#state=previewnone` — a designed state with filename, type, size and a download action. Not a broken-image icon |
| A thumbnail whose source fails after the fact | `documents.html#state=thumbfailed` |
| ★ Sensitive-content handling | `documents.html#state=obscured` / `#state=revealed`, and `person.html#state=manydocs`. **Obscured by default for organizers**, plain for the owner on their own phone; type and expiry stay legible through the blur. The opinion and its trade-off are in `ia.md` §4.2 |
| A very tall scan, a very wide one, a low-quality phone photo | `documents.html#state=tall`, `#state=wide`, `#state=lowquality` |
| A list mixing images, PDFs and one unpreviewable file | `documents.html#state=mixed` (the default) |

## 5.8 Readiness signals

Three composite views, and **every signal is a link or a button** — not one is a bare coloured mark.
That is the specific failure being fixed. There is no readiness percentage anywhere in the
deliverable: `ia.md` §7 argues that an aggregate is the opposite of what §2.6 asks for.

| Row | Where |
|---|---|
| Per participant: profile confirmed or not | `trip-people.html#state=waiting`, `#state=populated` |
| Per participant: document count | same |
| Per participant: expiry at **both** tiers | `trip-people.html#state=docs` and `person.html#state=manydocs` — `.pill--4` **Expired** (before or during the trip: Nikhil Rao, 2 Nov 2026) and `.pill--3` **Warning** (within six months after: Meera Iyer 12 Jan 2027, Daniel Weiss 20 Nov 2026). Computed against trip end 15 Nov 2026 + 6 months = 15 May 2027. No expiry date = never flagged, rendered as an em dash |
| Per participant: whether they have a working link | `trip-people.html#state=links` |
| Trip decisions: dates confirmed | `trip.html` dates card |
| Trip decisions: destination decided | `trip.html` destination card |
| Trip decisions: budget drafted | `trip.html` budget card — and `trip-budget.html#state=never` vs `#state=zeros` distinguishes "never drafted" from "drafted as zero" |
| Trip decisions: itinerary built | `trip.html` itinerary card. **"Ready" is defined as: every day has at least one item, or is a deliberately unplanned day.** A raw day count is not enough, because two empty days on this trip are a *goal* |
| Checklists: done vs total, and the overdue list | `trip-checklists.html#state=overdue` — what's overdue, when it was due, and whose it is |
| ★ Every signal leads somewhere | Systemic: `.wait` rows on `trip.html` are buttons that navigate |
| The trip's readiness | `trip.html` — the **Open / waiting on** column |
| Who am I waiting on right now | `trip-people.html#state=waiting`, sorted by who blocks |
| This person's readiness across the trip | `trip-people.html` expandable row, and `person.html#state=populated` for the cross-trip view |
| A brand-new trip where nothing is ready | `trip.html#state=empty` and `#state=idea` — six dashed cards, each saying what would go there. **Reads as a starting line: no card renders as an error and none shows a zero** |
| A fully-ready trip | `trip.html#state=ready` — "Nobody is holding this trip up", and it reads as finished rather than empty |

## 5.9 Participant surface states ★

Every one designed phone-first: `.pshell` is a 460px column at every viewport width, not a squeezed
desktop layout. Touch targets are 44px throughout (`.pshell` overrides button, input and checkbox
sizes).

| Row | Where |
|---|---|
| Loading | `participant.html#state=loading` |
| Valid link, everything present | `participant.html#state=prefilled` (the default) |
| ★ **Bad link — expired, revoked and never-existed are one message** | `participant-blocked.html#state=bad`. Deliberately indistinguishable, to prevent enumeration. Written for a non-technical person on a phone, suggests asking the organizer, and **no retry-forever loop** |
| Temporary failure, distinct from a bad link | `participant-blocked.html#state=temporary` — visibly different, and retryable |
| Rate-limited (30/minute) | `participant-blocked.html#state=ratelimited` — says when to try again |
| Trip details still undecided | `participant.html#state=tbd` — dates and/or destination TBD, rendered as **reassuring** rather than broken, with nothing for them to do about it |
| ★ **Profile pre-filled from previous trips** | `participant.html#state=prefilled` — `.prefill` with "this is what we have from Sri Lanka 2025 — still right?". Visibly carried over, never silently defaulted. This is where §2.1 either pays off or doesn't |
| Profile empty (a brand-new person) | `participant.html#state=newperson` |
| Profile saved and confirmed | `participant.html#state=saved` — **persistent**, so a returning participant can tell they already confirmed. Today that state is session-local and vanishes on reload |
| No documents yet | `participant.html#state=docsnone` |
| Documents present | `participant.html#state=prefilled` |
| A document that's a problem for **this** trip | `participant.html#state=docsproblem` — framed against this trip's dates, not as an abstract expiry |
| Nothing on their checklist yet | `participant.html#state=checklistempty` |
| Checklist partially complete | `participant.html#state=checklistpartial` |
| Checklist fully complete | `participant.html#state=checklistdone` |
| ★ Overall "you're done" | `participant.html#state=done` (`.pdone`) — a clear finish so they close the tab confident nothing is outstanding |
| Reading the itinerary during the trip | `participant-itinerary.html#state=today` — today's day first; `#state=emptyday` shows a deliberately unplanned half-day reading as intentional |
| Privacy boundary | Systemic and stated on `participant.html`: their own data and shared trip facts only. Never another participant's documents, phone, email, emergency contact, medical notes, allergies or profile; never the budget; never the participant list |

## 5.10 Search states

| Row | Where |
|---|---|
| Query too short (under 2 characters) | `search.html#state=tooshort` |
| No query yet — say what's searchable | `search.html#state=noquery` |
| Loading | `search.html#state=loading` |
| No matches | `search.html#state=nomatch` — states what *was* searched rather than apologising |
| Grouped results across all six kinds | `search.html#state=results` — trips, people, documents, itinerary items, checklist templates, archived-trip notes, with mono counts and `mark.hit` on the matched substring |
| ★ A result kind that isn't independently navigable | `search.html#state=results` and the palette on `trip.html` — **checklist templates** render as a non-interactive row that states why and offers "use it on a trip" instead. Not a dead row, not silently disabled |
| Keyboard navigation and selection | `search.html#state=keyboard`, and the `#palette` on every organizer page (⌘K; ↑↓ to move, ↵ to open, Esc to close — `app.js` wires it) |
| The relationship between the fast path and the full view | Both kept, and the relationship stated on `search.html`: the palette shows the top 3 per kind with "see all N" into the page. `ia.md` §4.10 |

## 5.11 Content edge cases

| Row | Where |
|---|---|
| Very long trip names | `trips.html#state=populated` — "Vietnam & Cambodia 2026 — the one we kept postponing"; `.thead__top h1` uses `overflow-wrap: anywhere` |
| Very long person names | `people.html#state=populated` |
| Very long goal titles | `trip.html` → Edit goals |
| Very long destination names | `trip-destination.html#state=open` |
| A trip with no destination, no dates, no participants, no budget, no itinerary — all at once | `trip.html#state=empty` |
| A destination candidate with only a name | `trip-destination.html#state=sparse` |
| ★ A budget of all zeros vs one never drafted | `trip-budget.html#state=zeros` vs `#state=never`. Zeros print as plain mono `₹0` — a real number someone typed. Never-drafted is hatched (`.metric--off`) and italic muted. **These render identically today; here they cannot be confused** |
| A 14-day itinerary | `trip-itinerary.html#state=populated` (10 days) and `#state=packed` |
| A day with no items | `trip-itinerary.html#state=gaps` — and it distinguishes a deliberately unplanned day from an oversight, because "keep two half-days completely unplanned" is a goal on this trip |
| A day packed with twelve | `trip-itinerary.html#state=packed` |
| A person with no preferences set at all | `person.html#state=noprefs` — em dashes and italic "not set", never blank |
| A person with 8 documents, half problematic | `person.html#state=manydocs` |
| 20 participants on one trip | `trip-people.html#state=twenty` |
| Archived trips mixed in with live ones | `trips.html#state=archivedmixed` — visibly different without being greyed-out corpses |
| Currency and date display, one convention held | `₹4,80,000` Indian lakh grouping; `6–15 Nov 2026`; all money and dates in mono with `tabular-nums` so columns align. Held on every page |
| Enum values rendered for humans | Systemic: "Non-veg", "Primary transport", "National ID", "Relaxed / Moderate / Packed", "Low / Medium / High". **No raw enum appears anywhere** |

## 5.12 Reversal and consequence warnings ★

The full §3.14 catalogue is rendered inline, side by side, on **`patterns.html`** — so the eleven
warnings can be seen to be one system rather than eleven inventions. Each also lives in its real
context, linked from there. `patterns.html` splits them under two headings the product treats
differently: **genuinely destructive** (data is gone) versus **merely decided** (re-openable). Only
the first gets finality.

| Row | Where |
|---|---|
| Advance trip status — a way back at every step | `trip.html` lifecycle bar → **Step back**, at every status. `patterns.html#state=decided` |
| Archive a trip | `trip.html` → **Archive** — names the five links killed, the frozen snapshot, and what stays editable |
| **Un-archive** — the hardest reversal | `trip-archive.html#state=unarchive` — answers what happens to the six killed links (hashed, so they do **not** come back; re-issuing is per-person with a one-time secret), to the frozen snapshot, and to the recorded actuals |
| Mark a destination decided → un-decide | `trip-destination.html#state=undecide` |
| Confirm trip dates → promote a window | `trip-dates.html#state=promote` — the action that **did not exist** in the UI at all |
| Reopen the date decision later | `trip-dates.html#state=reopen` |
| Revoke an access link | `trip-people.html#state=revoke` — kept irreversible, because tokens are hashed; re-issuing is the recovery, and that's said *before* |
| Create a link over an existing one | `trip-people.html#state=relink` — warned **before**, not discovered after |
| Delete a person / document / goal / itinerary item / checklist | §5.4 above; each names specifics |
| Trip deletion | `trip.html#state=empty` → **Delete this trip**. Decided: yes, but only while nothing is attached. `ia.md` §4.1 |
| Edit a document | `documents.html#state=editmeta` — metadata-only editing was argued for and built |
| Apply an AI draft | `ai-review.html#state=overwrite` (how much work is replaced) and `#state=partial` (diff-and-choose). `#state=applied` carries an undo |
| ★ Shifting or re-dating a **confirmed** trip with an itinerary | `trip-dates.html#state=shift` — presents **shift** and **re-date** as two different intents with two different damage lists: which days disappear, what was in them (named items, with times and costs), and which date-pinned goals now fall outside the trip |
| ★ Shifting the dates of an **active** trip | `trip-dates.html#state=shift` — same, plus the fact that five participants are reading this itinerary on their phones right now and the app sends nothing |
| Reopening the date decision when dates are confirmed | `trip-dates.html#state=reopen` — what happens to the candidate windows, and that the trip drops to **Planning** |
| Un-deciding a destination a budget and itinerary were built around | `trip-destination.html#state=undecide` |
| Stepping back from `confirmed` or `active`, and status drift | `trip.html` → **Step back**; the rule itself at `patterns.html#state=rollback` |
| ★ **Status rolls back when a change breaks its precondition** | `patterns.html#state=rollback` — 6–15 Nov → 8–17 Nov keeps exact dates so the trip stays **Confirmed**; reverting to a broad window destroys the precondition so it drops to **Planning**. The difference between *edited* and *invalidated* is the whole idea, and the rollback is announced **before** the click, inside the same warning as the other damage |
| Changing a trip's base currency after amounts are entered | `trip.html` → Trip details → **Change** — offers both readings with a live preview: reinterpret (₹80,000 → €80,000, the default) or convert at today's rate (→ €734). Reasoning stated; `ia.md` §4.9. It also points out that *reading* in euro needs no such change at all |
| ★ **The reassuring inverse** | `.reassure` — used wherever an action genuinely is cheap to undo: `trip.html` step-back, `trip-dates.html#state=promote`, `trip.html#state=ready`, `trip.html#state=idea`, and collected on `patterns.html`. A warning that over-dramatises a reversible change is its own failure, so the system has a component for "this is cheap" that belongs to the same family as the one for "this destroys six links" |

## 5.13 Currency viewing states ★

The lens is a **per-viewer display filter**, in the app bar with the other view controls, never a trip
setting. Every input stays in the trip's base currency; nothing downstream is ever computed from a
converted value. `ia.md` §4.11, §4.13.

| Row | Where |
|---|---|
| Viewing in the base currency — the authoritative view | `trip-budget.html#state=populated` (default `lens=inr`). Base figures are plain and full-weight; converted ones are muted, carry `≈`, and round coarsely, so the base view is unmistakably home |
| Viewing converted, with provenance visible | `trip-budget.html#state=populated&lens=eur` — `.prov` "rates as of 29 Jul 2026" beside the figures. Also on `trip.html`, `trip-itinerary.html`, `trip-destination.html`, `trip-archive.html`, `trips.html`, `participant.html` |
| The switch itself, clearly a view control | The `.lens` control in the app bar (`View in · INR ▾`) → `#lensmenu`. It says out loud that it changes what you see and nothing else. Present only where money is on screen |
| ★ An editable money field while a converted view is active | `trip-budget.html#state=populated&lens=eur` — the `<input>` stays in rupees with a locked `₹` prefix; the conversion sits beside it in a hatched, dashed, read-only `.inp__aside`. Saving 734 into a field meaning ₹80,000 is **structurally impossible**, not merely discouraged |
| Chosen currency unsupported by the rate source | `trip-budget.html#state=populated&lens=vnd`, `trip.html#state=active&lens=vnd` — "we can't convert to Vietnamese dong", base values keep showing, **no blank cells and no zeroes**, and it offers euro or rupees instead |
| Rate fetch loading | `trip-budget.html#state=loading&lens=eur` |
| Rate fetch failed → fall back to base with a notice | `trip-budget.html#state=populated&lens=failed`, `trip.html#state=active&lens=failed` — never presents an unavailable rate as current |
| Stale rates | `trip-budget.html#state=populated&lens=stale`, `trip.html#state=active&lens=stale` — "from 09:12 this morning and the source has published a new set since", with `.prov--stale` |
| Converted **zero** | `trip-budget.html#state=zeros&lens=eur` and `#state=populated&lens=zero` |
| Converted **very large** values | `trip-budget.html#state=populated&lens=vndlive` — ₹4,80,000 becomes ₫142,300,000. Full digits in the table so the mono column still aligns; abbreviated (`≈ ₫142.3M`) only in card slots too narrow for nine digits. Abbreviation is warranted, but never in a column |
| Every money surface converted consistently | Budget categories, trip total, per-person split, per-person overrides (`trip-budget.html`); itinerary item costs, day and trip roll-ups (`trip-itinerary.html`); destination candidate per-person sketches (`trip-destination.html`); archive actuals vs estimates (`trip-archive.html`); trip cards (`trips.html`); the participant view (`participant.html`) |
| ★ An archived trip's actuals under conversion | `trip-archive.html#state=populated&lens=eur` — the rate date is made **unmissable** here, because an actual was spent at the rate of the time and converting it at today's rate shows a number that was never true. This is the surface where a reader is most likely to mistake a converted figure for what was paid |
| The participant view under conversion | `participant.html#state=prefilled&lens=eur` — the same read-only lens, for the two members joining from Europe |

---

## Deliberately not designed

Each of these is a conscious omission, not a gap.

| Not designed | Why |
|---|---|
| **Dark mode and follow-the-OS** | The style system is light-only, and §5.1 explicitly says not to silently resolve this. Light mode was built so as to remain themeable: every colour is a token, no meaning rests on the background, and the two textures are single variables. Flagged as an open product decision in `ia.md` §9, where what needs deciding is written down |
| **A registration, password-reset or account-management flow** | §4.1.1 and §6 — organizer accounts are provisioned outside the app. `sign-in.html` links to nothing of the kind |
| **Any admin surface for configuring the AI provider** | §6 — that is environment config. `#state=aioff` deliberately does *not* point at a setting the user cannot change |
| **Notifications of any kind** | §6. This is also why save confirmations are inline and persistent rather than toasts — a toast would be the app's only ephemeral notification channel (`ia.md` §4.7) |
| **Chat, comments, polls, voting, threads** | §6, and §2.2 — the app records decisions, it does not host the discussion |
| **Expense splitting, settle-up, who-paid-what** | §6. Only one actual-spend figure per category, after the trip |
| **Photo or media storage** | §6 — `trip-archive.html` takes external album URLs only |
| **A readiness percentage** | Not in the brief's omissions; **my choice**, argued in `ia.md` §7. §2.6 asks for actionability rather than a pretty aggregate, and a percentage is the thing signals go to be counted instead of fixed. Counts and named people are used throughout instead |
| **A "complete your trip setup" prompt or progress nag** | §2.5 — an unfinished trip is not an error. `trip.html#state=empty` deliberately offers a next step without implying anything is late |
| **Mixed-currency entry, per-line currencies, FX gain/loss** | §3.13, explicitly out of scope. One base currency in, any lens out |
| **Offline mode, realtime collaboration, i18n, analytics** | §6 |
