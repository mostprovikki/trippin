// Verify TripDatesView confirmed-banner fix, both arms, both schemes.
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
const CONFIRMED_TRIP = '8da9c5b4-b32a-4af7-984f-26258638afa0' // Vietnam, date_mode=confirmed, no windows
const IDEA_TRIP = 'd88e2c90-69d0-4aa7-9a04-8209a5d6f2f6'      // Ladakh, windows, not confirmed
let failures = 0
const ok = (n, x = '') => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ colorScheme: scheme })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel(/email/i).fill('demo@tripper.dev')
  await page.locator('#password').fill('tripper1234')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

  // Arm 1: confirmed trip shows banner with the exact dates + adapted description.
  await page.goto(`${BASE}/trips/${CONFIRMED_TRIP}/dates`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const a = await page.evaluate(() => {
    const banner = document.querySelector('.dates-confirmed')
    const main = document.querySelector('.trip-main') || document.body
    return {
      banner: banner ? banner.innerText.replace(/\s+/g, ' ').trim() : null,
      desc: main.innerText.includes('Trip dates are locked'),
      staleDesc: main.innerText.includes('then confirm one to lock')
    }
  })
  if (a.banner && a.banner.includes('2026-11-06') && a.banner.includes('2026-11-15') && /confirmed/i.test(a.banner)) ok(`${scheme}: confirmed trip shows banner`, a.banner)
  else fail(`${scheme}: confirmed trip banner`, JSON.stringify(a))
  if (a.desc && !a.staleDesc) ok(`${scheme}: description adapted to confirmed state`)
  else fail(`${scheme}: description`, JSON.stringify(a))

  // Arm 2: unconfirmed trip shows NO banner and the propose description.
  await page.goto(`${BASE}/trips/${IDEA_TRIP}/dates`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const b = await page.evaluate(() => {
    const main = document.querySelector('.trip-main') || document.body
    return {
      banner: !!document.querySelector('.dates-confirmed'),
      proposeDesc: main.innerText.includes('then confirm one to lock'),
      rows: document.querySelectorAll('.dwe-row').length
    }
  })
  if (!b.banner && b.proposeDesc && b.rows >= 1) ok(`${scheme}: unconfirmed trip unchanged`, `${b.rows} window rows, no banner`)
  else fail(`${scheme}: unconfirmed trip`, JSON.stringify(b))

  if (errors.length) fail(`${scheme}: console errors`, errors.join(' | '))
  else ok(`${scheme}: no console errors`)
  await ctx.close()
}
await browser.close()
console.log(failures ? `DATES-VIEW CHECK FAILED (${failures})` : 'DATES-VIEW CHECK OK')
process.exit(failures ? 1 : 0)
