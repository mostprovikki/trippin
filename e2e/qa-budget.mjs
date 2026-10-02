// Budget gate (trip-planner-sog; tripper.md §4 phone reach for job 3, §5 D8, §6).
// Read-only: measures the flagship (confirmed) and idea trips' Budget tab, writes nothing.
//   - per-person card comes first and its number is on the first screen at 390
//   - at 390: Basis reads at card width, not a ~60px column; override inputs usable;
//     no horizontal overflow
//   - at rest: no filled button (Save overrides shows only when dirty)
//   - idea trip (all-zero budget): "No estimate yet", no ₹0 rows
// Run: node e2e/qa-budget.mjs
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
let failures = 0
const ok = (n, x = '') => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }
const check = (n, cond, d) => (cond ? ok(n, d) : fail(n, d))

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })

const measure = () => {
  const main = document.querySelector('.trip-main') || document.body
  const r = (el) => el.getBoundingClientRect()
  const cards = [...main.querySelectorAll('.card')].filter((c) => c.querySelector('h2'))
  const head = (c) => c.querySelector('h2').textContent.trim()
  const per = cards.find((c) => head(c) === 'Per person')
  const cat = cards.find((c) => head(c) === 'Category estimates')
  const basis = cat ? [...cat.querySelectorAll('.budget-basis-text')].filter((e) => e.textContent.trim()) : []
  const catW = cat ? cat.clientWidth : 0
  const ov = per ? [...per.querySelectorAll('.override-row:not(.override-add)')] : []
  return {
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    order: cards.map(head),
    perHeroBottom: per?.querySelector('.budget-hero') ? r(per.querySelector('.budget-hero')).bottom : null,
    perText: per?.innerText.replace(/\s+/g, ' ') ?? '',
    catText: cat?.innerText.replace(/\s+/g, ' ') ?? '',
    tableRows: cat ? cat.querySelectorAll('.p-datatable-tbody > tr').length : 0,
    zeroRows: cat ? [...cat.querySelectorAll('.p-datatable-tbody > tr')].filter((tr) => /₹0(?!\d)/.test(tr.innerText)).length : 0,
    minBasisW: basis.length ? Math.min(...basis.map((e) => r(e).width)) : null,
    catW,
    overrides: ov.map((row) => ({
      amountW: r(row.querySelector('.override-amount input') || row.querySelector('.override-amount')).width,
      noteW: r(row.querySelector('.override-note')).width
    })),
    filled: [...main.querySelectorAll('button.p-button')]
      .filter((b) => b.offsetParent && !/p-button-(outlined|text|secondary)/.test(b.className))
      .map((b) => b.textContent.trim())
  }
}

let trips = null
for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel(/email/i).fill('demo@tripper.dev')
  await page.locator('#password').fill('tripper1234')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
  if (!trips) trips = await page.evaluate(() => fetch('/api/trips').then((r) => r.json()).then((j) => j.trips))
  const flagship = trips.filter((t) => t.status === 'confirmed')
  const idea = trips.filter((t) => t.status === 'idea')
  if (flagship.length !== 1 || idea.length !== 1) { fail('resolve trips', `${flagship.length} confirmed, ${idea.length} idea`); break }
  const w = `${width}px`

  await page.goto(`${BASE}/trips/${flagship[0].id}/budget`, { waitUntil: 'networkidle' })
  await page.locator('[data-test="per-person"]').waitFor({ timeout: 10000 }).catch(() => {})
  const m = await page.evaluate(measure)
  if (width === 390 && m.clientWidth > 400) { fail(`${w}: viewport is 390`, `clientWidth ${m.clientWidth}`); await ctx.close(); continue }
  check(`${w}: Per person card comes before Category estimates`, m.order.indexOf('Per person') === 0 && m.order.includes('Category estimates'), JSON.stringify(m.order))
  check(`${w}: per-person line uses the Overview wording`, /₹[\d,]+/.test(m.perText) && /each of \d+ (person|people) · \d+ set their own amount/.test(m.perText), m.perText.slice(0, 90))
  check(`${w}: no filled button at rest (Save overrides only when dirty)`, !m.filled.length, JSON.stringify(m.filled))
  check(`${w}: flagship has overrides + basis to measure`, m.overrides.length >= 1 && m.minBasisW != null, `${m.overrides.length} overrides`)
  if (width === 390) {
    check(`${w}: no horizontal overflow`, m.scrollWidth <= m.clientWidth, `scroll ${m.scrollWidth} / client ${m.clientWidth}`)
    check(`${w}: per-person number on the first screen`, m.perHeroBottom != null && m.perHeroBottom <= m.innerHeight, `bottom ${Math.round(m.perHeroBottom)} / ${m.innerHeight}`)
    check(`${w}: Basis reads at card width (≥ 80%)`, m.minBasisW >= 0.8 * (m.catW - 48), `min ${Math.round(m.minBasisW)}px of ${m.catW}px card`)
    const narrow = m.overrides.filter((o) => o.amountW < 96 || o.noteW < 140)
    check(`${w}: override amount ≥ 96px and note ≥ 140px`, !narrow.length, JSON.stringify(m.overrides.map((o) => [Math.round(o.amountW), Math.round(o.noteW)])))
  }

  // dirty arm: editing a note brings Save overrides back (then leave without saving)
  const note = page.locator('[data-test="per-person"] .override-row:not(.override-add) .override-note').first()
  if (await note.count()) {
    await note.fill(`${await note.inputValue()} `)
    const shown = await page.getByRole('button', { name: 'Save overrides' }).isVisible()
    check(`${w}: Save overrides appears once an override changed`, shown)
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tripper:draft:')).forEach((k) => localStorage.removeItem(k)))
  }

  await page.goto(`${BASE}/trips/${idea[0].id}/budget`, { waitUntil: 'networkidle' }).catch(() => {})
  // leaving the dirty flagship page may raise the discard confirm; accept it
  const discard = page.getByRole('button', { name: /discard|leave/i })
  if (await discard.count()) { await discard.first().click(); await page.waitForLoadState('networkidle') }
  await page.goto(`${BASE}/trips/${idea[0].id}/budget`, { waitUntil: 'networkidle' })
  await page.locator('[data-test="per-person"]').waitFor({ timeout: 10000 }).catch(() => {})
  const e = await page.evaluate(measure)
  check(`${w}: idea trip says "No estimate yet" in both cards`, /No estimate yet/.test(e.perText) && /No estimate yet/.test(e.catText), `${e.perText.slice(0, 40)} | ${e.catText.slice(0, 60)}`)
  check(`${w}: idea trip shows no ₹0 rows`, e.tableRows === 0 && e.zeroRows === 0, `${e.tableRows} rows, ${e.zeroRows} ₹0`)

  check(`${w}: no console errors`, !errors.length, errors.join(' | '))
  await ctx.close()
}
await browser.close()
console.log(failures ? `BUDGET CHECK FAILED (${failures})` : 'BUDGET CHECK OK')
process.exit(failures ? 1 : 0)
