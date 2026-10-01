# Participant page `/p` on a phone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/p/:token` reads like a Google Form on a 390px phone: the 3 steps come first, required questions lead, optional ones fold away, controls are ≥44px, dates read as dates, and Documents says which documents the trip needs.

**Architecture:** Mostly template work in `ParticipantView.vue` + the three `Participant*` step components. The server adds one read-only field (`trip.required_doc_types`) to `GET /api/participant/me`. One new browser gate `e2e/qa-participant-phone.mjs`.

**Tech Stack:** Vue 3 + PrimeVue 4 (Aura), Pinia, vitest + happy-dom, Fastify + pg, Playwright gates.

**Spec:** bead `trip-planner-0qh` (+ its design-gate note), `docs/design/tripper.md` §1, §2, §3, §4 (D7), §6, §8; `docs/design/smoke-2026-10.md` row 2.

## Global Constraints

- Every control ≥44px tall under 640px (tripper.md §4, D7). Scoped to `/p` here; app-wide is `trip-planner-cdl`.
- §6 vocabulary: never "invite"/"invited", "token", "magic link".
- Required fields = server `REQUIRED_FIELDS` (`phone`, `emergency_contact`, `dietary`), server decides "confirmed" (D2). Don't add client-side required logic beyond the markers.
- API shape: only add `trip.required_doc_types` to `/me`. No other API changes.
- One date style for display: `formatDayDate` (Overview's TripLine uses it for trip ranges), `formatShortDate` for expiry/due dates.
- Each new gate's fixture names go into `server/scripts/purge-qa-data.js`.
- Commit per task; message cites `trip-planner-0qh.N`.

## Review Focus

1. **Returning participant with optional values filled** — the fold stays closed but its summary says how many are filled ("More about you (optional) · 3 filled") so they know nothing was lost. Test in Task 2.
2. **Trip with no required documents** — Documents hint falls back to "Optional — passport, ID or tickets" and the step is done once any doc is uploaded (old behaviour). Test in Task 3.
3. **Required doc uploaded with an expired date** — still counts as present (server `missingDocsByPerson` ignores expiry; expiry warnings are a separate Overview reason). Test in Task 3.
4. **Trip with dates TBD / only one date** — hero says "Dates TBD", never "undefined –". Test in Task 4.
5. **Name blanked** — `name` stays `required` on the native input so the browser blocks the save; it stays in the top group (not folded) so the block is visible. Test in Task 2.

## At rest, 390px (after)

```
┌──────────────────────────────┐
│ Hi Asha 👋                    │   greeting, no "invited"
│ Goa 2026                     │
│ 📍 Goa · 📅 Sat 1 Aug – Wed 5 Aug│ formatDayDate, not ISO
│ [ Add to calendar ]  (44px)  │
├──────────────────────────────┤
│ ① Your details               │   no hint until complete ("Confirmed")
│  * Needed before the trip    │
│  Name        [Asha        ]  │
│  Phone *     [            ]  │  type=tel
│  Emergency contact * [     ] │
│  Dietary *  (•)Veg ( )Non-veg ( )Vegan   one-tap radios, 44px rows
│  ▸ More about you (optional) │   <details>, closed: email, allergies,
│                              │   medical, pace, interests, budget, city
│  [        Save         ]     │   full width
├──────────────────────────────┤
│ ② Documents                  │
│   Needed: Passport           │   hint from trip.required_doc_types
│   File [Choose]  Type [Passport▾]  Number  Expiry [date]
│   [       Upload        ]    │
├──────────────────────────────┤
│ ③ Checklist   2/5 done       │   44px rows, due "due 3 Nov 2026"
├──────────────────────────────┤
│ 30 days to go · ₹12,000 …    │   ParticipantItinerary moves BELOW the steps
│ Itinerary …                  │
└──────────────────────────────┘
```

Removed: the inner `Your details` / `Your documents` / `Your checklist` card + h2 inside each step card (card-in-card, same title twice); the profile step hint "Still needed: …" (repeated the post-save message).

---

### Task 1: `/me` returns the trip's required document types

**Files:**
- Modify: `server/src/routes/participant.routes.js:66-71`
- Modify: `web/src/stores/participant.js` (nothing to add: `this.trip = me.trip` carries it)
- Test: `server/test/participant.test.js`

**Interfaces:**
- Produces: `store.trip.required_doc_types: string[]` (always an array; `[]` when unset).

- [ ] **Step 1: Write the failing test** (append inside the existing `describe`)

```js
it('GET /participant/me returns the trip required_doc_types, [] when unset (trip-planner-0qh)', async () => {
  const { app, db } = await makeTestApp()
  const p = await createPerson(db)
  const t1 = await createTrip(db, { required_doc_types: '["passport","visa"]' })
  const t2 = await createTrip(db)
  const r1 = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${await seedLink(app, db, t1, p)}` } })
  const r2 = await app.inject({ method: 'GET', url: '/api/participant/me', headers: { authorization: `Bearer ${await seedLink(app, db, t2, p, { id: 'lk2' })}` } })
  expect(r1.json().trip.required_doc_types).toEqual(['passport', 'visa'])
  expect(r2.json().trip.required_doc_types).toEqual([])
})
```

- [ ] **Step 1b:** `seedLink` hard-codes link id `'lk1'` (participant.test.js:4-8, PK) — give it an `{ id = 'lk1' }` option and pass `{ id: 'lk2' }` for t2's call above.
- [ ] **Step 2: Run, expect FAIL** (`undefined` ≠ `['passport','visa']`): `npm run db:up && npx vitest run server/test/participant.test.js -t required_doc_types` (from repo root: `npm test --workspace=server -- -t required_doc_types`)
- [ ] **Step 3: Implement** — in the `trip:` object add `required_doc_types: JSON.parse(trip.required_doc_types || '[]'),` after `end_date`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(server): /participant/me carries required_doc_types (trip-planner-0qh.1)`

