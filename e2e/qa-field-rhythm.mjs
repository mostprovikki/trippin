// Form-field rhythm gate: a PrimeVue Select must look like the text inputs
// beside it.
//
// main.css's `.field input` rule restyles every <input> with the app tokens,
// but Select renders a <div>, so it kept Aura's own defaults: a darker fill,
// a taller box and 16px text next to 15px inputs (owner screenshot,
// 2026-10-01, itinerary edit form in dark mode). Unit tests can't see that.
//
// Per scheme (light, dark), on the itinerary item form's Time | Category |
// Cost row: height spread across the row <= 1px, and the Select's background,
// border colour, font-size and border-radius equal the InputText's.
//
// Requires: dev servers up (web on [::1]:43100).
// Run: node e2e/qa-field-rhythm.mjs   (add QA_SHOTS=1 for screenshots)
import { existsSync, readdirSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots/field-rhythm')
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

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
const EMAIL = process.env.QA_EMAIL || 'demo@example.com'
const PASSWORD = process.env.QA_PASSWORD || 'demo-pass-123'
const SHOOT = process.env.QA_SHOTS === '1'

let failures = 0
function ok(name, extra) { console.log(`ok  - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|sourcemap|\[vite\]|websocket/i.test(m.text())) errors.push(m.text()) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill(EMAIL)
await page.getByLabel(/password/i).fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })

// Own fixture: a dated trip with one itinerary item, so the edit form exists.
const fx = await page.evaluate(async () => {
  const call = (method, url, body) => fetch(url, {
    method, credentials: 'include', headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then((r) => r.json().catch(() => null))
  const t = await call('POST', '/api/trips', { name: `Rhythm QA ${Date.now()}` })
  const tripId = t?.id || t?.trip?.id
  if (!tripId) return { err: `create trip: ${JSON.stringify(t)}` }
  await call('PUT', `/api/trips/${tripId}`, { start_date: '2027-03-01', end_date: '2027-03-02' })
  const init = await call('POST', `/api/trips/${tripId}/itinerary/init`, {})
  const dayId = init?.days?.[0]?.id
  if (!dayId) return { err: `init itinerary: ${JSON.stringify(init)}` }
  const item = await call('POST', `/api/days/${dayId}/items`, { title: 'Rhythm item', category: 'activity', time_range: '09:00-10:00' })
  return { tripId, itemId: item?.id || item?.item?.id }
})

if (fx.err) fail('fixture', fx.err)
else {
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((s) => localStorage.setItem('tripper:theme', s), scheme)
    await page.goto(`${BASE}/trips/${fx.tripId}/itinerary`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const edit = page.getByRole('button', { name: /^edit/i }).first()
    if (!(await edit.count())) { fail(`${scheme}: edit button`, 'no Edit button on the fixture item'); continue }
    await edit.click()
    const form = page.locator('.iif-form')
    if (!(await form.count())) { fail(`${scheme}: form`, 'Edit did not open .iif-form'); continue }
    await page.waitForTimeout(300)
    const m = await form.evaluate((f) => {
      const box = (sel) => {
        const el = f.querySelector(sel)
        if (!el) return null
        const cs = getComputedStyle(el)
        return {
          h: Math.round(el.getBoundingClientRect().height * 10) / 10,
          bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderTopLeftRadius,
          // A Select's text lives in its label span, not the root.
          font: getComputedStyle(el.querySelector('.p-select-label') || el).fontSize
        }
      }
      return {
        time: box('.iif-time input'), category: box('.iif-category .p-select'), cost: box('.iif-cost input'),
        dark: document.documentElement.classList.contains('app-dark'),
        // Diagnosis for a height failure: what inside the Select sets its box.
        inner: [...(f.querySelector('.iif-category .p-select')?.children || [])].map((c) => {
          const cs = getComputedStyle(c)
          return `${String(c.className).split(' ')[0]} h=${c.getBoundingClientRect().height} lh=${cs.lineHeight} pad=${cs.paddingTop}/${cs.paddingBottom}`
        }).join(', ')
      }
    })
    if (SHOOT) await form.screenshot({ path: path.join(shots, `itinerary-form-${scheme}.png`) })
    if (m.dark !== (scheme === 'dark')) { fail(`${scheme}: scheme applied`, `app-dark=${m.dark}`); continue }
    if (!m.time || !m.category || !m.cost) { fail(`${scheme}: row controls`, JSON.stringify(m)); continue }
    const hs = [m.time.h, m.category.h, m.cost.h]
    const spread = Math.max(...hs) - Math.min(...hs)
    const diffs = ['bg', 'border', 'font', 'radius'].filter((k) => m.category[k] !== m.time[k])
      .map((k) => `${k}: select ${m.category[k]} vs input ${m.time[k]}`)
    if (spread > 1) fail(`${scheme}: row height`, `Time/Category/Cost = ${hs.join('/')}px (spread ${spread.toFixed(1)}); select parts: ${m.inner}`)
    if (diffs.length) fail(`${scheme}: select matches input`, diffs.join('; '))
    if (spread <= 1 && !diffs.length) ok(`${scheme}: itinerary form row`, `h=${hs.join('/')} bg=${m.time.bg} font=${m.time.font}`)
  }
  // Settings: the "Documents every participant needs" MultiSelect (Task 3 of
  // docs/superpowers/plans/2026-10-01-phase-aware-overview.md) beside the
  // Origin city input — empty, and again holding a chip, which is where the
  // box grows.
  for (const scheme of ['light', 'dark']) {
    // useDraft keeps the unsaved chip in localStorage, and a Settings page
    // writes it back as it unloads — so clear it from the Trips list (which
    // holds no draft), then open Settings, and each scheme starts empty
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.evaluate((s) => {
      localStorage.setItem('tripper:theme', s)
      for (const k of Object.keys(localStorage)) if (k.startsWith('tripper:draft:')) localStorage.removeItem(k)
    }, scheme)
    await page.goto(`${BASE}/trips/${fx.tripId}/settings`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    if (await page.locator('.field .p-multiselect .p-multiselect-chip').count()) { fail(`${scheme}: multiselect starts empty`, 'a restored draft chip is present'); continue }
    const measure = () => page.evaluate(() => {
      const box = (el, labelSel) => {
        if (!el) return null
        const cs = getComputedStyle(el)
        return {
          h: Math.round(el.getBoundingClientRect().height * 10) / 10,
          bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderTopLeftRadius,
          font: getComputedStyle((labelSel && el.querySelector(labelSel)) || el).fontSize
        }
      }
      return {
        input: box(document.querySelector('#ts-origin')),
        multi: box(document.querySelector('.field .p-multiselect'), '.p-multiselect-label'),
        dark: document.documentElement.classList.contains('app-dark')
      }
    })
    const check = (label, m) => {
      if (m.dark !== (scheme === 'dark')) return fail(`${scheme}: ${label} scheme applied`, `app-dark=${m.dark}`)
      if (!m.input || !m.multi) return fail(`${scheme}: ${label} controls`, JSON.stringify(m))
      const spread = Math.abs(m.input.h - m.multi.h)
      const diffs = ['bg', 'border', 'font', 'radius'].filter((k) => m.multi[k] !== m.input[k])
        .map((k) => `${k}: multiselect ${m.multi[k]} vs input ${m.input[k]}`)
      if (spread > 1) fail(`${scheme}: ${label} height`, `input ${m.input.h}px vs multiselect ${m.multi.h}px`)
      if (diffs.length) fail(`${scheme}: ${label} matches input`, diffs.join('; '))
      if (spread <= 1 && !diffs.length) ok(`${scheme}: ${label}`, `h=${m.input.h}/${m.multi.h}`)
    }
    check('settings multiselect (empty)', await measure())
    await page.locator('.field .p-multiselect').click()
    const opt = page.locator('.p-multiselect-option', { hasText: 'Visa' })
    if (!(await opt.count())) { fail(`${scheme}: multiselect options`, 'no Visa option opened'); continue }
    await opt.click()
    await page.keyboard.press('Escape')
    // blur, so the focus ring isn't measured as the resting border
    await page.locator('h1').first().click()
    await page.waitForTimeout(400)
    if (SHOOT) await page.locator('.field .p-multiselect').screenshot({ path: path.join(shots, `settings-multiselect-${scheme}.png`) })
    const chips = await page.locator('.field .p-multiselect .p-multiselect-chip').count()
    if (chips !== 1) { fail(`${scheme}: multiselect chip present`, `${chips} chips after picking Visa — the chip measurement would be vacuous`); continue }
    check('settings multiselect (one chip)', await measure())
  }
  await page.evaluate(() => {
    localStorage.removeItem('tripper:theme')
    for (const k of Object.keys(localStorage)) if (k.startsWith('tripper:draft:')) localStorage.removeItem(k)
  })
}

if (errors.length) fail('console errors', errors.slice(0, 8).join(' | '))
else ok('no console errors')

await browser.close()
purgeQaData()
console.log(failures ? `FIELD RHYTHM QA FAILED (${failures})` : 'FIELD RHYTHM QA OK')
process.exit(failures ? 1 : 0)
