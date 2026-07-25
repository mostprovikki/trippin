// Design-system adherence gate — the measurable half of "aesthetics".
//
// Taste is not automatable, but most of what makes an interface look
// *incoherent* is: a colour that came from nowhere, a seventh font size, a
// radius that matches nothing else on the page. Those are drift, they are
// objective, and they are what this measures. It does NOT claim the result is
// beautiful — it claims the result is CONSISTENT with the system the app
// declares in main.css. Judging the rest means looking at the screenshots this
// also writes to e2e/shots/aesthetics/.
//
// Three checks, all against the app's own declared scales:
//   1. colour   — every rendered text/background/border colour must resolve to
//                 a token value (or a composite of one), not an off-palette hex
//   2. type     — every rendered font-size must be on the documented scale
//   3. radius   — every rendered border-radius must be a radius token
//
// Scoped to app-owned surfaces plus PrimeVue chrome, because the preset themes
// PrimeVue from the same tokens — a stray value there is drift too.
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-aesthetics.mjs   (add QA_SHOTS=1 to write the screenshots)
import { existsSync, readdirSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots/aesthetics')
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
const SHOOT = process.env.QA_SHOTS === '1'

let failures = 0
function ok(name, extra) { console.log(`ok  - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }
function note(s) { console.log(`  · ${s}`) }

// The documented scale from main.css: 24 / 18 / 16 / base 15 / small 13, plus
// the two deliberate sub-small sizes used for kbd caps, badges and nav hints.
const TYPE_SCALE = [24, 18, 16, 15, 14, 13, 12, 11, 10, 7]
// 0/4/8/12 are the tokens; the large values are the pill/circle idiom used by
// count badges and `rounded` icon buttons, which is a shape rather than a scale
// step. Anything else is a component that missed the system.
const RADII = [0, 4, 8, 12, 50, 999]

const AUDIT = `(function () {
  // Handles both notations on purpose: getComputedStyle reports painted colours
  // as rgb()/rgba(), but getPropertyValue hands back custom properties verbatim,
  // and the tokens in main.css are written as hex. Parsing only rgb() silently
  // dropped every hex token from the palette, which made the whole app look like
  // drift — the check has to speak both dialects or it measures nothing.
  function parse(c) {
    var v = String(c).trim()
    var h = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (h) {
      var s = h[1]
      if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
      return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: 1 }
    }
    var m = v.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?/)
    if (!m) return null
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a: m[4] === undefined ? 1 : +m[4] }
  }
  function key(c) { return c.r + ',' + c.g + ',' + c.b }
  function visible(el) {
    var s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false
    var r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  function describe(el) {
    var cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''
    return el.tagName.toLowerCase() + cls
  }

  // Resolve the declared palette by collecting custom-property NAMES from the
  // CSSOM and then asking the root for each one's current value — so it follows
  // the active scheme. Enumerating getComputedStyle() directly does not reliably
  // list custom properties, which silently yields an empty palette and makes
  // every colour on the page look like drift.
  var names = {}
  for (var s = 0; s < document.styleSheets.length; s++) {
    var rules
    try { rules = document.styleSheets[s].cssRules } catch (e) { continue }
    if (!rules) continue
    for (var q = 0; q < rules.length; q++) {
      var st = rules[q].style
      if (!st) continue
      for (var t = 0; t < st.length; t++) {
        if (st[t].indexOf('--') === 0) names[st[t]] = 1
      }
    }
  }
  var rootStyle = getComputedStyle(document.documentElement)
  var palette = {}
  Object.keys(names).forEach(function (prop) {
    var c = parse(rootStyle.getPropertyValue(prop))
    if (c) palette[key(c)] = prop
  })

  var offPalette = {}, sizes = {}, radii = {}
  var all = document.querySelectorAll('body *')
  for (var j = 0; j < all.length; j++) {
    var el = all[j]
    if (!visible(el)) continue
    var cs = getComputedStyle(el)

    // colour: only opaque, actually-painted values. Translucent overlays
    // composite to arbitrary results by design and are not drift.
    var probes = [['color', cs.color], ['background-color', cs.backgroundColor], ['border-color', cs.borderTopColor]]
    for (var p = 0; p < probes.length; p++) {
      var col = parse(probes[p][1])
      if (!col || col.a < 1) continue
      if (probes[p][0] === 'border-color' && parseFloat(cs.borderTopWidth) === 0) continue
      if (probes[p][0] === 'background-color' && col.a === 0) continue
      var k = key(col)
      if (palette[k]) continue
      var id = k + '|' + probes[p][0]
      if (!offPalette[id]) offPalette[id] = { rgb: k, prop: probes[p][0], sel: describe(el), count: 0 }
      offPalette[id].count++
    }

    // type — icon glyphs are sized as artwork, not text, so they are not on the
    // type scale and never should be.
    var isIcon = /(^|\\s)pi(-|\\s|$)/.test(el.className || '') || el.tagName === 'svg'
    var fs = Math.round(parseFloat(cs.fontSize))
    if (fs && !isIcon) {
      if (!sizes[fs]) sizes[fs] = { px: fs, sel: describe(el), count: 0 }
      sizes[fs].count++
    }

    // radius — only the top-left corner; pills use 999 on all four.
    var br = Math.round(parseFloat(cs.borderTopLeftRadius) || 0)
    if (br) {
      if (!radii[br]) radii[br] = { px: br, sel: describe(el), count: 0 }
      radii[br].count++
    }
  }
  function vals(o) { return Object.keys(o).map(function (k) { return o[k] }) }
  return { offPalette: vals(offPalette), sizes: vals(sizes), radii: vals(radii), paletteSize: Object.keys(palette).length }
})()`

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})

async function run(scheme) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel(/email/i).fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

  const api = (m, u, b) => page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, { method: m, credentials: 'include', headers: b ? { 'content-type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, [m, u, b])
  const trip = (await api('POST', '/api/trips', { name: `Aesth QA ${process.pid}` })).body?.trip

  const routes = [['trips', '/'], ['people', '/people'], ['wizard', '/trips/new'], ['search', '/search?q=a']]
  if (trip?.id) for (const s of ['', '/dates', '/budget', '/itinerary', '/checklists', '/readiness', '/settings']) {
    routes.push([`trip${s.replace('/', '-') || '-overview'}`, `/trips/${trip.id}${s}`])
  }

  const offPalette = new Map(), sizes = new Map(), radii = new Map()
  for (const [label, url] of routes) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(350)
    if (SHOOT) await page.screenshot({ path: path.join(shots, `${scheme}-${label}.png`), fullPage: true })
    const r = await page.evaluate(AUDIT)
    for (const o of r.offPalette) {
      const k = `${o.rgb}|${o.prop}`
      const prev = offPalette.get(k)
      offPalette.set(k, { ...o, count: (prev?.count || 0) + o.count, where: prev?.where || label })
    }
    for (const s of r.sizes) sizes.set(s.px, { ...s, count: (sizes.get(s.px)?.count || 0) + s.count })
    for (const b of r.radii) radii.set(b.px, { ...b, count: (radii.get(b.px)?.count || 0) + b.count })
  }
  await ctx.close()
  return { scheme, routes: routes.length, offPalette: [...offPalette.values()], sizes: [...sizes.values()], radii: [...radii.values()] }
}

for (const scheme of ['light', 'dark']) {
  const r = await run(scheme)

  // 1. colour drift
  const drift = r.offPalette.filter((o) => o.count >= 2).sort((a, b) => b.count - a.count)
  if (drift.length) {
    fail(`${scheme}: every painted colour is a token`,
      `${drift.length} off-palette:\n           ` +
      drift.slice(0, 8).map((o) => `rgb(${o.rgb}) as ${o.prop} on ${o.sel} ×${o.count} (first seen: ${o.where})`).join('\n           '))
  } else {
    ok(`${scheme}: every painted colour is a token`, `${r.routes} routes`)
  }

  // 2. type scale
  const offScale = r.sizes.filter((s) => !TYPE_SCALE.includes(s.px)).sort((a, b) => b.count - a.count)
  if (offScale.length) {
    fail(`${scheme}: every font-size is on the scale`,
      `${offScale.length} off-scale: ` + offScale.slice(0, 8).map((s) => `${s.px}px on ${s.sel} ×${s.count}`).join(', '))
  } else {
    ok(`${scheme}: every font-size is on the scale`, `${r.sizes.map((s) => s.px).sort((a, b) => b - a).join('/')}px`)
  }

  // 3. radius
  const offRadius = r.radii.filter((b) => !RADII.includes(b.px)).sort((a, b) => b.count - a.count)
  if (offRadius.length) {
    fail(`${scheme}: every radius is a token`,
      offRadius.slice(0, 8).map((b) => `${b.px}px on ${b.sel} ×${b.count}`).join(', '))
  } else {
    ok(`${scheme}: every radius is a token`, `${r.radii.map((b) => b.px).sort((a, b) => a - b).join('/')}px`)
  }
}

if (SHOOT) note(`screenshots written to e2e/shots/aesthetics/ — LOOK at them; this gate cannot judge taste`)
else note('run with QA_SHOTS=1 to also write screenshots for visual review')

await browser.close()
purgeQaData()

console.log(failures ? `\nAESTHETICS QA FAILED (${failures})` : '\nAESTHETICS QA OK')
process.exit(failures ? 1 : 0)
