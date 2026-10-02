// Trips list + /trips/new gate (trip-planner-cpp; tripper.md §2 "the trip that needs me", §4, §6).
// Read-only.
//   - each non-archived trip card's "N of M people missing" is the number its
//     Overview heading says ("Who's missing what · N of M people"); N = 0 → no line
//   - /trips/new at 390: one "Step 1 of 4 · Basics" line, no clipped StepList,
//     nothing past the right edge; at 1280 the StepList shows
// Run: node e2e/qa-trips-list.mjs
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
  const w = `${width}px`

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('.trip-card').first().waitFor({ timeout: 10000 })
  const cards = await page.evaluate(() => [...document.querySelectorAll('.trip-card')].map((c) => ({
    href: c.getAttribute('href'),
    name: c.querySelector('h3')?.textContent.trim(),
    archived: c.classList.contains('trip-card-archived'),
    missing: c.querySelector('[data-test="trip-missing"]')?.textContent.trim() ?? null
  })))
  const live = cards.filter((c) => !c.archived)
  check(`${w}: at least one live trip card shows a missing line`, live.some((c) => c.missing), JSON.stringify(live.map((c) => [c.name, c.missing])))
  for (const c of live) {
    await page.goto(`${BASE}${c.href}`, { waitUntil: 'networkidle' })
    const heading = await page.locator('#missing-h').textContent({ timeout: 8000 }).catch(() => null)
    const m = heading?.match(/(\d+) of (\d+) people/)
    const expected = m && +m[1] > 0 ? `${m[1]} of ${m[2]} people missing` : null
    if (!heading) { check(`${w}: ${c.name} card has no missing line (Overview shows no missing card)`, c.missing == null, `card says ${c.missing}`); continue }
    check(`${w}: ${c.name} card = Overview number`, c.missing === expected, `card "${c.missing}" vs Overview "${heading.trim()}"`)
  }

  await page.goto(`${BASE}/trips/new`, { waitUntil: 'networkidle' })
  await page.locator('.trip-wizard').waitFor({ timeout: 10000 })
  const s = await page.evaluate(() => {
    const vis = (el) => !!el && el.offsetParent !== null
    const form = document.querySelector('.trip-wizard')
    const right = Math.max(...[...form.querySelectorAll('*')].filter(vis).map((e) => e.getBoundingClientRect().right))
    return {
      clientWidth: document.documentElement.clientWidth,
      compact: vis(document.querySelector('[data-test="wizard-step-compact"]')) ? document.querySelector('[data-test="wizard-step-compact"]').textContent.trim() : null,
      stepList: vis(document.querySelector('.p-steplist')),
      right
    }
  })
  if (width === 390) {
    if (s.clientWidth > 400) fail(`${w}: viewport is 390`, `clientWidth ${s.clientWidth}`)
    check(`${w}: wizard shows "Step 1 of 4 · Basics" instead of the StepList`, s.compact === 'Step 1 of 4 · Basics' && !s.stepList, JSON.stringify(s))
    check(`${w}: nothing in the wizard past the right edge`, s.right <= s.clientWidth, `rightmost ${Math.round(s.right)} / ${s.clientWidth}`)
  } else {
    check(`${w}: wizard shows the StepList, not the compact line`, s.stepList && !s.compact, JSON.stringify(s))
  }

  check(`${w}: no console errors`, !errors.length, errors.join(' | '))
  await ctx.close()
}
await browser.close()
console.log(failures ? `TRIPS LIST CHECK FAILED (${failures})` : 'TRIPS LIST CHECK OK')
process.exit(failures ? 1 : 0)
