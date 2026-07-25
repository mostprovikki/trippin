// Global Search gate.
//
// The vision lists Global Search as a core deliverable — "a quiet global search
// across the group's world … fast, keyboard-first, out of the way until you need
// it" — and there was no route and no backend at all.
//
// Search is defined by its keyboard path, so that is what this drives: summon
// with the shortcut, type, arrow, Enter, and land on the right screen. It also
// checks the things a unit test cannot: that the shortcut works from an
// arbitrary screen, that the overlay really is absent until asked for, and that
// every kind the vision names actually returns hits against real seeded rows.
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-search.mjs
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots')
mkdirSync(shots, { recursive: true })

function findExecutable() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort()
    for (const d of dirs.reverse()) {
      const exe = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
      if (existsSync(exe)) return exe
    }
  }
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (existsSync(systemChrome)) return systemChrome
  throw new Error('No chromium headless shell in the playwright cache and no system Chrome found')
}

const BASE = process.env.BASE_URL || 'http://[::1]:5173'
const EMAIL = process.env.QA_EMAIL || 'demo@example.com'
const PASSWORD = process.env.QA_PASSWORD || 'demo-pass-123'
// Chromium headless on macOS still reports a Mac platform, so the app renders
// ⌘K — but Meta is the modifier the page listens for either way.
const MOD = 'Meta'

