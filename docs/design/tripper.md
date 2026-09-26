# Tripper — design identity

Status: **agreed 2026-09-26** (after the Itinerary smoke-test review; see §9). Owner: Vignesh.
Suite grammar: none yet (`docs/design/suite.md` not written).
Every UI change to this app cites a section of this file (design-gate) or proposes a change
to it (§9 changelog). It is a living document: revise it, do not work around it.

Source: owner interview 2026-09-26 (4 batches) + contrasting mockups
`docs/mockups/identity/trip-overview.html` (Option 2 chosen, refined twice).

## 1. Users and modes

| Mode | Who | When | Device / hands | Patience |
|---|---|---|---|---|
| Desk planning | organizer | weekly bursts in the weeks before a trip, 20–60 min | laptop, keyboard + trackpad | high |
| Collecting from the group | organizer → participants | throughout planning; chase, then check who responded | laptop or phone; link goes to WhatsApp | medium |
| Quick check | organizer | seconds–2 min, between other things | phone | seconds |
| On the trip | organizer (and co-organizers) | several times a day during the trip | phone, one hand, on the move | none |
| Filling my details | participant via `/p/:token` | once per trip, when chased | phone, no account | low, must be obvious |

Co-organizers (2–3 people, own logins) share every organizer mode.

**Primary modes: desk planning and collecting from the group, equally.** On the trip is the
mode with the least patience; while a trip is `active`, it wins the Trip overview.

### Ranked jobs

| # | When… | I want… | so I can… | Reach | Surface |
|---|---|---|---|---|---|
| 1 | dates/destination firm up | a day-by-day plan (draft → edit in place) | the group knows what we're doing | one click | Itinerary |
| 2 | a trip nears | to see who is missing profile info, docs, or has an expiring passport | chase exactly those people | **zero clicks** (before trip) | Trip overview |
| 3 | deciding scope | per-person cost, booked vs estimated | friends can commit | one click | Budget |
| 4 | work must be split | checklist items assigned and ticked | nothing is forgotten | one click | Checklists |
| 5 | on the trip | today's plan, what's next, quick reference | not dig through chats mid-day | **zero clicks** (during trip) | Trip overview |

Deal-breakers: jobs 2 and 5 at zero clicks. One extra click on either and the owner stops
using the app.

Jobs of other modes / lower rank: copy a participant's link (one click, on the row that
says they're missing something, and on People); record dates, destination and goals
(two clicks, Details ▾); trip settings/status (two clicks, Details ▾); search and the People
directory (search / menu).

## 2. Surfaces and archetypes

| Surface | Archetype | Top job | Opens from | Leaves to |
|---|---|---|---|---|
| Trips list `/` | Browser | pick the trip that needs me | app open | Trip overview |
| Trip overview | Monitor, **phase-aware** | job 2 before the trip, job 5 during | Trips list | any trip tab |
| Itinerary | Workbench | job 1 | tab | Overview |
| Budget | Workbench | job 3 | tab | Overview |
| Checklists | Workbench | job 4 | tab | Overview |
| People (trip) | Admin | who's on the trip, their links | tab | Person detail |
| Dates · Destination (+ Goals) · Settings | Admin | record a decision | Details ▾ | Overview |
| `/trips/new` | Guided flow | start a trip | Trips list | Trip overview |
| `/p/:token` | Guided flow (participant) | fill profile, upload docs, tick my items | WhatsApp link | — |
| Search, People directory, Person detail | Browser | find a person or trip | top nav | Trip / Person |
| Print itinerary, Login | output / Admin | — | — | — |

Transitions: `Trips list --open--> Trip overview --tab--> Workbench --Overview tab--> Trip overview`.
The Overview links into a Workbench ("Open itinerary", "All 7 items"); it does not carry
Workbench controls.