---

### Task 2: Profile form — required first, optional folded, one-tap dietary

**Files:**
- Modify: `web/src/components/ParticipantProfileForm.vue`
- Test: `web/src/components/ParticipantProfileForm.test.js`

**Interfaces:**
- Consumes: `store.person`, `store.saveProfile(fields)`, `store.profileConfirmed`, `store.stillNeeded` (unchanged).
- Produces: root element is a plain `<form class="pf">` (no `.card`, no h2) — the step card in `ParticipantView` is the card.

Changes:
- Top group order: Name (`autocomplete="name"`, `required`), Phone * (`type="tel"`, `autocomplete="tel"`), Emergency contact *, Dietary *.
- Dietary becomes a `<fieldset>` of 3 PrimeVue `RadioButton`s (Veg / Non-veg / Vegan), `aria-required="true"` on the fieldset, legend "Dietary *". Each option is a `<label class="pf-choice">` row ≥44px wrapping a `RadioButton name="dietary"` with **no `inputId`** (the wrapping label is the click target; keeps radios out of the `input[id]` sweep). Fieldset gets `id="pf-dietary" role="radiogroup"` so `aria-required` is valid. The `pf-dietary` Select disappears, so its label/combobox wiring test row is removed from `pairs` (pace and budget stay Selects).
- `<details class="pf-more">` with `<summary>More about you (optional)<span v-if="optionalFilled"> · {{ optionalFilled }} filled</span></summary>` wrapping Email, Allergies, Medical notes, Preferred pace, Interests, Budget band, Home city. Closed at rest.
- Save: `<Button type="submit" class="pf-save" fluid>`. Post-save messages unchanged ("Profile confirmed ✓" / "Saved. Still needed: …").

```js
const OPTIONAL = ['email', 'allergies', 'medical_notes', 'pace', 'interests', 'budget_band', 'home_city']
const optionalFilled = computed(() => OPTIONAL.filter((k) => String(form[k] ?? '').trim()).length)
```

- [ ] **Step 1: Write failing tests** (new `describe('ParticipantProfileForm phone layout (trip-planner-0qh)')`, reusing `mountWith`)

