// Participant profile gate (trip-planner-4hi; docs/design/tripper.md §6 "Missing",
// §9 D2: required = phone, emergency contact, dietary). Confirmed must mean complete.
//
// Creates its own fixtures (trips 'Profile QA *', persons 'Profile QA Person *',
// registered in server/scripts/purge-qa-data.js) and checks, in a real browser
// at 390px in light and dark:
//   /p marks exactly the three required fields (visible red *, aria-required);
//   Save with two of them blank says "Saved. Still needed: …", never
//     "Profile confirmed", and the profile step stays undone;
//   the organizer's Overview names the same two fields for that person;
//   filling them and saving says "Profile confirmed ✓", the step is done after a
//     reload, and the Overview lists the person as complete;
//   no horizontal overflow, WCAG AA text, no console errors.
//
// Requires: dev servers up (web on [::1]:43100). Run: node e2e/qa-participant-profile.mjs
// (QA_SHOTS=1 writes screenshots to e2e/shots/participant-profile/).
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'
import { auditSource } from './contrast-audit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots/participant-profile')
mkdirSync(shots, { recursive: true })

function findExecutable() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell-')).sort().reverse()) {
      const exe = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
      if (existsSync(exe)) return exe
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
const EMAIL = process.env.QA_EMAIL || 'demo@example.com'
const PASSWORD = process.env.QA_PASSWORD || 'demo-pass-123'
const SHOOT = process.env.QA_SHOTS === '1'
const TS = Date.now()
const NAME = `Profile QA Person Partial ${TS}`

let failures = 0
const ok = (n, x) => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }

// hue in degrees, null for greys — classify colours by hue, not channel gaps
// (memory: a 'red > g+30' test passes PrimeVue's warn orange)
function hue(s) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s)
  if (!m) return null
  const [r, g, b] = m.slice(1, 4).map((x) => Number(x) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.15) return null
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}
const redish = (c) => { const h = hue(c); return h != null && (h <= 10 || h >= 350) }

purgeQaData()
const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|sourcemap|\[vite\]|websocket/i.test(m.text())) errors.push(m.text()) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill(EMAIL)
await page.locator('#password').fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

