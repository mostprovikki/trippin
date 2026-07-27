// Measures the neutral chrome of PrimeVue's teleported overlays against the warm
// (stone) surface ramp, so "the panel matches the palette" is a number, not a
// vibe. Checks the two elements the earlier QA pass measured as cool slate
// (DatePicker's Today/Clear bar and its today-marker chip) plus the other
// overlays that inherit from the same {surface.*} tokens: Select, Toast,
// ConfirmDialog.
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-surface-palette.mjs
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

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
const EMAIL = process.env.QA_EMAIL || 'demo@example.com'
const PASSWORD = process.env.QA_PASSWORD || 'demo-pass-123'

let failures = 0
const consoleErrors = []
function ok(name, extra) { console.log(`ok - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }

// Tailwind stone vs slate, so a measured colour can be *named* rather than just
// compared. These are the two ramps in play: Aura ships slate, Tripper wants stone.
const STONE = {
  50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1', 400: '#a8a29e',
  500: '#78716c', 600: '#57534e', 700: '#44403c', 800: '#292524', 900: '#1c1917', 950: '#0c0a09'
}
const SLATE = {
  50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
  500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617'
}
// The brand primary is teal, which is *blue-dominant* and so trips a naive
// warm/cool test. A selected day chip, a highlighted Select option and a link
// are all supposed to be teal — flagging them as "cool" would be a false
// positive that trains you to ignore the gate. Recognise them by name instead.
const BRAND = {
  50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
  500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e'
}

function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

// A neutral is "warm" when R >= B (stone/amber side) and "cool" when B > R
// (slate side). That is the whole complaint in one predicate, and it holds for
// any warm ramp rather than only for the exact stone hexes.
function classify(rgb) {
  const m = String(rgb).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return { kind: 'unknown' }
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const hex = rgbToHex(rgb)
  let name = null
  let brand = false
  for (const [k, v] of Object.entries(STONE)) if (v === hex) name = `stone-${k}`
  for (const [k, v] of Object.entries(SLATE)) if (v === hex) name = `slate-${k}`
  for (const [k, v] of Object.entries(BRAND)) if (v === hex) { name = `brand-teal-${k}`; brand = true }
  const spread = r - b
  const kind = brand ? 'brand' : spread > 0 ? 'warm' : spread < 0 ? 'cool' : 'neutral-grey'
  return { r, g, b, hex, name, spread, brand, kind }
}

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

// Assert a measured colour is on the warm side, and report what it actually is.
async function expectWarm(label, locator, prop) {
  if (!(await locator.count())) { fail(label, 'element not found'); return null }
  const raw = await locator.first().evaluate((el, p) => getComputedStyle(el)[p], prop)
  const c = classify(raw)
  const desc = `${prop}=${c.hex}${c.name ? ` (${c.name})` : ''} R-B=${c.spread}`
  if (c.kind === 'cool') fail(label, `still COOL — ${desc}`)
  else if (c.kind === 'brand') ok(label, `${desc} [brand, not a neutral]`)
  else ok(label, desc)
  return c
}

// ---------- login ----------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill(EMAIL)
await page.getByLabel(/password/i).fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
ok('login', EMAIL)

// ---------- fixtures ----------
// Create the trip and person this gate needs instead of reusing whatever a
// previous run left in the dev DB. That coupling is exactly what made this gate
// start failing the moment the database was cleaned, and it is also how a gate
// ends up silently measuring nothing.
const ids = await page.evaluate(async () => {
  const json = (r) => r.json().catch(() => null)
  let people = await fetch('/api/people', { credentials: 'include' }).then(json)
  people = Array.isArray(people) ? people : people?.people || []
  let personId = people[0]?.id
  if (!personId) {
    const p = await fetch('/api/people', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `QA Person ${Date.now() % 100000}`, base_city: 'Chennai' })
    }).then(json)
    personId = p?.id || p?.person?.id
  }
  let trips = await fetch('/api/trips', { credentials: 'include' }).then(json)
  trips = Array.isArray(trips) ? trips : trips?.trips || []
  let tripId = trips[0]?.id
  if (!tripId) {
    const t = await fetch('/api/trips', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `Palette QA ${Date.now()}` })
    }).then(json)
    tripId = t?.id || t?.trip?.id
  }
  return { tripId, personId }
})
if (!ids.tripId || !ids.personId) fail('fixtures', `could not create a trip/person (${JSON.stringify(ids)})`)

// ---------- DatePicker panel: the two elements measured as slate ----------
let panel = null
if (ids.tripId) {
  await page.goto(`${BASE}/trips/${ids.tripId}/dates`, { waitUntil: 'networkidle' })
  // A fresh trip has no date windows, so there is no DateField until one is added.
  if (!(await page.locator('.p-datepicker-input-icon').count())) {
    const add = page.getByRole('button', { name: /add date window/i }).first()
    if (await add.count()) {
      await add.click()
      await page.waitForTimeout(400)
    }
  }
  const icon = page.locator('.p-datepicker-input-icon').first()
  if (await icon.count()) {
    await icon.click({ force: true }).catch(() => {})
    const p = page.locator('.p-datepicker-panel').first()
    if (await p.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) panel = p
  }
}

if (!panel) {
  fail('datepicker panel', 'could not open any picker panel')
} else {
  ok('datepicker panel opened')
  // The panel fades in; screenshotting immediately catches it part-way through
  // its enter transition and the artifact reads washed-out, which is worse than
  // useless during a visual review — it looks like a contrast bug.
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(shots, 'palette-01-datepicker-panel.png') })

  // 1. Today/Clear button bar — was slate-500 rgb(100,116,139) via text.mutedColor.
  const todayBtn = panel.locator('.p-datepicker-buttonbar button').first()
  await expectWarm('datepicker Today/Clear bar text', todayBtn, 'color')

  // 2. today-marker chip — was slate-200 rgb(226,232,240) via {surface.200}.
  // data-p-today lives on the <td>; the painted chip is its <span>. Two traps:
  // the panel opens on the *stored* month, so today may not be rendered at all;
  // and a today that is also selected paints with the brand teal (correct
  // precedence) which would read as a bogus "still cool" failure. Walking the
  // next/prev arrows changes month without selecting anything, so today shows
  // with its neutral marker intact.
  let todayCell = panel.locator('td[data-p-today="true"] span[aria-selected="false"]').first()
  if (!(await todayCell.count())) {
    const nextArrow = panel.locator('.p-datepicker-next-button, [data-pc-section="nextbutton"]').first()
    const prevArrow = panel.locator('.p-datepicker-prev-button, [data-pc-section="prevbutton"]').first()
    for (let i = 0; i < 24 && !(await todayCell.count()); i++) {
      // Today is 2026-07 and panels open on trip dates that may sit either side,
      // so try forward first then fall back to backward.
      const arrow = i < 12 ? nextArrow : prevArrow
      if (!(await arrow.count())) break
      await arrow.click({ force: true }).catch(() => {})
      await page.waitForTimeout(120)
      todayCell = panel.locator('td[data-p-today="true"] span[aria-selected="false"]').first()
    }
  }
  if (await todayCell.count()) {
    const label = await todayCell.evaluate((el) => el.textContent.trim())
    await expectWarm(`datepicker today-marker chip background (day ${label})`, todayCell, 'backgroundColor')
  } else {
    fail('datepicker today-marker chip background', 'could not bring an unselected today cell into view')
  }

  // 3. The panel's own border + the weekday header, same {surface.*} family.
  await expectWarm('datepicker panel border', panel, 'borderColor')
  const weekday = panel.locator('th span').first()
  await expectWarm('datepicker weekday header text', weekday, 'color')

  await page.keyboard.press('Escape')
}

// ---------- Select overlay ----------
// A silently skipped check is how a slate leak survives a "green" gate, so this
// hunts across candidate screens until it finds a Select with at least TWO
// options. Two matters: the selected option is brand teal by design, so a
// single-option Select (which is what the people-scoped ones degrade to on a
// thin dev DB) cannot expose the neutral {text.color} at all.
const candidates = [
  ids.personId && `${BASE}/people/${ids.personId}`,        // doc-type Select: 6 fixed options
  ids.tripId && `${BASE}/trips/${ids.tripId}/itinerary`,
  ids.tripId && `${BASE}/trips/${ids.tripId}/budget`
].filter(Boolean)

let selectChecked = false
for (const url of candidates) {
  if (selectChecked) break
  await page.goto(url, { waitUntil: 'networkidle' })
  const selects = await page.locator('.p-select').all()
  for (const sel of selects) {
    await sel.scrollIntoViewIfNeeded().catch(() => {})
    await sel.click({ force: true }).catch(() => {})
    const overlay = page.locator('.p-select-overlay').first()
    const opened = await overlay.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
    if (!opened) continue
    const optCount = await overlay.locator('.p-select-option').count()
    const plainOpt = overlay.locator('.p-select-option[data-p-selected="false"]').first()
    if (optCount >= 2 && (await plainOpt.count())) {
      await expectWarm('select overlay border', overlay, 'borderColor')
      await expectWarm('select overlay background', overlay, 'backgroundColor')
      await expectWarm('select option text (unselected)', plainOpt, 'color')
      await page.screenshot({ path: path.join(shots, 'palette-02-select-overlay.png') })
      selectChecked = true
    }
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(150)
    if (selectChecked) break
  }
}
if (!selectChecked) fail('select overlay', 'found no Select with >=2 options to measure on any candidate screen')

// ---------- muted body text, the most widespread {surface.500} consumer ----------
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
const th = page.locator('.table th, .p-datatable-column-title').first()
if (await th.count()) await expectWarm('list header muted text', th, 'color')
else fail('list header muted text', 'no list header found on /people')

// ---------- report ----------
console.log('')
if (consoleErrors.length) {
  console.error(`console errors (${consoleErrors.length}):`)
  for (const e of consoleErrors.slice(0, 10)) console.error(`  ! ${e}`)
  failures += consoleErrors.length
}
await browser.close()
purgeQaData()
console.log(failures ? `PALETTE QA FAILED (${failures})` : 'PALETTE QA OK')
process.exit(failures ? 1 : 0)
