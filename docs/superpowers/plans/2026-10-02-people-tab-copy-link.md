# People tab: one-click Copy link, Missing tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each People row gets one-click "Copy ⟨name⟩'s link" (never revokes). Replace link, message, QR code and Remove move under the row's `⋯`. Each row's tag is the Overview's Missing reason.

**Architecture:** `useCopyLink` gains a `resolve()` that returns a participant's absolute URL. It re-reads the active link first, mints only when nothing can be re-read, and confirms before revoking. `copy()` is built on `resolve()`, with an optional `compose(url)` for the message text and a `replace` flag. `TripPeopleView` reads the readiness store, which TripLayout already fetches, and runs it through `missingRows`, so its tags are the same set as the People badge and the Overview's Who's missing what.

**Tech Stack:** Vue 3 + PrimeVue 4 (Button, Menu, Tag), Pinia, vitest + happy-dom, playwright-core gates.

**Spec:** `docs/design/tripper.md` §1 (copy link "on the row … and on People"), §4, §5, §6, §9 D1/D8. Bead `trip-planner-27f`, which also holds the design-gate note. Evidence: `docs/design/smoke-2026-10.md` findings 3–4.

## Global Constraints

- Vocabulary (§6): "⟨Name⟩'s link"; never "token", "magic link", "invite". "Missing", never "incomplete"/"pending". Organizer and participant names: never "member", "guest", "user".
- Copy never revokes (D1). Replacing an active link always asks first, using `replaceLinkConfirm` (`web/src/composables/useCopyLink.js`).
- One number, one place (§6): the set of rows tagged Missing = `missingRows(readiness participants).rows` = People badge = Overview "N of M".
- Do not touch the links API (`server/src/routes/links.routes.js`).
- Row actions ≥ 44px tall at 390px (§4 / D7). No horizontal overflow at 390. WCAG AA in light and dark.
- TDD: watch every new test fail before implementing. Falsify the browser gate by breaking code with a `cp` backup, never `git checkout --`.
- Commit per task. Push after each commit (owner standing instruction 2026-10-02).

## Review Focus

1. **Copy for a person whose active link can't be re-read** (minted before encryption): asks "Replace ⟨name⟩'s link?" and mints only on accept. Cancel copies nothing and revokes nothing. → Task 1 tests.
2. **Closing the Replace dialog with Escape/×** (neither accept nor reject): `resolve()` must settle to `null`, not hang a pending promise that later copies. → Task 1 `onHide` test.
3. **Readiness for another trip still in the store** (switching trips): rows must not show the previous trip's Missing tags. → Task 2 `lastTripId` test.
4. **Adding or removing a participant**: tags and badge refresh without a reload. → Task 2 refresh test.
5. **Copy message for a person with no link yet**: mints one first. The message must contain the real URL, never an empty string as the old reveal panel allowed. → Task 3 test.

---

## File map

| File | Change |
|---|---|
| `web/src/composables/useCopyLink.js` | add `resolve()`; `copy()` gains `compose`, `replace` options and returns the URL |
| `web/src/composables/useCopyLink.test.js` | tests for the above |
| `web/src/views/trip/TripPeopleView.vue` | Missing tag + reason, Copy button, row `⋯` menu, QR panel; reveal panel and link tags removed |
| `web/src/views/trip/TripPeopleView.test.js` | rewrite reveal-panel tests as menu tests |
| `e2e/qa-people.mjs` (new) | browser gate |
| `server/scripts/purge-qa-data.js` | register `People QA *` / `People QA Person *` |

---

### Task 1: `useCopyLink.resolve()` + `copy()` options

**Files:**
- Modify: `web/src/composables/useCopyLink.js`
- Test: `web/src/composables/useCopyLink.test.js`