```js
it('required questions come before the optional fold, which is closed at rest', () => {
  const { wrapper } = mountWith({})
  const ids = wrapper.findAll('input[id], textarea[id], [role="combobox"][id], fieldset[id]').map((e) => e.attributes('id'))
  const more = wrapper.find('details.pf-more')
  expect(more.exists()).toBe(true)
  expect(more.attributes('open')).toBeUndefined()
  const outside = ids.filter((id) => !more.find(`#${id}`).exists())
  expect(outside).toEqual(['pf-name', 'pf-phone', 'pf-emergency', 'pf-dietary'])
  for (const id of ['pf-email', 'pf-allergies', 'pf-medical', 'pf-pace', 'pf-interests', 'pf-budget', 'pf-city'])
    expect(more.find(`#${id}`).exists(), id).toBe(true)
  wrapper.unmount()
})

it('dietary is one tap: three radios that set the value', async () => {
  const { wrapper, store } = mountWith({ profileConfirmed: true, missingFields: [] })
  const radios = wrapper.findAll('#pf-dietary input[type="radio"]')
  expect(radios).toHaveLength(3)
  await radios[1].setValue(true)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(store.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ dietary: 'non_veg' }))
  wrapper.unmount()
})

it('fold summary counts filled optional answers for a returning participant', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useParticipantStore()
  store.person = { name: 'Asha', email: 'a@x.in', allergies: 'nuts', interests: ['food'] }
  const wrapper = mountWithBase(ParticipantProfileForm, { pinia, attachTo: document.body })
  expect(wrapper.find('details.pf-more summary').text()).toContain('3 filled')
  wrapper.unmount()
})

it('phone is a tel input and name stays natively required', () => {
  const { wrapper } = mountWith({})
  expect(document.getElementById('pf-phone').getAttribute('type')).toBe('tel')
  expect(document.getElementById('pf-name').hasAttribute('required')).toBe(true)
  expect(wrapper.find('.card').exists()).toBe(false)   // the step card is the card
  wrapper.unmount()
})
```

Update `marks exactly the three required fields`: the dietary marker now lives in the fieldset legend, so assert `['pf-phone', 'pf-emergency']` on labels plus `wrapper.find('#pf-dietary legend .pf-req').exists()`, and `#pf-dietary` has `aria-required="true"`.

- [ ] **Step 2: Run, expect FAIL** (no `details.pf-more`): `npm test --workspace=web -- ParticipantProfileForm`
- [ ] **Step 3: Implement** the template above. Style (scoped):

```css
.pf-more { margin: 0.5rem 0 1rem; }
.pf-more summary { min-height: 2.75rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--app-primary); font-weight: 600; list-style: none; }
.pf-more summary::-webkit-details-marker { display: none; }
.pf-more summary .pi { transition: transform 0.15s; }   /* <i class="pi pi-chevron-right"> first in summary: display:flex drops the native marker */
.pf-more[open] summary .pi { transform: rotate(90deg); }
.pf-confirmed { display: block; margin: 0.75rem 0 0; width: fit-content; }   /* replaces margin-left: Save is fluid now */
.pf-choices { border: 0; padding: 0; margin: 0 0 1rem; }
.pf-choice { display: flex; align-items: center; gap: 0.625rem; min-height: 2.75rem; }
```

- [ ] **Step 4: Run, expect PASS** (including the existing 4hi tests and the pace/budget label tests).
- [ ] **Step 5: Commit** `feat(web): /p profile — required first, optional folded, one-tap dietary (trip-planner-0qh.2)`

---

### Task 3: Documents — say what the trip needs; real date input; readable rows

**Files:**
- Modify: `web/src/components/ParticipantDocs.vue`
- Modify: `web/src/views/ParticipantView.vue` (docs step `done` + `hint` only)
- Create: `web/src/components/ParticipantDocs.test.js`
- Test: `web/src/views/ParticipantView.test.js`

**Interfaces:**
- Consumes: `store.trip.required_doc_types` (Task 1), `docTypeLabel` from `utils/format.js`, `formatShortDate` from `utils/dates.js`.
- Produces: exported helper in `ParticipantDocs.vue`'s sibling `web/src/utils/requiredDocs.js`:
  `missingDocTypes(required: string[], documents: {doc_type}[]) → string[]` (required types with no document of that type, any expiry).

