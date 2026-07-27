// Light-mode contrast gate.
//
// Dark mode got a measured contrast sweep when it was built; light mode never
// did — it was the only scheme that existed, so it was never audited, only
// looked at. Looking is exactly what misses this class of defect: a 3.2:1 badge
// reads as "quiet styling" to the eye and as a WCAG AA failure to a meter.
//
// It also matters that the number be measured rather than reasoned about. The
// hand-computed claim this gate started from — "--app-text-muted is 4.47:1,
// just under AA" — was wrong in the direction that matters: it is 4.80:1 on
// white and passes. The genuine failures were elsewhere entirely.
//
// Same walk as the dark gate, same maths (e2e/contrast-audit.mjs), light scheme.
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-light-contrast.mjs
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'
import { auditSource } from './contrast-audit.mjs'

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
const SHOOT = process.env.QA_SHOTS === '1'

// A near-white page is the point in light mode, so lightSurfaces is off.
const AUDIT_FN = auditSource({ detectLightSurfaces: false })

let failures = 0
const consoleErrors = []
const allFindings = []
function ok(name, extra) { console.log(`ok - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }
function note(s) { console.log(`  · ${s}`) }

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})

// colorScheme 'light' with nothing stored: the default a first-time visitor on a
// light OS gets. Explicitly NOT setting the stored theme, so this measures the
// out-of-the-box scheme rather than one the gate talked the app into.
const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} (${m.location()?.url || 'unknown'})`) })

async function audit(label) {
  await page.waitForTimeout(350)
  const r = await page.evaluate(AUDIT_FN)
  if (SHOOT) {
    await page.screenshot({
      path: path.join(shots, `light-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`),
      fullPage: true
    })
  }
  // If the app went dark the contrast numbers below would be measuring the wrong
  // scheme entirely, and every one of them would be meaningless-but-green.
  if (r.darkClass) { fail(`${label}: stays in light scheme`, 'html.app-dark is set'); return r }
  if (r.pageLum < 0.6) {
    fail(`${label}: page background is light`, `bg=${r.pageBg} luminance=${r.pageLum}`)
  }
  if (r.lowContrast.length) {
    for (const c of r.lowContrast) allFindings.push({ ...c, screen: label })
    fail(`${label}: text meets WCAG AA`,
      r.lowContrast.map((c) => `${c.sel} "${c.text}" ${c.fg} on ${c.bg} = ${c.ratio}:1 (need ${c.need}, ${c.size}px)`).join('\n           '))
  }
  const badNative = (r.nativeParts || []).filter((n) => !n.warm || n.ratio < 4.5)
  if (badNative.length) {
    fail(`${label}: native control chrome matches the palette`,
      badNative.map((n) => `${n.part} ${n.fg} on ${n.bg} = ${n.ratio}:1${n.warm ? '' : ' — not a warm neutral (unstyled OS chrome?)'}`).join(', '))
  }
  if (!r.darkClass && r.pageLum >= 0.6 && !r.lowContrast.length && !badNative.length) {
    ok(label, `bg=${r.pageBg} lum=${r.pageLum}${r.exempt ? `, ${r.exempt} aria-hidden exempt` : ''}${(r.nativeParts || []).length ? `, ${r.nativeParts.length} native part(s) ok` : ''}`)
  }
  return r
}

// login is outside the AppNav shell — its own surface, its own risk.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await audit('login')

await page.getByLabel(/email/i).fill(EMAIL)
await page.getByLabel(/password/i).fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
await audit('trips list')

// Needs a trip and a person to have anything to render; create them via the API.
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
      body: JSON.stringify({ name: `Light QA ${Date.now()}` })
    }).then(json)
    tripId = t?.id || t?.trip?.id
  }
  if (tripId && personId) {
    await fetch(`/api/trips/${tripId}/participants`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ person_id: personId })
    }).catch(() => {})
  }
  return { tripId, personId }
})
if (!ids.tripId) note('could not create a trip — trip sections will be skipped')

const SECTIONS = ['', 'dates', 'destination', 'goals', 'people', 'budget', 'itinerary', 'checklists', 'readiness', 'settings']
if (ids.tripId) {
  for (const s of SECTIONS) {
    await page.goto(`${BASE}/trips/${ids.tripId}${s ? '/' + s : ''}`, { waitUntil: 'networkidle' })
    await audit(`trip ${s || 'overview'}`)
  }
}

