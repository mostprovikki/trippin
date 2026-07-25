// Dark-mode gate.
//
// darkModeSelector was 'none', so dark mode was switched off outright and every
// screen had only ever been seen in light. Turning it on is the easy half; the
// half that actually matters is proving no screen has an untokenized light
// surface stranded in it and that text stays legible. So this measures rather
// than eyeballs:
//
//   1. every screen renders with a genuinely dark page background
//   2. no visible element keeps a near-white background (an untokenized leak)
//   3. text meets WCAG AA contrast against its EFFECTIVE background — resolved
//      by walking ancestors, because most elements are transparent
//   4. the choice persists across a reload, and lands before first paint
//      (no light flash), and the toggle round-trips
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-dark-mode.mjs
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

const BASE = process.env.BASE_URL || 'http://[::1]:5173'
const EMAIL = process.env.QA_EMAIL || 'demo@example.com'
const PASSWORD = process.env.QA_PASSWORD || 'demo-pass-123'

let failures = 0
const consoleErrors = []
function ok(name, extra) { console.log(`ok - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }
function note(s) { console.log(`  · ${s}`) }

// The audit itself is shared with the light-mode gate (e2e/contrast-audit.mjs) —
// two copies of contrast maths that must agree is how they stop agreeing.
// detectLightSurfaces is on here: a near-white surface is a leak only in dark.
const AUDIT_FN = auditSource({ detectLightSurfaces: true })

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})

// ---------- 1. dark must be reachable before first paint, from the OS alone ----------
// colorScheme: 'dark' makes prefers-color-scheme match, with NOTHING in storage:
// the default has to honour the OS, and the inline script in index.html has to
// apply it before Vue boots or dark-mode users get a white flash.
const osDark = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
const first = await osDark.newPage()
await first.goto(`${BASE}/login`, { waitUntil: 'commit' })
const preHydration = await first.evaluate(
  () => ({
    dark: document.documentElement.classList.contains('app-dark'),
    scheme: document.documentElement.style.colorScheme,
    appEmpty: !document.getElementById('app') || document.getElementById('app').children.length === 0
  })
)
if (preHydration.dark) {
  ok('OS dark preference applies before Vue mounts',
    `class set, colorScheme=${preHydration.scheme}, #app still empty=${preHydration.appEmpty}`)
} else {
  fail('OS dark preference applies before Vue mounts', 'html.app-dark was not set at document commit')
}
await osDark.close()

// ---------- 2. walk every screen in dark ----------
const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} (${m.location()?.url || 'unknown'})`) })

async function audit(label, { screenshot = true } = {}) {
  await page.waitForTimeout(350)
  const r = await page.evaluate(AUDIT_FN)
  if (screenshot) {
    await page.screenshot({
      path: path.join(shots, `dark-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`),
      fullPage: true
    })
  }
  if (!r.darkClass) { fail(`${label}: dark class present`, 'html.app-dark missing'); return r }
  if (r.pageLum > 0.2) {
    fail(`${label}: page background is dark`, `bg=${r.pageBg} luminance=${r.pageLum}`)
  }
  if (r.lightSurfaces.length) {
    fail(`${label}: no stranded light surfaces`,
      r.lightSurfaces.map((s) => `${s.sel} bg=${s.bg}`).join(', '))
  }
  if (r.lowContrast.length) {
    fail(`${label}: text meets WCAG AA`,
      r.lowContrast.map((c) => `${c.sel} "${c.text}" ${c.fg} on ${c.bg} = ${c.ratio}:1 (need ${c.need})`).join('\n           '))
  }
  const badNative = (r.nativeParts || []).filter((n) => !n.warm || n.ratio < 4.5)
  if (badNative.length) {
    fail(`${label}: native control chrome matches the palette`,
      badNative.map((n) => `${n.part} ${n.fg} on ${n.bg} = ${n.ratio}:1${n.warm ? '' : ' — not a warm neutral (unstyled OS chrome?)'}`).join(', '))
  }
  if (r.darkClass && r.pageLum <= 0.2 && !r.lightSurfaces.length && !r.lowContrast.length && !badNative.length) {
    ok(label, `bg=${r.pageBg} lum=${r.pageLum}${r.exempt ? `, ${r.exempt} aria-hidden exempt` : ''}${(r.nativeParts || []).length ? `, ${r.nativeParts.length} native part(s) ok` : ''}`)
  }
  return r
}

// login is outside the AppNav shell and has no toggle — it must still be dark.
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
      body: JSON.stringify({ name: `Dark QA ${Date.now()}` })
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
// Global Search is new, so both of its surfaces need the same scrutiny as the
// rest: the results page, and the teleported palette overlay.
await page.goto(`${BASE}/search?q=a`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await audit('search results page')
await page.goto(`${BASE}/this-route-does-not-exist`, { waitUntil: 'networkidle' })
await audit('404')

// ---------- 3. overlays, which are teleported and easy to miss ----------
// Panels are rendered into <body>, outside the view that styles everything else,
// so they are exactly where a dark-mode miss hides. A fresh trip has no date
// windows and therefore no DateField at all, so the window has to be added
// first — otherwise this section silently skips and the overlay goes unchecked,
// which is indistinguishable from a pass.
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
    fail('datepicker panel in dark', 'no date field on the Dates view to open')
  } else {
    await icon.click({ force: true })
    if (await page.locator('.p-datepicker-panel').first()
      .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(400)
      await audit('datepicker panel open')
      await page.keyboard.press('Escape')
    } else {
      fail('datepicker panel in dark', 'panel did not open')
    }
  }

  // A Select overlay too — same teleport, different component. Person detail is
  // the reliable home for one: the document-type Select has six fixed options
  // and needs no pre-existing rows, unlike the itinerary's per-item selects.
  await page.goto(`${BASE}/people/${ids.personId}`, { waitUntil: 'networkidle' })
  const sel = page.locator('.p-select').first()
  if (!(await sel.count())) {
    fail('select overlay in dark', 'no Select on the person detail view to open')
  } else {
    await sel.click({ force: true })
    if (await page.locator('.p-select-overlay').first()
      .waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(300)
      await audit('select overlay open')
      await page.keyboard.press('Escape')
    } else {
      fail('select overlay in dark', 'overlay did not open')
    }
  }
}

// ---------- 3b. the search palette, another teleported overlay ----------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.keyboard.press('Meta+k')
if (await page.locator('[data-test="search-palette"]')
  .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
  await page.locator('[data-test="search-palette-input"]').fill('a')
  await page.waitForTimeout(700)
  await audit('search palette open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
} else {
  fail('search palette in dark', 'palette did not open on Meta+K')
}

// ---------- 4. the toggle, and persistence ----------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const toggle = page.locator('[data-test="theme-toggle"]')
if (!(await toggle.count())) {
  fail('theme toggle present', 'no [data-test="theme-toggle"] in the nav')
} else {
  await toggle.click()
  await page.waitForTimeout(300)
  const afterToggle = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('app-dark'),
    stored: localStorage.getItem('tripper:theme'),
    scheme: document.documentElement.style.colorScheme
  }))
  if (!afterToggle.dark && afterToggle.stored === 'light') {
    ok('toggle switches to light and records the choice', `stored=${afterToggle.stored} colorScheme=${afterToggle.scheme}`)
  } else {
    fail('toggle switches to light and records the choice', JSON.stringify(afterToggle))
  }

  // An explicit light choice must beat the OS dark preference across a reload.
  await page.reload({ waitUntil: 'networkidle' })
  const afterReload = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('app-dark'),
    stored: localStorage.getItem('tripper:theme')
  }))
  if (!afterReload.dark && afterReload.stored === 'light') {
    ok('explicit light survives a reload despite OS dark')
  } else {
    fail('explicit light survives a reload despite OS dark', JSON.stringify(afterReload))
  }
  await page.screenshot({ path: path.join(shots, 'dark-toggled-back-to-light.png'), fullPage: true })

  // And back to dark.
  await toggle.click()
  await page.waitForTimeout(300)
  const backToDark = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('app-dark'),
    stored: localStorage.getItem('tripper:theme')
  }))
  if (backToDark.dark && backToDark.stored === 'dark') ok('toggle returns to dark')
  else fail('toggle returns to dark', JSON.stringify(backToDark))
}

// ---------- 5. the participant page, which has no nav and no toggle ----------
if (ids.tripId && ids.personId) {
  await page.goto(`${BASE}/trips/${ids.tripId}/people`, { waitUntil: 'networkidle' })
  let participantUrl = null
  const createLink = page.getByRole('button', { name: /create link/i }).first()
  if (await createLink.count()) {
    await createLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(700)
    participantUrl = (await page.locator('.link-reveal code').first().textContent().catch(() => null))?.trim() || null
  }
  if (!participantUrl) {
    note('could not mint a participant link — participant page NOT audited in dark')
  } else {
    const token = participantUrl.split('/p/').pop()
    const mobile = await ctx.newPage()
    await mobile.setViewportSize({ width: 375, height: 812 })
    const saved = page
    // Audit runs against `page`, so borrow the variable for this section.
    await mobile.goto(`${BASE}/p/${token}`, { waitUntil: 'networkidle' })
    const r = await mobile.evaluate(AUDIT_FN)
    await mobile.screenshot({ path: path.join(shots, 'dark-participant-mobile.png'), fullPage: true })
    if (!r.darkClass) fail('participant page: dark class present', 'html.app-dark missing')
    else if (r.pageLum > 0.2) fail('participant page: dark background', `bg=${r.pageBg} lum=${r.pageLum}`)
    else if (r.lightSurfaces.length) {
      fail('participant page: no stranded light surfaces', r.lightSurfaces.map((s) => `${s.sel} bg=${s.bg}`).join(', '))
    } else if (r.lowContrast.length) {
      fail('participant page: text meets WCAG AA',
        r.lowContrast.map((c) => `${c.sel} "${c.text}" ${c.fg} on ${c.bg} = ${c.ratio}:1 (need ${c.need})`).join('\n           '))
    } else if ((r.nativeParts || []).filter((n) => !n.warm || n.ratio < 4.5).length) {
      fail('participant page: native control chrome matches the palette',
        r.nativeParts.filter((n) => !n.warm || n.ratio < 4.5)
          .map((n) => `${n.part} ${n.fg} on ${n.bg} = ${n.ratio}:1${n.warm ? '' : ' — not a warm neutral'}`).join(', '))
    } else {
      ok('participant page (375px, no toggle available)',
        `bg=${r.pageBg} lum=${r.pageLum}${(r.nativeParts || []).length ? `, ${r.nativeParts.length} native part(s) ok` : ''}`)
    }
    await mobile.close()
    void saved
  }
}

// ---------- report ----------
console.log('')
if (consoleErrors.length) {
  const real = consoleErrors.filter((e) => !/favicon|sourcemap|\/archive/i.test(e))
  if (real.length) {
    console.error(`console errors (${real.length}):`)
    for (const e of real.slice(0, 10)) console.error(`  ! ${e}`)
    failures += real.length
  }
}
await browser.close()
purgeQaData()
console.log(failures ? `DARK MODE QA FAILED (${failures})` : 'DARK MODE QA OK')
process.exit(failures ? 1 : 0)