**Interfaces:**
- Produces:
  - `resolve(tripId, personId, name, { hasActiveLink = false, replace = false } = {}) → Promise<string|null>`: absolute URL (`location.origin + url`), or `null` when cancelled or failed. Failures are already reported via `notify.error`.
  - `copy(tripId, personId, name, { hasActiveLink, replace, compose } = {}) → Promise<string|null>`: writes `compose ? compose(url) : url` to the clipboard. Toast `"${name}'s link copied"` or `"${name}'s message copied"`. Returns the URL or `null`.
  - `replaceLinkConfirm` unchanged.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe('useCopyLink')`; reuse the file's existing `api`/`confirm`/`notify` mocks. Read lines 1–22 first and match their names.)

```js
  it('replace: skips the re-read, asks, mints, copies the new link', async () => {
    api.post.mockResolvedValue({ url: '/p/NEW' })
    confirmRequire.mockImplementation((o) => o.accept())
    const url = await useCopyLink().copy('t', 'p', 'Asha', { hasActiveLink: true, replace: true })
    expect(api.get).not.toHaveBeenCalled()
    expect(confirmRequire).toHaveBeenCalledOnce()
    expect(url).toBe(location.origin + '/p/NEW')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(location.origin + '/p/NEW')
  })

  it('replace cancelled by closing the dialog: resolves null, mints and copies nothing', async () => {
    confirmRequire.mockImplementation((o) => o.onHide())
    const url = await useCopyLink().copy('t', 'p', 'Asha', { hasActiveLink: true, replace: true })
    expect(url).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('compose: copies the composed text and says message', async () => {
    api.get.mockResolvedValue({ url: '/p/OLD' })
    await useCopyLink().copy('t', 'p', 'Asha', { hasActiveLink: true, compose: (u) => `Hi! ${u}` })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`Hi! ${location.origin}/p/OLD`)
    expect(notifySuccess).toHaveBeenCalledWith("Asha's message copied")
  })

  it('resolve: re-reads without touching the clipboard', async () => {
    api.get.mockResolvedValue({ url: '/p/OLD' })
    expect(await useCopyLink().resolve('t', 'p', 'Asha', { hasActiveLink: true })).toBe(location.origin + '/p/OLD')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run, expect 4 FAIL** — `npx vitest run --root web src/composables/useCopyLink.test.js` (`resolve is not a function`, `replace` ignored, etc.)

- [ ] **Step 3: Implement** (replace `useCopyLink()` body; keep `replaceLinkConfirm` and the header comment, adding one line about `resolve`)

```js
export function useCopyLink() {
  const confirm = useConfirm()
  const notify = useNotify()

  // Settles once: accept → true; reject, ×, Escape → false (onHide fires after
  // accept too, but the promise has already settled by then).
  const ask = (name) => new Promise((res) => confirm.require({
    ...replaceLinkConfirm(name, () => res(true)), reject: () => res(false), onHide: () => res(false)
  }))
  const mint = async (tripId, personId) =>
    location.origin + (await api.post(`/api/trips/${tripId}/participants/${personId}/link`)).url

  async function resolve(tripId, personId, name, { hasActiveLink = false, replace = false } = {}) {
    try {
      if (!replace) {
        try { return location.origin + (await api.get(`/api/trips/${tripId}/participants/${personId}/link`)).url }
        catch (e) { if (e.code !== 'NO_RECOVERABLE_LINK') throw e }
      }
      if (hasActiveLink && !(await ask(name))) return null
      return await mint(tripId, personId)
    } catch (e) { notify.error(e.message); return null }
  }

  async function copy(tripId, personId, name, opts = {}) {
    const url = await resolve(tripId, personId, name, opts)
    if (!url) return null
    const what = opts.compose ? 'message' : 'link'
    try {
      await navigator.clipboard.writeText(opts.compose ? opts.compose(url) : url)
      notify.success(`${name}'s ${what} copied`)
    } catch {
      notify.error(`Could not access clipboard — copy the ${what} manually`)
    }
    return url
  }

  return { copy, resolve }
}
```

- [ ] **Step 4: Run, expect all PASS** (new + the 6 existing). Also `npx vitest run --root web src/views/trip/TripOverviewView.test.js`, since the Overview is a caller.
- [ ] **Step 5: Commit + push** — `git commit -m "feat(web): useCopyLink resolve(), replace + compose options (trip-planner-27f)"`

---

### Task 2: Rows tagged Missing with the Overview's reason

**Files:**
- Modify: `web/src/views/trip/TripPeopleView.vue`
- Test: `web/src/views/trip/TripPeopleView.test.js`

**Interfaces:**
- Consumes: `missingRows(participants, tripEnd) → { rows: [{ personId, name, severity: 'danger'|'warn', pills, reasons: string[] }], complete, total }` from `web/src/utils/overview.js`. `useReadinessStore()` → `{ data: { participants: [...] }, lastTripId, fetch(tripId) }`.
- Produces: `missingFor(personId) → row|undefined` and `refreshReadiness()` inside the view (used by Task 3).

- [ ] **Step 1: Failing tests.** In `mountView()`, add a readiness store seeded with `lastTripId: 't1'` and `data.participants`, and stub `readiness.fetch = vi.fn().mockResolvedValue()`. Make the function take `{ participants, readinessParticipants, readinessTrip = 't1' }` overrides. Tests:

```js
  const ok = { profile_confirmed: 1, doc_warnings: [], missing_fields: [], missing_docs: [] }

  it('tags exactly the Overview's Missing people, with its reason; complete people untagged', async () => {
    const { wrapper } = await mountView({
      participants: [{ person_id: 'a', name: 'Asha' }, { person_id: 'm', name: 'Meena' }],
      readinessParticipants: [{ ...ok, person_id: 'a', name: 'Asha' }, { ...ok, person_id: 'm', name: 'Meena', missing_fields: ['dietary'] }]
    })
    const rows = wrapper.findAll('.participant-card')
    expect(rows[0].find('[data-missing]').exists()).toBe(false)
    expect(rows[1].find('[data-missing]').text()).toBe('Missing')
    expect(rows[1].find('.participant-reason').text()).toBe('No dietary preference')
  })

  it('drops the link-state and profile-unconfirmed tags', async () => {
    const { wrapper } = await mountView({ readinessParticipants: [{ ...ok, person_id: 'p1', name: 'Asha', profile_confirmed: 0 }] })
    expect(wrapper.text()).not.toMatch(/link active|no link|profile unconfirmed/)
  })

  it('ignores readiness held for another trip', async () => {
    const { wrapper } = await mountView({ readinessTrip: 't2', readinessParticipants: [{ ...ok, person_id: 'p1', name: 'Asha', missing_fields: ['phone'] }] })
    expect(wrapper.find('[data-missing]').exists()).toBe(false)
  })

  it('refreshes readiness after removing a participant', async () => {
    const { wrapper, trips, readiness } = await mountView()
    trips.removeParticipant = vi.fn().mockResolvedValue()
    const dialog = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await wrapper.find('[aria-label="Remove Asha"]').trigger('click')   // Task 3 moves this into ⋯ and updates the test
    await wrapper.vm.$nextTick()
    ;[...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove').click()
    await flushPromises()
    expect(readiness.fetch).toHaveBeenCalledWith('t1')
    dialog.unmount()
  })
```

Add-participant gets the same `refreshReadiness()` call. It has no unit test because driving the filterable Select in happy-dom isn't worth it; the Task 4 gate covers it with a real add, assertion 1.

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run --root web src/views/trip/TripPeopleView.test.js`
- [ ] **Step 3: Implement.** In `<script setup>`:

```js
import { useReadinessStore } from '../../stores/readiness.js'
import { missingRows } from '../../utils/overview.js'
const readiness = useReadinessStore()
// §6 one number, one place: same rows as the People badge and the Overview's
// Who's missing what. Readiness held for another trip counts as none.
const missingByPerson = computed(() => {
  const ps = readiness.lastTripId === tripId.value ? readiness.data?.participants || [] : []
  return new Map(missingRows(ps, trips.current?.end_date || null).rows.map((r) => [r.personId, r]))
})
const missingFor = (personId) => missingByPerson.value.get(personId)
const refreshReadiness = () => readiness.fetch(tripId.value).catch(() => { /* badge refreshes on next section change */ })
```

Call `refreshReadiness()` after a successful `addParticipant` and in `removeParticipant`'s accept. In the template, replace the three `<Tag>`s in `.participant-id` with:

```html
<Tag v-if="missingFor(p.person_id)" data-missing value="Missing" :severity="missingFor(p.person_id).severity" />
```

and add, after `.participant-row`:

```html
<p v-if="missingFor(p.person_id)" class="participant-reason">{{ missingFor(p.person_id).reasons.join(' · ') }}</p>
```

CSS: `.participant-reason { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.875rem; }`

- [ ] **Step 4: Run, expect PASS**, then the whole web suite: `npm test --workspace=web`
- [ ] **Step 5: Commit + push** — `feat(web): People rows tagged Missing with the Overview's reason (trip-planner-27f)`

---

### Task 3: Copy ⟨name⟩'s link on the row, the rest under `⋯`

**Files:**
- Modify: `web/src/views/trip/TripPeopleView.vue`
- Test: `web/src/views/trip/TripPeopleView.test.js`

**Interfaces:**
- Consumes: `useCopyLink().copy / resolve` (Task 1); `missingFor`, `refreshReadiness` (Task 2); `trips.fetchLinks`, `trips.removeParticipant`; `replaceLinkConfirm`.
- Produces: per-row DOM contract used by the Task 4 gate. Button `Copy ⟨name⟩'s link`; button `aria-label="More actions for ⟨name⟩"` opening a `Menu` with items **Replace link**, **Copy message**, **Show QR code**, **Remove from trip**; QR panel `.link-qr` with `img[alt="QR code for ⟨name⟩'s link"]`.

- [ ] **Step 1: Failing tests.** Rewrite the reveal-panel tests: "reveals a copyable invite message…", "copies the invite message…", "still reveals the link… QR fails", "formats the invite message dates…", the "from <date>" one and the "the trip" fallback one. Keep the Remove and confirm tests but drive them through the menu. Open the menu the way `pasteViaMenu` in `web/src/test-utils.js` does: click the `⋯` button, then click the `.p-menu-item` whose text matches. Add a local helper `pick(wrapper, name, label)`. Mock `../../composables/useCopyLink.js`'s `useCopyLink` with `copy`/`resolve` spies (keep `replaceLinkConfirm` real via `vi.importActual`). New tests:

```js
  it('one click copies the person's link through useCopyLink, never minting here', async () => {
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn()
    const btn = wrapper.findAll('button').find((b) => b.text() === "Copy Asha's link")
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(copySpy).toHaveBeenCalledWith('t1', 'p1', 'Asha', { hasActiveLink: false })
    expect(trips.createLink).not.toHaveBeenCalled()
  })
  it('Replace link (⋯) copies with replace:true, then refreshes links and readiness', ...)
    // expect copySpy toHaveBeenCalledWith('t1','p1','Asha',{ hasActiveLink: true, replace: true })
    // then trips.fetchLinks and readiness.fetch called with 't1'
  it('Replace link cancelled (copy → null) refreshes nothing', ...)
  it('Copy message composes the trip line + the link, dates via formatDayDate', ...)
    // copySpy's 4th arg .compose('https://x/p/T') === "You're in for Goa 2026! 🎒 Sat 1 Aug – Wed 5 Aug. Tap to confirm your details: https://x/p/T"
    // (exact formatDayDate output: copy the value the current test file already asserts)
  it('Copy message: "from <date>" with only a start date; "the trip" with no name', ...)
  it('Show QR code renders the QR of the resolved link under the row, Close hides it', ...)
    // resolveSpy → 'https://x/p/T'; QRCode.toDataURL called with it; img alt "QR code for Asha's link"
  it('QR failure says so and shows no stale image', ...)
  it('Remove from trip (⋯) confirms, removes, refreshes readiness', ...)
  it('no "invite" anywhere: text, aria-labels, alt', async () => {
    const { wrapper } = await mountView()
    const attrs = [...wrapper.element.querySelectorAll('*')].flatMap((el) => [el.getAttribute('aria-label'), el.getAttribute('alt')]).filter(Boolean)
    expect([wrapper.text(), ...attrs].join(' ')).not.toMatch(/invite/i)
  })
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Script: remove `revealedLink`, `mintLink`, `createLink`, `copyLink`, `copyMessage` and the `inviteMessage` name. Add:

```js
import Menu from 'primevue/menu'
import { useCopyLink } from '../../composables/useCopyLink.js'
const { copy, resolve } = useCopyLink()
const qr = ref(null) // { personId, dataUrl }
const menus = ref({}) // personId → Menu instance

// The WhatsApp text that goes with a link (was "invite message").
function linkMessage(url) {
  const tripName = trips.current?.name || 'the trip'
  const { start_date: start, end_date: end } = trips.current || {}
  const dates = start && end ? `${formatDayDate(start)} – ${formatDayDate(end)}` : start ? `from ${formatDayDate(start)}` : 'Dates TBD'
  return `You're in for ${tripName}! 🎒 ${dates}. Tap to confirm your details: ${url}`
}
const copyLink = (p) => copy(tripId.value, p.person_id, p.name, { hasActiveLink: activeLink(p.person_id) })
async function replaceLink(p) {
  if (!(await copy(tripId.value, p.person_id, p.name, { hasActiveLink: activeLink(p.person_id), replace: true }))) return
  try { await trips.fetchLinks(tripId.value) } catch (e) { notify.error(e.message) }
  refreshReadiness()
}
const copyMessage = (p) => copy(tripId.value, p.person_id, p.name, { hasActiveLink: activeLink(p.person_id), compose: linkMessage })
async function showQr(p) {
  qr.value = null
  const url = await resolve(tripId.value, p.person_id, p.name, { hasActiveLink: activeLink(p.person_id) })
  if (!url) return
  try { qr.value = { personId: p.person_id, dataUrl: await QRCode.toDataURL(url) } }
  catch { notify.error(`Could not generate a QR code — copy ${p.name}'s link instead`) }
}
const menuItems = (p) => [
  { label: 'Replace link', icon: 'pi pi-refresh', command: () => replaceLink(p) },
  { label: 'Copy message', icon: 'pi pi-comment', command: () => copyMessage(p) },
  { label: 'Show QR code', icon: 'pi pi-qrcode', command: () => showQr(p) },
  { separator: true },
  { label: 'Remove from trip', icon: 'pi pi-trash', class: 'menu-danger', command: () => removeParticipant(p.person_id) }
]
```

`showQr`/`copyMessage` mint when there is no link, which is what Copy does (Review Focus 5). `removeParticipant` keeps its confirm and gains `refreshReadiness()` (Task 2).

Template `.participant-actions`:

```html
<Button size="small" outlined icon="pi pi-copy" :label="`Copy ${p.name}'s link`" @click="copyLink(p)" />
<Button icon="pi pi-ellipsis-h" severity="secondary" text rounded :aria-label="`More actions for ${p.name}`"
  aria-haspopup="true" :aria-controls="`pm-${p.person_id}`" @click="menus[p.person_id].toggle($event)" />
<Menu :id="`pm-${p.person_id}`" :ref="(el) => { if (el) menus[p.person_id] = el }" :model="menuItems(p)" popup />
```

Replace the `.link-reveal` block with:

```html
<div v-if="qr && qr.personId === p.person_id" class="link-qr">
  <img :src="qr.dataUrl" :alt="`QR code for ${p.name}'s link`" />
  <Button label="Close" size="small" text @click="qr = null" />
</div>
```

SectionHeader description → `"Who's coming, and each person's link."`; EmptyState message → `"No participants yet — add people, then copy each person's link."`. CSS: drop `.link-reveal`, `.invite-message*`, `.invite-qr`. Add `.link-qr { display:flex; align-items:center; gap:.75rem; margin-top:.5rem }` and `.link-qr img { width:8rem; height:8rem }`. At `<640px`, make `.participant-actions .p-button { min-height: 44px }` and give the `⋯` button `min-width: 44px`. If `.menu-danger` isn't already styled in `main.css` (grep), colour it `var(--app-danger)`.

- [ ] **Step 4: Run PASS**; then `npm test` and `npm run build`. The build catches a removed export that vitest misses (memory).
- [ ] **Step 5: Commit + push** — `feat(web): People — Copy ⟨name⟩'s link on the row, Replace/message/QR/remove under ⋯ (trip-planner-27f)`

---

### Task 4: Browser gate `e2e/qa-people.mjs`

**Files:**
- Create: `e2e/qa-people.mjs` (copy the harness from `e2e/qa-participant-profile.mjs`: findExecutable, ok/fail, hue/redish, login, `audit()`, purge before and after)
- Modify: `server/scripts/purge-qa-data.js`: TRIP_PATTERNS `'People QA *',   // e2e/qa-people.mjs`; PERSON_PATTERNS `'People QA Person *'`

**Interfaces:**
- Consumes: Task 3's DOM contract; APIs `POST /api/trips`, `PUT /api/trips/:id`, `POST /api/people`, `POST /api/trips/:id/participants`, `POST/GET /api/trips/:id/participants/:pid/link`, `GET /api/trips/:id/links` (check the exact list route in `web/src/stores/trips.js` `fetchLinks`), `PUT /api/participant/profile` (Bearer), `POST /api/people/:id/documents`.

Fixtures (`TS = Date.now()`): trip `People QA ${TS}` with dates +30..+40. Four participants:
- **Complete**: full fields, confirmed via `/p` PUT.
- **Diet**: phone + emergency contact only, confirmed via `/p`.
- **Passport**: full + confirmed, with a passport expiring at +35.
- **Nolink**: full fields, never given a link.

Context: `browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })`. Read the clipboard with `page.evaluate(() => navigator.clipboard.readText())`.

Assertions (each `fail()`s when its element is absent; nothing `continue`s):
1. **One number:** `[data-missing]` row names on People = Overview `.missing-card [data-person-row]` names = People badge count (`.trip-nav-badge` on the `href$="/people"` link). Reach People by clicking that nav link, not `goto`.
2. **Same reason:** for each tagged person, People's `.participant-reason` text equals the Overview's `.overview-row-reason` for that person.
3. **Complete untagged; no** `link active|no link|profile unconfirmed|invite` in page text, aria-labels or alts.
4. **Copy never revokes:** for Diet, record active links via the links API. Click `Copy …'s link` twice. The clipboard ends with the same `/p/…` both times, matching the link the fixture minted. Active-link count is unchanged and nothing was revoked.
5. **Copy with no link mints without a dialog:** Nolink → no `.p-confirmdialog` visible within 500ms. Clipboard holds a `/p/` URL. That person now has exactly one active link.
6. **Replace asks, then revokes and copies a new link:** `⋯` → Replace link → dialog `Replace … link?` visible (fail if not within 2s). Accept → clipboard URL differs from step 4's and the old link is revoked (API).
7. **Phone (390) light + dark:** overflow ≤ 1px; each row's Copy and `⋯` ≥ 44px tall; Copy and `⋯` on the first row are both visible without horizontal scroll; `audit()` AA, plus `audit()` with the `⋯` menu open (teleported overlay). Screenshots at `QA_SHOTS=1` to `e2e/shots/people/`.
8. Console errors = 0.

- [ ] **Step 1:** Write the gate. Run it against Task 3's code and expect it to pass. If it fails, fix the code, not the assertion, unless the assertion is wrong (say which).
- [ ] **Step 2: Falsify.** `cp` backup `TripPeopleView.vue`, then change `copyLink` to pass `{ hasActiveLink: activeLink(p.person_id), replace: true }`. Run → assertion 4 must FAIL. Restore from the backup and grep the restore. Second break: in `missingByPerson`, filter out `severity === 'danger'`. Run → assertion 1 must FAIL. Restore.
- [ ] **Step 3:** `node server/scripts/purge-qa-data.js` shows baseline (4 trips, 7 persons, nothing to delete).
- [ ] **Step 4:** `node scripts/run-e2e.mjs gates`. Everything green except the three trip-planner-da6 gates, if still red. Re-run qa-overview: it shares `useCopyLink`.
- [ ] **Step 5: Commit + push** — `test(e2e): qa-people gate — one number, copy never revokes, 390 light/dark (trip-planner-27f)`. Close the child beads and 27f with the commit range.
