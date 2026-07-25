// Whole-app navigation and layout gate.
//
// The other gates each drill one surface — contrast, the datepicker, search,
// uploads. None of them answers the broader question "does every page in the
// app actually work", and that gap is exactly where the reuse bugs lived: every
// individual gate was green while trip B's page rendered trip A's budget.
//
// So this walks EVERY route in router.js and, on each one, asserts the four
// things that are cheap to check and expensive to miss:
//
//   1. it renders real content — not blank, not an unintended error/not-found
//   2. no console or page errors
//   3. no horizontal page scroll at 375 / 768 / 1280
//   4. every in-app link it exposes resolves to a real route, not the 404
//
// It also exercises navigation itself rather than only direct loads: the trip
// sections are visited by CLICKING the sidebar, and browser Back/Forward is
// checked, because a param-only client-side change is the case that direct
// `goto` cannot reproduce.
//
// Deliberately NOT claimed by this gate: aesthetics and colour (that is
// qa-light-contrast / qa-dark-mode), and semantic correctness of the data on
// screen. It proves reachability, rendering and layout — not taste.
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-app-walk.mjs
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

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
function ok(name, extra) { console.log(`ok  - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }
function note(s) { console.log(`  · ${s}`) }

// Vite HMR/websocket chatter and favicon noise are not app defects.
const IGNORABLE = /favicon|sourcemap|\[vite\]|websocket|ERR_NETWORK_CHANGED/i

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => consoleErrors.push({ url: page.url(), text: `pageerror: ${e.message}` }))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ url: page.url(), text: m.text() }) })

// Strings that mean the page gave up. Checked against the MAIN region only, so
// a trip legitimately named "Something went wrong" could not trip it.
const BROKEN = [/not found/i, /something went wrong/i, /failed to/i, /undefined/i, /\[object Object\]/i]

async function inspect(label, { expectBroken = false } = {}) {
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const root = document.querySelector('main, .trip-shell, #app') || document.body
    const text = (root.innerText || '').trim()
    return {
      chars: text.length,
      text: text.slice(0, 400),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // A page that rendered only a spinner is not "rendered" for our purposes.
      spinnerOnly: !!document.querySelector('.p-progressspinner') && text.length < 40
    }
  })

  if (r.chars < 25) {
    fail(`${label}: renders content`, `main region has only ${r.chars} chars of text`)
  } else if (r.spinnerOnly) {
    fail(`${label}: renders content`, 'still showing only a spinner after settle')
  }

  const broken = expectBroken ? null : BROKEN.find((re) => re.test(r.text))
  if (broken) fail(`${label}: no error state`, `matched ${broken} in "${r.text.slice(0, 120).replace(/\n/g, ' / ')}"`)

  if (r.overflow > 1) fail(`${label}: no horizontal overflow @1280`, `${r.overflow}px`)

  if (r.chars >= 25 && !r.spinnerOnly && !broken && r.overflow <= 1) ok(label, `${r.chars} chars`)
  return r
}

// ---------- login ----------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await inspect('login')
await page.getByLabel(/email/i).fill(EMAIL)
await page.locator('#password').fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
ok('login submits and lands in the app', page.url())

// ---------- fixtures ----------
const api = (m, u, b) => page.evaluate(async ([m, u, b]) => {
  const r = await fetch(u, { method: m, credentials: 'include', headers: b ? { 'content-type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, body: await r.json().catch(() => null) }
}, [m, u, b])

const trip = (await api('POST', '/api/trips', { name: `Walk QA Trip ${process.pid}` })).body?.trip
const personRes = await api('POST', '/api/people', { name: `QA Person Walk ${process.pid}`, base_city: 'Chennai' })
const personId = personRes.body?.id || personRes.body?.person?.id
if (!trip?.id) { fail('fixtures', 'could not create a trip'); }
if (trip?.id && personId) await api('POST', `/api/trips/${trip.id}/participants`, { person_id: personId })

// ---------- top-level routes ----------
for (const [label, url] of [
  ['trips list', '/'],
  ['trip wizard', '/trips/new'],
  ['people list', '/people'],
  ['search (empty query)', '/search'],
  ['search (with query)', '/search?q=a']
]) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await inspect(label)
}
if (personId) {
  await page.goto(`${BASE}/people/${personId}`, { waitUntil: 'networkidle' })
  await inspect('person detail')
}

// ---------- trip sections, reached by CLICKING the sidebar ----------
// Direct goto remounts everything and would hide exactly the reuse bugs this
// app had; clicking is the path a user takes and the one that reuses the view.
// Matched by href, not by accessible name: these links carry a badge or hint
// span alongside the label, so their accessible name is "People 1" as often as
// "People".
const SECTIONS = ['dates', 'destination', 'goals', 'people', 'budget', 'itinerary', 'checklists', 'readiness', 'settings']
if (trip?.id) {
  await page.goto(`${BASE}/trips/${trip.id}`, { waitUntil: 'networkidle' })
  await inspect('trip overview')
  for (const section of SECTIONS) {
    const link = page.locator(`.trip-nav-item[href$="/${section}"]`).first()
    if (!(await link.count())) { fail(`trip ${section}: sidebar link exists`, 'no such link in the trip nav'); continue }
    await link.click()
    await page.waitForTimeout(500)
    if (!page.url().endsWith(`/${section}`)) {
      fail(`trip ${section}: sidebar link navigates`, `clicking it landed on ${page.url()}`)
      continue
    }
    await inspect(`trip ${section} (via sidebar)`)
  }
}

// ---------- 404 must actually 404 ----------
await page.goto(`${BASE}/this-route-does-not-exist`, { waitUntil: 'networkidle' })
const nf = await inspect('404 page', { expectBroken: true })
if (!/not found/i.test(nf.text)) fail('404 page: says not found', `text was "${nf.text.slice(0, 80)}"`)
else ok('404 page says not found')

// ---------- Back / Forward ----------
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.goBack(); await page.waitForTimeout(700)
const backUrl = page.url()
await page.goForward(); await page.waitForTimeout(700)
const fwdUrl = page.url()
if (backUrl.endsWith('/people') && new URL(fwdUrl).pathname === '/') ok('browser Back/Forward navigate correctly')
else fail('browser Back/Forward', `back landed on ${backUrl}, forward on ${fwdUrl}`)

// ---------- every in-app link resolves ----------
// Collected across the pages already visited, then each one loaded once. A link
// that lands on the 404 view is a dead link regardless of how it got there.
const seen = new Set()
for (const url of ['/', '/people', `/trips/${trip?.id || 'x'}`, '/search?q=a']) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/"]'))
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && !h.startsWith('//')))
  hrefs.forEach((h) => seen.add(h))
}
let dead = 0
for (const href of seen) {
  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  const txt = await page.evaluate(() => (document.querySelector('main, .trip-shell, #app') || document.body).innerText || '')
  if (/not found/i.test(txt)) { dead++; fail('in-app link resolves', `${href} lands on a not-found page`) }
}
if (!dead) ok(`all ${seen.size} in-app links resolve`, [...seen].slice(0, 6).join(' '))

// ---------- responsive: no sideways scroll on a phone or tablet ----------
for (const [w, h, tag] of [[375, 812, 'phone'], [768, 1024, 'tablet']]) {
  await page.setViewportSize({ width: w, height: h })
  const routes = [['trips list', '/'], ['people list', '/people'], ['person detail', personId ? `/people/${personId}` : '/people'], ['search', '/search?q=a']]
  if (trip?.id) for (const s of ['', '/dates', '/people', '/budget', '/itinerary', '/checklists', '/readiness', '/settings']) {
    routes.push([`trip ${s || 'overview'}`, `/trips/${trip.id}${s}`])
  }
  let worst = 0, worstAt = ''
  for (const [label, url] of routes) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (over > worst) { worst = over; worstAt = label }
  }
  if (worst > 1) fail(`no horizontal overflow @${w} (${tag})`, `worst ${worst}px on ${worstAt}`)
  else ok(`no horizontal overflow @${w} (${tag})`, `${routes.length} routes`)
}
await page.setViewportSize({ width: 1280, height: 900 })

// ---------- participant page: public, bare, phone-sized ----------
if (trip?.id && personId) {
  // The route replies { token, url } at the top level. This gate previously read
  // body.link.token, got undefined, and quietly skipped the whole public page —
  // a skip is indistinguishable from a pass in the log, so it fails now instead.
  const linkRes = await api('POST', `/api/trips/${trip.id}/participants/${personId}/link`)
  const token = linkRes.body?.token || linkRes.body?.link?.token
  if (!token) {
    fail('participant page reachable', `could not mint a share link (status ${linkRes.status}, body ${JSON.stringify(linkRes.body).slice(0, 120)})`)
  } else {
    const pctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const ppage = await pctx.newPage()
    await ppage.goto(`${BASE}/p/${token}`, { waitUntil: 'networkidle' })
    await ppage.waitForTimeout(500)
    const pr = await ppage.evaluate(() => ({
      chars: ((document.querySelector('main, #app') || document.body).innerText || '').trim().length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))
    if (pr.chars < 25) fail('participant page renders', `${pr.chars} chars`)
    else if (pr.overflow > 1) fail('participant page @375 no overflow', `${pr.overflow}px`)
    else ok('participant page (public, 375px)', `${pr.chars} chars`)
    await pctx.close()
  }
} else {
  fail('participant page reachable', 'no trip or person fixture — the public page went unchecked')
}

// ---------- console cleanliness across the whole walk ----------
const real = consoleErrors.filter((e) => !IGNORABLE.test(e.text))
if (real.length) {
  fail('no console errors across the walk', `${real.length}:\n           ` +
    real.slice(0, 6).map((e) => `${e.text.slice(0, 100)}  @ ${e.url.replace(BASE, '')}`).join('\n           '))
} else {
  ok('no console errors across the walk')
}

await browser.close()
purgeQaData()

console.log(failures ? `\nAPP WALK FAILED (${failures})` : '\nAPP WALK OK')
process.exit(failures ? 1 : 0)
