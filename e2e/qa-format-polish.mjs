// Verify: formatted budget totals (overview stat, budget table footer, total
// line), humanized dietary enum, and expired-vs-warning pill severities.
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

function findExecutable() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort()
    for (const d of dirs.reverse()) {
      const exe = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
      if (existsSync(exe)) return exe
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
// Resolved at runtime (below) rather than hardcoded: the flagship trip's id
// is only stable within one seeded DB — e2e/seed-demo.mjs mints a fresh one
// whenever the flagship (matched by name) doesn't already exist at a
// previously-recorded id, so a literal UUID here goes stale on any reseed.
let TRIP = process.env.QA_TRIP_ID || ''
let failures = 0
const ok = (n, x = '') => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill('demo@tripper.dev')
await page.locator('#password').fill('tripper1234')
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

if (!TRIP) {
  const trips = await page.evaluate(() => fetch('/api/trips').then((r) => r.json()).then((j) => j.trips))
  const confirmed = trips.filter((t) => t.status === 'confirmed')
  if (confirmed.length !== 1) {
    console.error(`FAIL - could not resolve flagship trip: ${confirmed.length} confirmed trip(s) found (${confirmed.map((t) => t.name).join(', ')}); set QA_TRIP_ID to disambiguate`)
    process.exit(1)
  }
  TRIP = confirmed[0].id
  console.log(`(resolved flagship trip: ${confirmed[0].name} / ${TRIP})`)
}

// 1. Overview stat tile shows a separated number, not the raw digits.
await page.goto(`${BASE}/trips/${TRIP}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const stat = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.stat-card')]
  const c = cards.find((x) => x.textContent.includes('Budget'))
  return c ? c.querySelector('.stat-value')?.textContent.trim() : null
})
// formatMoney (fdb1fe9) now prefixes the currency symbol on every money
// surface, this stat tile included — was a bare "970,300", is "₹970,300".
if (stat === '₹970,300') ok('overview budget stat formatted', stat)
else fail('overview budget stat', `got ${JSON.stringify(stat)}, want "₹970,300"`)

// 2. Budget page: table footer total and the Total line both formatted.
await page.goto(`${BASE}/trips/${TRIP}/budget`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const bud = await page.evaluate(() => {
  const text = document.body.innerText
  return { footer: /970,300/.test(text), raw: /970300/.test(text) }
})
if (bud.footer && !bud.raw) ok('budget page totals formatted', '970,300 present, raw 970300 absent')
else fail('budget page totals', JSON.stringify(bud))

// 3. People list: dietary humanized; raw enum gone.
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const diet = await page.evaluate(() => {
  const text = document.body.innerText
  return { raw: /non_veg/.test(text), human: /Non-veg/.test(text), veg: /\bVeg(etarian|an)?\b/.test(text) }
})
if (!diet.raw && diet.human) ok('dietary humanized', 'Non-veg shown, non_veg gone')
else fail('dietary', JSON.stringify(diet))

// 4. Doc expiry on the Overview's Who's missing what (tripper.md §2, §6
// "Missing"; trip-planner-5p9 — restores what the Readiness view showed before
// 0xv.4 cut it). Expired-by-trip-end pill is danger-red, within-6-months pill
// stays amber. Both arms must be present: the flagship seeds Priya's passport
// 2026-06-30 (expired by the 2026-11-15 end) and Priya's visa / Ravi's passport
// inside the 6-month horizon — a missing arm fails rather than passes vacuously.
await page.goto(`${BASE}/trips/${TRIP}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const pills = await page.evaluate(() => {
  const tags = [...document.querySelectorAll('[data-doc-level]')]
  const read = (t) => {
    const cs = getComputedStyle(t)
    return { text: t.textContent.trim(), bg: cs.backgroundColor, color: cs.color }
  }
  return {
    expired: tags.filter((t) => t.dataset.docLevel === 'expired').map(read),
    warning: tags.filter((t) => t.dataset.docLevel === 'warning').map(read)
  }
})
// Classify by hue, not by channel ordering: PrimeVue's warn text
// (rgb(194, 65, 12), hue ~18°) passed the old "red > green + 30" test, so an
// expired pill rendered amber went green (caught 2026-10-01 by breaking it on
// purpose). Red = hue within 10° of 0; amber/orange = 15°–50°.
const hue = (s) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s)
  if (!m) return null
  const [r, g, b] = m.slice(1, 4).map((x) => Number(x) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.15) return null // greyish: no meaningful hue
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}
const redish = (s) => { const h = hue(s); return h != null && (h <= 10 || h >= 350) }
const amberish = (s) => { const h = hue(s); return h != null && h >= 15 && h <= 50 }
if (!pills.expired.length) fail('expired pill present', "no expired pill on the Overview's Who's missing what (trip-planner-5p9)")
else if (pills.expired.every((p) => redish(p.color) || redish(p.bg))) ok('expired pills are red', pills.expired.map((p) => `${p.text} ${p.color}`).join('; '))
else fail('expired pill colour', JSON.stringify(pills.expired))
if (!pills.warning.length) fail('warning pill present', 'no warning pill found — other arm vacuous')
else if (pills.warning.every((p) => amberish(p.color) || amberish(p.bg))) ok('warning pills stay amber', pills.warning.map((p) => `${p.text} ${p.color}`).join('; '))
else fail('warning pill colour', JSON.stringify(pills.warning))

if (errors.length) fail('console errors', errors.join(' | '))
else ok('no console errors')

await browser.close()
console.log(failures ? `POLISH CHECK FAILED (${failures})` : 'POLISH CHECK OK')
process.exit(failures ? 1 : 0)
