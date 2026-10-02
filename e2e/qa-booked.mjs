// Booked vs estimated gate (trip-planner-ztt; tripper.md §2 Budget card mockup, §6 one wording).
// Writes a throwaway "Booked QA <stamp>" trip (purged at the end):
//   - API seeds Stay ₹12,000 booked + Food ₹6,000 → Budget tab tags Stay "booked" and shows
//     "₹12,000 booked · ₹6,000 estimated" under the per-person number; the Overview card says the same
//   - Edit budget → untick Stay's Booked → Save: the split line goes away on both
// Run: node e2e/qa-booked.mjs
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
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
const SPLIT = '₹12,000 booked · ₹6,000 estimated'
let failures = 0
const ok = (n, x = '') => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }
const check = (n, cond, d) => (cond ? ok(n, d) : fail(n, d))

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel(/email/i).fill('demo@tripper.dev')
  await page.locator('#password').fill('tripper1234')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

  const api = (method, url, body) => page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, [method, url, body])
  const trip = (await api('POST', '/api/trips', { name: `Booked QA ${Date.now()}` })).body?.trip
  if (!trip) throw new Error('could not create the QA trip')
  const put = await api('PUT', `/api/trips/${trip.id}/budget`, { lines: [{ category: 'stay', estimate: 12000, booked: true }, { category: 'food', estimate: 6000 }] })
  check('API stores the booked flag', put.body?.booked_total === 12000, `booked_total ${put.body?.booked_total}`)

  const budgetSplit = async () => {
    await page.goto(`${BASE}/trips/${trip.id}/budget`, { waitUntil: 'networkidle' })
    await page.locator('[data-test="per-person"]').waitFor({ timeout: 10000 })
    return page.evaluate(() => ({
      split: document.querySelector('[data-test="per-person"] [data-test="budget-split"]')?.textContent.trim() ?? null,
      bookedTags: [...document.querySelectorAll('[data-test="line-booked"]')].map((t) => t.closest('tr')?.innerText.split('\n')[0].trim())
    }))
  }
  const overviewSplit = async () => {
    await page.goto(`${BASE}/trips/${trip.id}`, { waitUntil: 'networkidle' })
    await page.locator('.budget-card').waitFor({ timeout: 10000 })
    return page.evaluate(() => document.querySelector('.budget-card [data-test="budget-split"]')?.textContent.trim() ?? null)
  }

  let b = await budgetSplit()
  check('Budget tab: per-person split line', b.split === SPLIT, b.split)
  check('Budget tab: only Stay carries the booked tag', b.bookedTags.length === 1 && /Stay/.test(b.bookedTags[0]), JSON.stringify(b.bookedTags))
  const o = await overviewSplit()
  check('Overview card: same split line (§6 one wording)', o === SPLIT, o)

  // un-book through the UI: Edit budget → untick Stay → Save budget
  await page.goto(`${BASE}/trips/${trip.id}/budget`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Edit budget' }).click()
  const box = page.locator('#bt-booked-stay')
  await box.waitFor({ timeout: 5000 })
  check('Edit budget: Stay\'s Booked box starts ticked', await box.isChecked())
  await page.locator('label[for="bt-booked-stay"]').click()
  await page.getByRole('button', { name: 'Save budget' }).click()
  await page.getByRole('button', { name: 'Edit budget' }).waitFor({ timeout: 5000 })
  b = await budgetSplit()
  check('after un-booking: no split line, no booked tag', b.split === null && !b.bookedTags.length, JSON.stringify(b))
  const o2 = await overviewSplit()
  check('after un-booking: Overview card has no split line', o2 === null, o2)

  check('no console errors', !errors.length, errors.join(' | '))
} catch (e) {
  fail('gate run', e.message)
} finally {
  await browser.close()
  purgeQaData()
}
console.log(failures ? `BOOKED CHECK FAILED (${failures})` : 'BOOKED CHECK OK')
process.exit(failures ? 1 : 0)