// ---------------------------------------------------------------- fixtures
const fx = await page.evaluate(async ({ ts, name }) => {
  const call = async (method, url, body) => {
    const headers = body !== undefined ? { 'content-type': 'application/json' } : {}
    const r = await fetch(url, { method, credentials: 'include', headers, body: body !== undefined ? JSON.stringify(body) : undefined })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(j)}`)
    return j
  }
  const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
  try {
    const trip = (await call('POST', '/api/trips', { name: `Profile QA ${ts}` })).trip.id
    await call('PUT', `/api/trips/${trip}`, { date_mode: 'confirmed', start_date: iso(30), end_date: iso(35) })
    const p = await call('POST', '/api/people', { name, phone: '+91 98450 00000' })
    const pid = p.person?.id || p.id
    await call('POST', `/api/trips/${trip}/participants`, { person_id: pid })
    const { token } = await call('POST', `/api/trips/${trip}/participants/${pid}/link`, {})
    return { trip, token }
  } catch (e) { return { err: e.message } }
}, { ts: TS, name: NAME })

async function audit(label, scheme) {
  const a = await page.evaluate(auditSource({ detectLightSurfaces: scheme === 'dark' }))
  const dark = await page.evaluate(() => document.documentElement.classList.contains('app-dark'))
  if (dark !== (scheme === 'dark')) return fail(`${label} ${scheme}: scheme applied`, `app-dark=${dark}`)
  if (a.lowContrast.length) fail(`${label} ${scheme}: text meets AA`, a.lowContrast.slice(0, 6).map((c) => `${c.sel} "${c.text}" ${c.ratio}:1`).join('; '))
  if (a.lightSurfaces.length) fail(`${label} ${scheme}: no stranded light surface`, a.lightSurfaces.map((s) => s.sel).join(', '))
  if (!a.lowContrast.length && !a.lightSurfaces.length) ok(`${label} ${scheme}: AA, scheme`)
}
async function openP(scheme) {
  await page.evaluate((s) => localStorage.setItem('tripper:theme', s), scheme)
  await page.goto(`${BASE}/p/${fx.token}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const profileStep = () => page.evaluate(() => {
  const card = document.querySelector('.step-card')
  return card ? { done: card.classList.contains('step-done'), hint: card.querySelector('.step-hint')?.textContent.trim() } : null
})
async function save() {
  await page.locator('form').getByRole('button', { name: /^save$/i }).click()
  await page.waitForFunction(() => document.querySelector('.pf-still, .pf-confirmed'), null, { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(300)
  return page.evaluate(() => ({
    still: document.querySelector('.pf-still')?.textContent.trim() || null,
    confirmed: document.querySelector('.pf-confirmed')?.textContent.trim() || null
  }))
}
async function overviewMissing() {
  await page.goto(`${BASE}/trips/${fx.trip}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  return page.evaluate((name) => {
    const card = document.querySelector('.missing-card')
    if (!card) return null
    const row = [...card.querySelectorAll('li, .missing-row, [data-person-id]')].find((el) => el.textContent.includes(name))
    return { row: row ? row.textContent.replace(/\s+/g, ' ').trim() : null, text: card.textContent.replace(/\s+/g, ' ') }
  }, NAME)
}

if (fx.err) fail('fixtures', fx.err)
else {
  // ---------------------------------------------------- required markers
  await openP('light')
  const marks = await page.evaluate(() => {
    // dietary is a radio group since trip-planner-0qh: its * sits on the legend
    const labels = [...document.querySelectorAll('form label[for], form fieldset[id] > legend')]
    return {
      marked: labels.filter((l) => l.querySelector('.pf-req')).map((l) => l.getAttribute('for') || l.parentElement.id),
      aria: ['pf-phone', 'pf-emergency', 'pf-dietary', 'pf-email'].map((id) => [id, document.getElementById(id)?.getAttribute('aria-required')]),
      starColor: getComputedStyle(document.querySelector('label .pf-req') || document.body).color,
      starVisible: !!document.querySelector('label .pf-req')?.getBoundingClientRect().width,
      legend: document.querySelector('.pf-legend')?.textContent.trim() || null
    }
  })
  const want = ['pf-phone', 'pf-emergency', 'pf-dietary']
  if (JSON.stringify(marks.marked) !== JSON.stringify(want)) fail('/p: exactly the three required fields are marked', `marked ${JSON.stringify(marks.marked)}`)
  else ok('/p: exactly the three required fields are marked')
  const ariaBad = marks.aria.filter(([id, v]) => (id === 'pf-email' ? v === 'true' : v !== 'true'))
  if (ariaBad.length) fail('/p: aria-required on required fields only', JSON.stringify(ariaBad))
  else ok('/p: aria-required on required fields only')
  if (!marks.starVisible || !redish(marks.starColor)) fail('/p light: required * is visible and red', `visible=${marks.starVisible} color=${marks.starColor}`)
  else ok('/p light: required * is visible and red', marks.starColor)
  if (!marks.legend?.includes('Needed before the trip')) fail('/p: legend explains *', `legend=${marks.legend}`)
  else ok('/p: legend explains *')

  const before = await profileStep()
  if (!before) fail('/p: profile step card present', 'no .step-card')
  // trip-planner-0qh: the names appear once, beside Save — the step hint is
  // empty until the profile is confirmed
  else if (before.done || before.hint) fail('/p: step hint stays empty until confirmed', JSON.stringify(before))
  else ok('/p: step hint stays empty until confirmed')

  // -------------------------------------------- Save with blanks (the bug)
  const blank = await save()
  if (blank.confirmed) fail('/p: Save with blanks never says confirmed', `showed "${blank.confirmed}"`)
  else if (blank.still !== 'Saved. Still needed: Emergency contact, Dietary') fail('/p: Save with blanks says what is still needed', `still=${JSON.stringify(blank.still)}`)
  else ok('/p: Save with blanks says what is still needed', blank.still)
  const afterBlank = await profileStep()
  if (afterBlank?.done) fail('/p: profile step stays undone after a blank save', JSON.stringify(afterBlank))
  else ok('/p: profile step stays undone after a blank save')
  if (SHOOT) await page.screenshot({ path: path.join(shots, 'p-390-light-still-needed.png'), fullPage: true })
  const ov = await overflow()
  if (ov > 1) fail('/p 390 light: no horizontal overflow', `${ov}px`)
  else ok('/p 390 light: no horizontal overflow')
  await audit('/p 390 still-needed', 'light')

  await openP('dark')
  const darkStar = await page.evaluate(() => getComputedStyle(document.querySelector('label .pf-req')).color)
  if (!redish(darkStar)) fail('/p dark: required * is red', darkStar)
  else ok('/p dark: required * is red', darkStar)
  const blankDark = await save()
  if (!blankDark.still) fail('/p dark: still-needed message shows', JSON.stringify(blankDark))
  if (SHOOT) await page.screenshot({ path: path.join(shots, 'p-390-dark-still-needed.png'), fullPage: true })
  const ovd = await overflow()
  if (ovd > 1) fail('/p 390 dark: no horizontal overflow', `${ovd}px`)
  else ok('/p 390 dark: no horizontal overflow')
  await audit('/p 390 still-needed', 'dark')

  // ----------------------------------------------- Overview agrees with /p
  await page.evaluate(() => localStorage.setItem('tripper:theme', 'light'))
  const m1 = await overviewMissing()
  if (!m1) fail('Overview: missing card present', 'no .missing-card')
  else if (!m1.row) fail('Overview: incomplete person has a Missing row', `card text: ${m1.text.slice(0, 200)}`)
  else if (!m1.row.includes('No emergency contact · no dietary preference')) fail('Overview: row names the same fields /p asks for', m1.row.slice(0, 200))
  else ok('Overview: row names the same fields /p asks for')

  // ------------------------------------------------- complete it → confirmed
  await openP('light')
  await page.locator('#pf-emergency').fill('Amma +91 98450 11111')
  const opt = page.locator('#pf-dietary .pf-choice', { hasText: /^\s*Veg\s*$/ })
  if (!(await opt.count())) fail('/p: dietary Veg choice present', 'no "Veg" radio')
  else await opt.click()
  await page.waitForTimeout(300)
  const done = await save()
  if (done.still || done.confirmed !== 'Profile confirmed ✓') fail('/p: complete Save says confirmed', JSON.stringify(done))
  else ok('/p: complete Save says confirmed')
  if (SHOOT) await page.screenshot({ path: path.join(shots, 'p-390-light-confirmed.png'), fullPage: true })
  await openP('light')
  const reloaded = await profileStep()
  if (!reloaded?.done || reloaded.hint !== 'Confirmed') fail('/p: confirmed survives a reload', JSON.stringify(reloaded))
  else ok('/p: confirmed survives a reload')
  const m2 = await overviewMissing()
  if (!m2) fail('Overview: missing card present after completion', 'no .missing-card')
  else if (m2.row) fail('Overview: completed person has no Missing row', m2.row.slice(0, 200))
  // the only participant: the card says everyone is in rather than naming them
  else if (!/0 of 1 people/.test(m2.text) || !m2.text.includes("Everyone's details are in")) fail('Overview: completed person counts as complete', m2.text.slice(0, 200))
  else ok('Overview: completed person counts as complete')
}

if (errors.length) fail('no console errors', errors.slice(0, 5).join(' | '))
else ok('no console errors')
await page.evaluate(() => localStorage.removeItem('tripper:theme')).catch(() => {})
await browser.close()
purgeQaData()
console.log(failures ? `PARTICIPANT PROFILE QA FAILED (${failures})` : 'PARTICIPANT PROFILE QA OK')
process.exit(failures ? 1 : 0)
