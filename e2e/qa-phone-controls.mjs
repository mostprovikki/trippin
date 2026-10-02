// Phone controls gate (trip-planner-cdl; tripper.md §4 D7: on a phone every control is ≥ 44px tall).
// Read-only. At 390px, every visible button, text input, select, textarea and PrimeVue
// Select/MultiSelect on each organizer page is ≥ 44px tall. Also checks cdl's copy/format
// fixes on the flagship trip: header has no next-status button (D9), Settings › Status has
// it, Destination budget is formatted, Dates are readable.
// Run: node e2e/qa-phone-controls.mjs
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
const MIN = 44
let failures = 0
const ok = (n, x = '') => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }
const check = (n, cond, d) => (cond ? ok(n, d) : fail(n, d))

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill('demo@tripper.dev')
await page.locator('#password').fill('tripper1234')
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
const trips = await page.evaluate(() => fetch('/api/trips').then((r) => r.json()).then((j) => j.trips))
const flagship = trips.filter((t) => t.status === 'confirmed')
if (flagship.length !== 1) { fail('resolve flagship', `${flagship.length} confirmed trips`); process.exit(1) }
const T = `/trips/${flagship[0].id}`

const short = () => {
  const SEL = 'button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea, .p-select, .p-multiselect'
  // PrimeVue renders its own native input inside .p-select / .p-checkbox / .p-radiobutton; the root is what's tapped
  const inner = (el) => el.closest('.p-checkbox, .p-radiobutton, .p-toggleswitch') || (el.tagName === 'INPUT' && el.closest('.p-select, .p-multiselect'))
  return [...document.querySelectorAll(SEL)]
    .filter((el) => el.offsetParent && !inner(el) && !el.closest('[aria-hidden="true"]'))
    .map((el) => ({ el, h: el.getBoundingClientRect().height }))
    .filter(({ h }) => h > 0 && h < 44)
    .map(({ el, h }) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}[${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.name || '').trim().slice(0, 18)}]=${Math.round(h)}`)
}

const PAGES = ['/', '/people', '/trips/new', T, `${T}/itinerary`, `${T}/budget`, `${T}/checklists`, `${T}/people`, `${T}/dates`, `${T}/destination`, `${T}/settings`]
for (const p of PAGES) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const cw = await page.evaluate(() => document.documentElement.clientWidth)
  if (cw > 400) { fail(`${p}: viewport is 390`, `clientWidth ${cw}`); continue }
  const bad = await page.evaluate(short)
  check(`${p}: every control ≥ ${MIN}px`, !bad.length, bad.slice(0, 6).join(', ') + (bad.length > 6 ? ` … +${bad.length - 6}` : ''))
}

// cdl copy/format fixes
await page.goto(`${BASE}${T}/settings`, { waitUntil: 'networkidle' })
const head = await page.evaluate(() => [...document.querySelectorAll('.trip-head button')].map((b) => b.textContent.trim()))
check('trip header has no next-status button (D9)', !head.some((t) => /Start planning|Confirm trip|Activate/.test(t)), JSON.stringify(head))
const status = await page.evaluate(() => {
  const sec = [...document.querySelectorAll('section.card')].find((s) => s.querySelector('h2')?.textContent.trim() === 'Status')
  return sec ? { text: sec.innerText, buttons: [...sec.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null
})
check('Settings › Status has the next-status action, no sidebar copy', status && status.buttons.includes('Activate') && !/sidebar/i.test(status.text), JSON.stringify(status?.buttons))
await page.goto(`${BASE}${T}/destination`, { waitUntil: 'networkidle' })
const dest = await page.evaluate(() => [...document.querySelectorAll('p')].map((p) => p.textContent).filter((t) => /Est\. budget\/person/.test(t)))
check('Destination budget per person is formatted money', dest.length > 0 && dest.every((t) => /[₹$€£¥₫]\s?\d{1,3}(,\d{3})+|[₹$€£¥₫]\s?\d{1,3}(?!\d)/.test(t)), JSON.stringify(dest.slice(0, 2)))
await page.goto(`${BASE}${T}/dates`, { waitUntil: 'networkidle' })
const dates = await page.evaluate(() => document.querySelector('.dates-confirmed strong')?.textContent.trim() ?? null)
check('Dates banner is readable, not ISO', dates && /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} – [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/.test(dates), dates)

check('no console errors', !errors.length, errors.join(' | '))
await browser.close()
console.log(failures ? `PHONE CONTROLS CHECK FAILED (${failures})` : 'PHONE CONTROLS CHECK OK')
process.exit(failures ? 1 : 0)