await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
await audit('people list')
if (ids.personId) {
  await page.goto(`${BASE}/people/${ids.personId}`, { waitUntil: 'networkidle' })
  await audit('person detail')
}
await page.goto(`${BASE}/trips/new`, { waitUntil: 'networkidle' })
await audit('trip wizard')
await page.goto(`${BASE}/search?q=a`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await audit('search results page')
await page.goto(`${BASE}/this-route-does-not-exist`, { waitUntil: 'networkidle' })
await audit('404')

// ---------- teleported overlays, which render outside the view that styles them ----------
if (ids.tripId) {
  await page.goto(`${BASE}/trips/${ids.tripId}/dates`, { waitUntil: 'networkidle' })
  if (!(await page.locator('.p-datepicker-input-icon').count())) {
    const add = page.getByRole('button', { name: /add date window/i }).first()
    if (await add.count()) {
      await add.click()
      await page.waitForTimeout(400)
    }
  }
  const icon = page.locator('.p-datepicker-input-icon').first()
  if (!(await icon.count())) {
    fail('datepicker panel in light', 'no date field on the Dates view to open')
  } else {
    await icon.click({ force: true })
    if (await page.locator('.p-datepicker-panel').first()
      .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(400)
      await audit('datepicker panel open')
      await page.keyboard.press('Escape')
    } else {
      fail('datepicker panel in light', 'panel did not open')
    }
  }

  await page.goto(`${BASE}/people/${ids.personId}`, { waitUntil: 'networkidle' })
  const sel = page.locator('.p-select').first()
  if (!(await sel.count())) {
    fail('select overlay in light', 'no Select on the person detail view to open')
  } else {
    await sel.click({ force: true })
    if (await page.locator('.p-select-overlay').first()
      .waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(300)
      await audit('select overlay open')
      await page.keyboard.press('Escape')
    } else {
      fail('select overlay in light', 'overlay did not open')
    }
  }
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.keyboard.press('Meta+k')
if (await page.locator('[data-test="search-palette"]')
  .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
  await page.locator('[data-test="search-palette-input"]').fill('a')
  await page.waitForTimeout(700)
  await audit('search palette open')
  await page.keyboard.press('Escape')
} else {
  fail('search palette in light', 'palette did not open on Meta+K')
}

// The participant view is public, has no nav and no theme toggle, and renders at
// phone width — the one screen a logged-in sweep would never reach.
const partCtx = await browser.newContext({
  colorScheme: 'light', viewport: { width: 375, height: 812 }
})
const partPage = await partCtx.newPage()
const token = ids.tripId && ids.personId
  ? await page.evaluate(async ([t, p]) => {
      const r = await fetch(`/api/trips/${t}/participants/${p}/link`, { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => null)
      return j?.link?.token || j?.token || null
    }, [ids.tripId, ids.personId])
  : null
if (token) {
  await partPage.goto(`${BASE}/p/${token}`, { waitUntil: 'networkidle' })
  // audit() closes over the organizer `page`, so this one screen is measured
  // inline against its own context rather than through the helper.
  const r = await partPage.evaluate(AUDIT_FN)
  if (r.lowContrast.length) {
    for (const c of r.lowContrast) allFindings.push({ ...c, screen: 'participant (375px)' })
    fail('participant page (375px): text meets WCAG AA',
      r.lowContrast.map((c) => `${c.sel} "${c.text}" ${c.fg} on ${c.bg} = ${c.ratio}:1 (need ${c.need}, ${c.size}px)`).join('\n           '))
  } else {
    ok('participant page (375px)', `bg=${r.pageBg} lum=${r.pageLum}`)
  }
} else {
  note('no participant link token — participant page skipped')
}
await partCtx.close()

const realErrors = consoleErrors.filter((e) => !/favicon|sourcemap/i.test(e))
if (realErrors.length) {
  note(`console errors: ${realErrors.slice(0, 3).join(' | ')}`)
}

await browser.close()
purgeQaData()

if (allFindings.length) {
  console.log('\n--- distinct low-contrast pairs ---')
  const byPair = new Map()
  for (const f of allFindings) {
    const k = `${f.fg} on ${f.bg}`
    if (!byPair.has(k)) byPair.set(k, { ...f, screens: new Set() })
    byPair.get(k).screens.add(f.screen)
  }
  for (const [k, v] of byPair) {
    console.log(`  ${k} = ${v.ratio}:1 (need ${v.need}, ${v.size}px)  ${v.sel}  [${[...v.screens].slice(0, 4).join(', ')}${v.screens.size > 4 ? ` +${v.screens.size - 4}` : ''}]`)
  }
}

console.log(failures ? `\nLIGHT CONTRAST QA FAILED (${failures})` : '\nLIGHT CONTRAST QA OK')
process.exit(failures ? 1 : 0)