**Trip overview by phase:**
- *Before the trip* (idea → confirmed), two columns. Left: **Who's missing what**
  (`N of M people`, one row per incomplete person with the reason it matters and "Copy ⟨name⟩'s
  link"; complete people on one line), then **Since you last looked · ⟨date⟩**, where each
  change links to what it affects. Right: **Itinerary** (`N of M days planned`, only the empty
  days listed), **Budget · per person** (booked vs estimated), **Checklists · N open**
  (unassigned first).
- *During the trip* (active). Left: **Today** (the next item gets an `info` rail, "Next · in
  N min", booking ref, Map link; done items dimmed). Right: **Quick reference** (tonight's stay
  with address/ref/check-out, Call · Map; guides; local emergency numbers), **Tomorrow**
  (first departures and cut-off times), **Before tomorrow · N open** (checkable in place).
  Readiness, Budget and the change feed are hidden.
- *After the trip*: a trip leaves `active` automatically the day after its end date, so the
  during-trip layout never outlives the trip.
- On a phone the columns stack left then right: Today → Quick reference → Tomorrow → Before tomorrow.

## 3. Frequency and session shape

- **Desk planning**: laptop, a few sessions per trip in the weeks before. Opens on the Trip
  overview, goes into one Workbench. Done for today = the empty-days count or open-checklist
  count went down.
- **Collecting**: opens the Overview, copies 1–3 links into WhatsApp, comes back days later
  to "Since you last looked". Done = Who's missing what is empty.
- **On the trip**: phone, many short opens per day. Opens the Overview on Today. Done = none.
- **Participant**: one sitting on a phone, no account, Google-Forms simple.

## 4. Reach tiers

| Tier | Rule | Contents |
|---|---|---|
| Zero clicks | the Trip overview at rest, per phase | who's missing what, days to go, open checklist count, what changed · today, next item, quick reference |
| One click | tabs; buttons visible at rest | Itinerary, Budget, Checklists, People; Copy ⟨name⟩'s link; Map/Call links; tick an item |
| Two clicks | behind Details ▾ or a `⋯` menu | Dates, Destination + Goals, Settings/status; AI draft, export, print |
| Search / menu | everything else | global search, People directory |

**On a phone, "one click" means visible without scrolling.** The top-5 tabs (Overview,
Itinerary, Budget, Checklists, People) must fit a 390px bar. Only Details ▾ may overflow.

## 5. Density and action stance

- **Trip overview**: no button in the page header. Actions live on the row they act on (copy
  one person's link, Map, Call, tick). Only numbers that drive a decision (§6).
- **Workbenches** (Itinerary, Budget, Checklists): one primary button at rest. On Itinerary
  that is **Add item, per day**: days come from the trip dates, so there is no Add day.
  edit in place, no modal for routine edits. **AI actions, export and print go under `⋯`**,
  not as visible buttons. Owner call 2026-09-26: "AI buttons everywhere" is over-promoted today.
- **Itinerary during the trip** also marks today and opens scrolled to it (as well as the
  Overview's Today card).
- **Admin forms**: one Save per section.
- **Tabs**: Overview · Itinerary · Budget · Checklists · People · Details ▾ (Dates,
  Destination + Goals, Settings). Goals no longer has its own tab; it folds into Destination/Dates.
- **Never on the Overview**: a bulk "copy all links" action. Each link is personal, and
  pasting them all in one group chat hands everyone the others' links.

## 6. Vocabulary

| Term | Means | Never called |
|---|---|---|
| Organizer | a person with a login who edits trips | admin, owner, user |
| Participant | a person on a trip, reached through their link | member, guest, user |
| ⟨Name⟩'s link | a participant's personal `/p/:token` URL | token, magic link, invite |
| Draft | AI- or paste-generated content not yet accepted | suggestion, AI result |
| Missing | a required profile field or doc absent, or a doc expiring within 6 months of trip end | incomplete, pending |

**One number, one place:** at rest the Overview shows only: people missing (`N of M`), days
to go (or `Day N of M` during the trip), open checklist items (also on the Checklists tab count),
days planned (`N of M`), per-person cost. Per-person cost appears on the Overview because the
owner kept the Budget card in the mockup review, even though batch 3 said "not at rest"; the
mockup decides.

## 7. Refused, and removed

**Refused** (deliberate scope; do not propose):
- Chat, comments, polls: conversation stays in WhatsApp.
- Bookings and payments: Tripper records, it doesn't transact.
- Participant accounts: links only.
- Embedded maps: link out to Google Maps (location, ratings). OpenStreetMap is parked until
  a real use case turns up.
- Bulk "copy all missing links" (see §5).

**Removed, restore if missed:**

| Date | Element | Was on | Why cut | Restore if… |
|---|---|---|---|---|
| 2026-09-26 | Goals tab | trip tab bar | constraints on dates/destination, not a job | goals get their own workflow |
| 2026-09-26 | Dates, Destination, Settings as top-level tabs | trip tab bar | not top-5 jobs; rare edits | editing one becomes weekly |
| 2026-09-26 | Regenerate day (+ its instruction input) | every itinerary day | whole-trip draft + edit in place is enough; 10 blocks at rest | editing a day by hand turns out slow in practice |
| 2026-09-26 | Visible AI buttons at 5 sites | workbenches | over-promoted, not a job in itself | AI draft becomes the main way a day is planned |

## 8. Reference apps

| App | Steal | Avoid |
|---|---|---|
| TripIt | chronological plan; a "today" view on the road | — |
| Splitwise | per-person money, dead simple | — |
| Google Forms | participant side: one question at a time, no account | — |
| Notion | — | blank canvas; Tripper records structured decisions |
| Wanderlog / booking sites | — | maps, ads, suggestions everywhere |
| Jira / admin dashboards | — | tabs of forms, status fields everywhere |
| Chat apps | — | discussion belongs in WhatsApp |

## 9. Visual system, and changelog

Stylesheet `web/src/assets/main.css` (teal/amber on warm stone), light theme, component source
**PrimeVue** with the app's own tokens. Decided, not inherited: the owner wants to spend no time
building basic components. Stay on PrimeVue and restyle it to our tokens. Build a custom
component only when PrimeVue's is clearly subpar. Palette is open to change. The mockups used
dense-product-ui's `system.css` only for comparing structure, so the palette in them is not
a decision.

**Open data gaps the chosen Overview needs** (from the mockups, none built yet): per-person
"reason it matters" (visa lead time, 6-month passport rule per destination); a "last seen"
timestamp per organizer per trip for "Since you last looked"; a stay/guide/emergency
quick-reference source; booking refs on itinerary items; "next item" timing on today.

**Resolved 2026-09-26 (was a conflict with d5d.4):** the paste-JSON path ("Draft with your own
AI…") is always available, in the same `⋯` menu as "Draft with AI" at each of the four AI sites.
Nothing AI-related shows at rest.

| Date | Change | Proposed by | Reason |
|---|---|---|---|
| 2026-09-26 | initial | interview + mockups (Option 2, refined) | — |
| 2026-09-26 | Itinerary primary = Add item per day | smoke test (Itinerary) — accepted | "Add day" doesn't exist; days derive from dates |
| 2026-09-26 | Trip leaves `active` the day after its end date | smoke test — accepted | Kerala stuck `active` a month after it ended; server has no transition out (`trips.routes.js:5`) |
| 2026-09-26 | Phone "one click" = visible without scrolling | smoke test — accepted | Itinerary tab sat at x=661 on a 390px screen |
| 2026-09-26 | Itinerary marks and scrolls to today during the trip | smoke test — accepted | already built; now a rule |
| 2026-09-26 | Regenerate day cut | smoke test — owner chose cut over "keep under ⋯" | see §7 |
| 2026-09-26 | Paste path lives in ⋯ next to Draft with AI | owner | reconciles d5d.4 "always available" with §5 |