Changes:
- Root becomes `<div class="pd">` (no `.card`, no h2).
- Type `Select` shows `docTypeLabel` (`option-label` via `{ label, value }` options); default value = first of `missingDocTypes(...)`, else `'passport'`.
- Expiry — **owner decision 2026-10-02: (A)**: keep `DateField typeable` (a prior decision: you read it off the passport, typing beats paging a calendar to 2035) which already sets `inputmode="numeric"` (DateField.vue:93), so a phone shows the number pad and the mask inserts the dashes — no code change; the test below is a pin (passes on first run — say so in the commit, it is not a watched-fail test). Alternative (B): native `<input type="date">` (OS wheel/calendar, ISO value). Test below is written for (A); for (B) assert `type="date"`.
- Table cells: Type → `docTypeLabel(doc.doc_type)`, Expiry tag → `formatShortDate(doc.expiry_date)`.
- Upload: `fluid`.
- In `ParticipantView` steps, with `const required = store.trip?.required_doc_types ?? []` (older test fixtures omit it): docs `done` = required.length ? missing.length === 0 : documents.length > 0; `hint` = required.length ? (missing.length ? `Needed: ${labels}` : 'All uploaded') : (documents.length ? `${n} uploaded` : 'Optional — passport, ID or tickets').

- [ ] **Step 1: Write failing tests**

`web/src/components/ParticipantDocs.test.js`:
```js
import { describe, it, expect, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import { useParticipantStore } from '../stores/participant.js'
import { missingDocTypes } from '../utils/requiredDocs.js'
import ParticipantDocs from './ParticipantDocs.vue'

function mountWith(state) {
  const pinia = createPinia(); setActivePinia(pinia)
  Object.assign(useParticipantStore(), state)
  return mountWithBase(ParticipantDocs, { pinia, attachTo: document.body })
}
afterEach(() => { document.body.innerHTML = '' })

describe('missingDocTypes', () => {
  it('ignores expiry: an expired passport still counts as present', () => {
    expect(missingDocTypes(['passport', 'visa'], [{ doc_type: 'passport', expiry_date: '2000-01-01' }])).toEqual(['visa'])
  })
  it('no required types → nothing missing', () => {
    expect(missingDocTypes([], [])).toEqual([])
  })
})

describe('ParticipantDocs (trip-planner-0qh)', () => {
  it('expiry brings up the number pad on a phone', () => {
    const w = mountWith({ trip: { required_doc_types: [] }, documents: [] })
    expect(document.getElementById('doc-expiry').getAttribute('inputmode')).toBe('numeric')
    w.unmount()
  })
  it('rows show labels and readable dates, not stored keys and ISO', () => {
    const w = mountWith({ trip: { required_doc_types: [] }, documents: [{ id: 'd1', doc_type: 'national_id', expiry_date: '2030-04-30', original_name: 'id.pdf' }] })
    expect(w.find('td[data-label="Type"]').text()).toBe('National ID')
    expect(w.find('td[data-label="Expiry"]').text()).toBe('30 Apr 2030')
    w.unmount()
  })
  it('type defaults to the first required type still missing', () => {
    const w = mountWith({ trip: { required_doc_types: ['passport', 'visa'] }, documents: [{ id: 'd1', doc_type: 'passport', original_name: 'p.pdf' }] })
    expect(w.find('#doc-type').text()).toContain('Visa')
    w.unmount()
  })
})
```

`ParticipantView.test.js` (new `it`s, using `mountView`):
```js
const base = { trip: { name: 'Goa 2026', status: 'confirmed', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [], required_doc_types: ['passport', 'visa'] }, person: { name: 'Asha' }, packing: [], tasks: [] }
it('Documents step names the required types still missing', async () => {
  const { wrapper } = await mountView({ ...base, documents: [{ id: 'd1', doc_type: 'passport' }] })
  const docs = wrapper.findAll('.step-card')[1]
  expect(docs.find('.step-hint').text()).toBe('Needed: Visa')
  expect(docs.classes()).not.toContain('step-done')
})
it('Documents step is done when every required type is present', async () => {
  const { wrapper } = await mountView({ ...base, documents: [{ id: 'd1', doc_type: 'passport' }, { id: 'd2', doc_type: 'visa' }] })
  expect(wrapper.findAll('.step-card')[1].classes()).toContain('step-done')
})
it('no required types: optional hint, done after any upload', async () => {
  const trip = { ...base.trip, required_doc_types: [] }
  const empty = await mountView({ ...base, trip, documents: [] })
  expect(empty.wrapper.findAll('.step-card')[1].find('.step-hint').text()).toBe('Optional — passport, ID or tickets')
})
```

