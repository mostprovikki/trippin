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
const TRIP = '8da9c5b4-b32a-4af7-984f-26258638afa0'
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

// 1. Overview stat tile shows a separated number, not the raw digits.
await page.goto(`${BASE}/trips/${TRIP}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const stat = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.stat-card')]
  const c = cards.find((x) => x.textContent.includes('Budget'))
  return c ? c.querySelector('.stat-value')?.textContent.trim() : null
})
if (stat === '970,300') ok('overview budget stat formatted', stat)
else fail('overview budget stat', `got ${JSON.stringify(stat)}, want "970,300"`)

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

// 4. Readiness: expired pill is danger-red, future warning pill stays amber.
await page.goto(`${BASE}/trips/${TRIP}/readiness`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const pills = await page.evaluate(() => {
  const tags = [...document.querySelectorAll('.p-tag')].filter((t) => /expired|warning/.test(t.textContent))
  const read = (t) => {
    const cs = getComputedStyle(t)
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.backgroundColor + '|' + cs.color)
    return { text: t.textContent.trim(), bg: cs.backgroundColor, color: cs.color }
  }
  return {
    expired: tags.filter((t) => /expired/.test(t.textContent)).map(read),
    warning: tags.filter((t) => /warning/.test(t.textContent)).map(read)
  }
})
const redish = (s) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m && Number(m[1]) > Number(m[2]) + 30 && Number(m[1]) > Number(m[3]) + 30 }
const amberish = (s) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m && Number(m[1]) > Number(m[3]) && Number(m[2]) > Number(m[3]) }
if (!pills.expired.length) fail('expired pill present', 'no expired pill found on readiness page — measurement vacuous')
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