let failures = 0
const consoleErrors = []
function ok(name, extra) { console.log(`ok - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`${m.text()} (${m.location()?.url || ''})`)
})

const palette = page.locator('[data-test="search-palette"]')
const paletteInput = page.locator('[data-test="search-palette-input"]')

async function openPalette() {
  await page.keyboard.press(`${MOD}+k`)
  return palette.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
}
async function typeQuery(q) {
  await paletteInput.fill(q)
  // Debounce is 180ms; give the request room to land.
  await page.waitForTimeout(600)
}
function rows() { return page.locator('[data-test="search-palette"] .sp-row') }
async function activeRowText() {
  return page.locator('[data-test="search-palette"] .sp-row[data-active="true"]')
    .first().innerText().catch(() => null)
}

// ---------- login ----------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill(EMAIL)
await page.getByLabel(/password/i).fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
ok('login', EMAIL)

// ---------- seed one of every searchable kind ----------
// The vision names six: trips, people, documents, itinerary items, checklist
// templates, and archived trips + their notes. All six share the token SRCHQA so
// a single query can prove each kind is wired end to end.
const seeded = await page.evaluate(async () => {
  const json = (r) => r.json().catch(() => null)
  const post = (url, body) => fetch(url, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(json)
  const put = (url, body) => fetch(url, {
    method: 'PUT', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(json)
  const id = (r, key) => r?.id || r?.[key]?.id || null
  const made = {}

  // person
  const person = await post('/api/people', { name: 'SRCHQA Person', home_city: 'Chennai' })
  made.personId = id(person, 'person')

  // document — multipart, so build a real FormData with a Blob rather than JSON
  if (made.personId) {
    const fd = new FormData()
    fd.append('file', new Blob(['search gate fixture'], { type: 'text/plain' }), 'SRCHQA-scan.txt')
    fd.append('doc_type', 'passport')
    fd.append('doc_number', 'SRCHQA-9911')
    fd.append('expiry_date', '2035-04-30')
    const doc = await fetch(`/api/people/${made.personId}/documents`, {
      method: 'POST', credentials: 'include', body: fd
    }).then(json)
    made.documentId = id(doc, 'document')
  }

  // trip, with dates so the itinerary can be initialised
  const trip = await post('/api/trips', { name: 'SRCHQA Trip' })
  made.tripId = id(trip, 'trip')
  if (made.tripId) {
    if (made.personId) await post(`/api/trips/${made.tripId}/participants`, { person_id: made.personId })
    await put(`/api/trips/${made.tripId}`, {
      date_mode: 'confirmed', start_date: '2026-09-01', end_date: '2026-09-03'
    })
    const days = await post(`/api/trips/${made.tripId}/itinerary/init`, {})
    const dayId = (days?.days || [])[0]?.id
    made.dayId = dayId || null
    if (dayId) {
      const item = await post(`/api/days/${dayId}/items`, {
        title: 'SRCHQA Sunset walk', location: 'SRCHQA Beach', category: 'activity'
      })
      made.itemId = id(item, 'item')
    }
  }

  // checklist template (trip_id null + is_template), with an item inside it
  const tpl = await post('/api/checklists', {
    kind: 'packing', name: 'SRCHQA Template', is_template: true, trip_type_tags: ['beach']
  })
  made.templateId = id(tpl, 'checklist')
  if (made.templateId) await post(`/api/checklists/${made.templateId}/items`, { title: 'SRCHQA Sunscreen' })

  // a SECOND trip to archive, so the first stays active and both kinds show up
  const old = await post('/api/trips', { name: 'SRCHQA Past Trip' })
  made.archivedTripId = id(old, 'trip')
  if (made.archivedTripId) {
    const arch = await post(`/api/trips/${made.archivedTripId}/archive`, {
      notes: 'SRCHQA lesson: book the permits earlier'
    })
    made.archived = !!arch && !arch.error
  }
  return made
})
const MUST_SEED = ['personId', 'documentId', 'tripId', 'itemId', 'templateId', 'archivedTripId']
const missing = MUST_SEED.filter((k) => !seeded[k])
if (missing.length) fail('seed fixtures', `could not create: ${missing.join(', ')} — got ${JSON.stringify(seeded)}`)
else ok('seeded one row of every searchable kind', MUST_SEED.join(', '))

// ---------- 1. it stays out of the way until summoned ----------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
if (await palette.count()) fail('palette is hidden until asked for', 'overlay present on load')
else ok('palette is hidden until asked for')

// ---------- 2. the shortcut works, from a screen that is not /search ----------
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
if (!(await openPalette())) {
  fail(`${MOD}+K opens the palette`, 'overlay never appeared')
} else {
  ok(`${MOD}+K opens the palette`, 'from /people')
  const focused = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-test') === 'search-palette-input')
  if (focused) ok('the search box takes focus on open')
  else fail('the search box takes focus on open', 'focus was elsewhere')
}

// ---------- 3. Escape closes it ----------
await page.keyboard.press('Escape')
if (await palette.waitFor({ state: 'hidden', timeout: 2000 }).then(() => true).catch(() => false)) {
  ok('Escape closes the palette')
} else {
  fail('Escape closes the palette', 'overlay stayed visible')
}

// ---------- 4. every kind the vision names returns a hit ----------
await openPalette()
await typeQuery('SRCHQA')
await page.waitForTimeout(200)
await page.screenshot({ path: path.join(shots, 'search-01-palette.png') })
const kinds = await page.evaluate(() => {
  const groups = Array.from(document.querySelectorAll('[data-test="search-palette"] .sp-group'))
  return groups.map((g) => g.textContent.trim())
})
const rowCount = await rows().count()
if (rowCount > 0) ok('the palette returns results', `${rowCount} row(s) across: ${kinds.join(', ') || '(no headers)'}`)
else fail('the palette returns results', 'no rows for a query that matches seeded data')

// All six kinds the vision names, not just the two that are easy to seed.
for (const expected of ['Trips', 'People', 'Documents', 'Itinerary', 'Checklist templates', 'Archive']) {
  if (kinds.includes(expected)) ok(`group present: ${expected}`)
  else fail(`group present: ${expected}`, `saw: ${kinds.join(', ') || 'none'}`)
}

// ---------- 5. arrow keys move the highlight ----------
const firstActive = await activeRowText()
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(150)
const secondActive = await activeRowText()
if (rowCount < 2) {
  console.log('  · only one row; arrow-move not exercised')
} else if (firstActive && secondActive && firstActive !== secondActive) {
  ok('ArrowDown moves the highlight', `${JSON.stringify(firstActive.split('\n')[0])} -> ${JSON.stringify(secondActive.split('\n')[0])}`)
} else {
  fail('ArrowDown moves the highlight', `stayed on ${JSON.stringify(firstActive)}`)
}
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(150)
const backActive = await activeRowText()
if (rowCount < 2) { /* skipped above */ }
else if (backActive === firstActive) ok('ArrowUp moves it back')
else fail('ArrowUp moves it back', `expected ${JSON.stringify(firstActive)}, got ${JSON.stringify(backActive)}`)

// ---------- 6. Enter navigates to the highlighted result ----------
const targetText = await activeRowText()
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
const landedUrl = page.url()
if (/\/(trips|people)\/[\w-]+/.test(landedUrl)) {
  ok('Enter opens the highlighted result', `${JSON.stringify((targetText || '').split('\n')[0])} -> ${landedUrl.replace(BASE, '')}`)
} else {
  fail('Enter opens the highlighted result', `still at ${landedUrl}`)
}
if (await palette.count()) fail('the palette closes after navigating', 'overlay still mounted')
else ok('the palette closes after navigating')

// ---------- 7. the full results page, deep-linked ----------
await page.goto(`${BASE}/search?q=SRCHQA`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(shots, 'search-02-results-page.png'), fullPage: true })
const viewInput = await page.locator('[data-test="search-view-input"]').inputValue().catch(() => null)
if (viewInput === 'SRCHQA') ok('/search?q= populates the box from the URL')
else fail('/search?q= populates the box from the URL', `input reads ${JSON.stringify(viewInput)}`)

const countText = await page.locator('[data-test="search-view-count"]').innerText().catch(() => null)
if (countText && /\d+ result/.test(countText)) ok('the results page reports a count', countText.trim())
else fail('the results page reports a count', `saw ${JSON.stringify(countText)}`)

const viewGroups = await page.locator('.search-group h2').allInnerTexts().catch(() => [])
if (viewGroups.length) ok('the results page groups by kind', viewGroups.join(', '))
else fail('the results page groups by kind', 'no groups rendered')

// The results page renders inside the AppNav shell (UI process rule 1: no bare
// routes), so the nav and a breadcrumb have to be there.
const hasNav = await page.locator('header.app-nav').count()
const crumb = await page.locator('.app-crumb-current').innerText().catch(() => null)
if (hasNav && crumb === 'Search') ok('the results page renders inside the app shell', `breadcrumb=${crumb}`)
else fail('the results page renders inside the app shell', `nav=${hasNav} breadcrumb=${JSON.stringify(crumb)}`)

// ---------- 8. a miss is a clear empty state, not a blank screen ----------
await page.goto(`${BASE}/search?q=zzzznotathing`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
if (await page.locator('[data-test="search-view-empty"]').count()) {
  ok('a no-match query renders an empty state')
} else {
  fail('a no-match query renders an empty state', 'no empty state rendered')
}
await page.screenshot({ path: path.join(shots, 'search-03-empty.png') })

// ---------- 9. the nav trigger opens the same palette ----------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const trigger = page.locator('[data-test="search-trigger"]')
if (!(await trigger.count())) {
  fail('the nav has a visible search affordance', 'no [data-test="search-trigger"]')
} else {
  await trigger.click()
  if (await palette.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
    ok('the nav trigger opens the palette')
    await page.keyboard.press('Escape')
  } else {
    fail('the nav trigger opens the palette', 'overlay never appeared')
  }
}

// ---------- 10. search is organizer-scoped ----------
// "This organizer sees nothing for X" is only meaningful if X exists and SOME
// organizer can see it — otherwise the assertion passes on an empty database and
// proves nothing. So confirm the owner CAN find its own data first, in a separate
// browser context, then confirm this organizer cannot.
const OTHER_EMAIL = process.env.QA_OTHER_EMAIL || 'demo@tripper.dev'
const OTHER_PASSWORD = process.env.QA_OTHER_PASSWORD || 'demo-pass-1234'
const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const otherPage = await otherCtx.newPage()
await otherPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await otherPage.getByLabel(/email/i).fill(OTHER_EMAIL)
await otherPage.getByLabel(/password/i).fill(OTHER_PASSWORD)
await otherPage.getByRole('button', { name: /sign in|log in/i }).click()
const otherLoggedIn = await otherPage
  .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
  .then(() => true).catch(() => false)

let ownerCanSee = null
if (!otherLoggedIn) {
  fail('the other organizer can log in', `${OTHER_EMAIL} did not reach an authenticated page`)
} else {
  ownerCanSee = await otherPage.evaluate(async () => {
    const r = await fetch('/api/search?q=Vietnam', { credentials: 'include' })
      .then((x) => x.json()).catch(() => null)
    return r?.total ?? null
  })
  if (ownerCanSee > 0) ok('the owning organizer DOES find its own trip', `"Vietnam" -> ${ownerCanSee} hit(s)`)
  else fail('the owning organizer DOES find its own trip',
    `"Vietnam" returned ${ownerCanSee} — the negative check below would be vacuous`)
}
await otherCtx.close()

await openPalette()
await typeQuery('Vietnam')
const leakedTrip = await rows().count()
await paletteInput.fill('')
await typeQuery('Asha')
const leakedPerson = await rows().count()
if (leakedTrip === 0 && leakedPerson === 0) {
  ok('search does not leak the other organizer\'s trip or person',
    ownerCanSee ? `while the owner sees ${ownerCanSee}` : 'owner visibility unconfirmed')
} else {
  fail('search does not leak the other organizer\'s data',
    `"Vietnam" returned ${leakedTrip} row(s), "Asha" returned ${leakedPerson} row(s)`)
}
await page.keyboard.press('Escape')

// ---------- report ----------
console.log('')
const real = consoleErrors.filter((e) => !/favicon|sourcemap|\/archive/i.test(e))
if (real.length) {
  console.error(`console errors (${real.length}):`)
  for (const e of real.slice(0, 10)) console.error(`  ! ${e}`)
  failures += real.length
}
await browser.close()
purgeQaData()
console.log(failures ? `SEARCH QA FAILED (${failures})` : 'SEARCH QA OK')
process.exit(failures ? 1 : 0)