- [ ] **Step 2: Run, expect FAIL** (module `requiredDocs.js` missing): `npm test --workspace=web -- ParticipantDocs ParticipantView`
- [ ] **Step 3: Implement** `web/src/utils/requiredDocs.js`:

```js
// tripper.md §6 Missing: a required doc type with no document of that type.
// Expiry is ignored here, as in server/src/lib/missing.js missingDocsByPerson —
// an expiring document is a separate reason (expiryWarnings).
export function missingDocTypes(required = [], documents = []) {
  const have = new Set(documents.map((d) => d.doc_type))
  return required.filter((t) => !have.has(t))
}
```

then the component and step changes above. The expiry field gets the same 44px rule already in the file's `.field :deep(input)`.
- [ ] **Step 4: Run, expect PASS.** Also re-run `qa-upload-reselect` later in Task 5 (it uses `#doc-expiry`? check with `grep -n doc-expiry e2e/*.mjs` and update the selector/fill if it typed into the mask).
- [ ] **Step 5: Commit** `feat(web): /p Documents names the trip's required types; numeric expiry (trip-planner-0qh.3)`

---

### Task 4: Page — steps first, hero copy and dates, no duplicate hint, 44px

**Files:**
- Modify: `web/src/views/ParticipantView.vue`
- Modify: `web/src/components/ParticipantChecklist.vue`
- Test: `web/src/views/ParticipantView.test.js`

**Interfaces:**
- Consumes: `formatDayDate`, `formatShortDate` (`utils/dates.js`).

Changes:
- Goal `fixed_date` → `formatShortDate(goal.fixed_date)` (ParticipantView.vue:133 renders ISO).
- Greeting `Hi {{ name }} 👋` (drop "you're invited to").
- `dateRange`: both dates → `${formatDayDate(s)} – ${formatDayDate(e)}`; otherwise 'Dates TBD'.
- Profile step: `hint` = `store.profileConfirmed ? 'Confirmed' : ''` (keeps qa-participant-profile.mjs:216 and matches the "Profile confirmed ✓" tag); render `<p class="step-hint" v-if="step.hint">`. Rename title "Your profile" → "Your details". The "Still needed: …" text now appears only beside Save (Task 2 keeps it). Update the 4hi view test `profile step hint names what is still needed` → asserts the profile step shows no `.step-hint` and no "Still needed" until Save.
- Order: step cards render before `<ParticipantItinerary>`.
- `.ics` button: drop `size="small"`.
- ParticipantChecklist: root `<div>` (no card/h2); due tag `due ${formatShortDate(item.due_date)}`; `li` `min-height: 2.75rem`.
- Phone floor (scoped in ParticipantView):

```css
@media (max-width: 640px) {
  .p-page :deep(.p-button),
  .p-page :deep(input:not([type='checkbox']):not([type='radio'])),
  .p-page :deep(.p-select),
  .p-page :deep(textarea) { min-height: 2.75rem; }
}
```

- [ ] **Step 1: Write failing tests**

```js
it('greets without "invite" and shows readable dates (trip-planner-0qh)', async () => {
  const { wrapper } = await mountView({ ...base, trip: { ...base.trip, goals: [{ title: 'Sunset', fixed_date: '2026-08-02' }] }, documents: [] })
  const hero = wrapper.find('.p-hero').text()
  expect(hero).toContain('Hi Asha')
  expect(hero).not.toMatch(/invite/i)
  expect(hero).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  expect(hero).toContain('Sat 1 Aug')
})
it('one date missing → Dates TBD', async () => {
  const { wrapper } = await mountView({ ...base, trip: { ...base.trip, end_date: null }, documents: [] })
  expect(wrapper.find('.p-hero').text()).toContain('Dates TBD')
})
it('the three steps come before the itinerary', async () => {
  const { wrapper } = await mountView({ ...base, documents: [], itinerary: [{ day_date: '2026-08-01', items: [] }] })
  const html = wrapper.html()
  expect(html.indexOf('step-card')).toBeLessThan(html.indexOf('pi-heading'))
})
it('no card nested inside a step card', async () => {
  const { wrapper } = await mountView({ ...base, documents: [] })
  expect(wrapper.findAll('.step-card .card')).toHaveLength(0)
})
```

(Check `formatDayDate('2026-08-01')` output first with `node -e` against `web/src/utils/dates.js`; use whatever exact string it returns in the assertion.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; then the full `npm test` and `npm run build`.
- [ ] **Step 5: Commit** `feat(web): /p steps first, plain greeting, readable dates, 44px floor (trip-planner-0qh.4)`

---

### Task 5: Browser gate `e2e/qa-participant-phone.mjs` + ui-verify

**Files:**
- Create: `e2e/qa-participant-phone.mjs` (pattern: `e2e/qa-participant-profile.mjs` for fixture + link minting; `e2e/qa-people.mjs` for the 390 light/dark loop and `audit()` contrast)
- Modify: `server/scripts/purge-qa-data.js` (fixture trip/person names)
- Modify: `e2e/qa-participant-profile.mjs` — red between the Task 4 and Task 5 commits (say so in the Task 4 commit body). It reads the profile `.step-hint` (now empty until complete), labels with `for` incl. `pf-dietary` (now a fieldset legend) and sets dietary through the Select; switch to the radios and to the post-Save `.pf-still` text.
- Modify: `e2e/qa-datepicker.mjs` §9 (lines ~1488–1560) — it asserts the /p expiry is the *typeable mask*; follow whatever Task 3's expiry decision is. (That gate is already red for da6; only its §9 /p checks are ours.)

Fixture (as demo@example.com / demo-pass-123): trip `Phone QA /p` with `required_doc_types: ['passport','visa']`, dates set; participant `Phone QA Person` with no phone/emergency/dietary; mint their link.

Assertions at 390×900, light and dark (`colorScheme`):
1. No horizontal overflow (`scrollWidth <= 390`).
2. Every visible `button, input:not([type=checkbox]):not([type=radio]):not([type=file]), .p-select, textarea, summary, .pf-choice` has `getBoundingClientRect().height >= 44` — visible = `getClientRects().length && height > 1` and not inside `.p-hidden-accessible` (PrimeVue's 1px a11y inputs); open the fold before measuring its contents.
3. The first 4 form questions in DOM order are Name, Phone, Emergency contact, Dietary; `details.pf-more` is closed; page `scrollHeight` at rest is lower than the pre-change 2531px (assert `< 2000`, print the number).
4. Hero text: no `/\d{4}-\d{2}-\d{2}/`, no `/invite/i`.
5. Documents hint reads `Needed: Passport, Visa`; `#doc-expiry` has `inputmode=numeric` (or `type=date` under expiry option B).
6. Fill phone/emergency, tap Veg, Save → "Profile confirmed ✓" visible (use `waitFor`, not `isVisible({timeout})`); the Overview for that trip no longer lists the person's profile fields (doc reasons remain).
7. Contrast audit AA on the page and with the fold open.
Screenshots `shots/participant-390-{light,dark}.png` (+ `-open` with the fold open).

Falsify: with a cp backup of `ParticipantView.vue`, delete the 44px media query → check 2 goes red; restore and grep the restore. Same for the fold (`open` attribute added) → check 3 red.

- [ ] **Step 1:** write the gate; run against current main (before Tasks 2–4 land, if run in parallel) and watch checks 2–5 fail.
- [ ] **Step 2:** after Tasks 2–4, run green: `node e2e/qa-participant-phone.mjs`; then `node scripts/run-e2e.mjs gates` (expect the da6 four still red, nothing else).
- [ ] **Step 3:** falsify as above.
- [ ] **Step 4:** look at the 4 screenshots (ui-verify, 390 light + dark); purge script leaves baseline 4 trips / 7 persons.
- [ ] **Step 5: Commit** `test(e2e): qa-participant-phone gate — 44px, required first, readable dates (trip-planner-0qh.5)`
