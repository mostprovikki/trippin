// /p on a phone gate (trip-planner-0qh, plan 2026-10-02-participant-page-phone.md Task 5).
// Fixtures: trip 'Phone QA <ts>' (required docs passport+visa, dated), person
// 'Phone QA Person <ts>' (no phone/emergency/dietary); both in server/scripts/purge-qa-data.js.
// At 390x900, light and dark: no overflow; every control >=44px; required questions
// first and the fold closed; hero has no ISO date / "invite"; Documents says what is
// needed; AA contrast. Then (light) fill + Veg + Save -> confirmed, Overview drops the
// profile-field reasons. Run: node e2e/qa-participant-phone.mjs  (QA_SHOTS=1 for shots)
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'
import { auditSource } from './contrast-audit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots')
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
const NAME = `Phone QA Person ${TS}`

let failures = 0
const ok = (n, x) => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }

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

const apiCall = (method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const headers = body !== undefined ? { 'content-type': 'application/json' } : {}
  const r = await fetch(url, { method, credentials: 'include', headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(j)}`)
  return j
}, { method, url, body })

let fx
try {
  const iso = (o) => { const d = new Date(); d.setDate(d.getDate() + o); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
  const trip = (await apiCall('POST', '/api/trips', { name: `Phone QA ${TS}` })).trip.id
  await apiCall('PUT', `/api/trips/${trip}`, { date_mode: 'confirmed', start_date: iso(30), end_date: iso(35), required_doc_types: ['passport', 'visa'] })
  const p = await apiCall('POST', '/api/people', { name: NAME })
  const pid = p.person?.id || p.id
  await apiCall('POST', `/api/trips/${trip}/participants`, { person_id: pid })
  const { token } = await apiCall('POST', `/api/trips/${trip}/participants/${pid}/link`, {})
  fx = { trip, pid, token }
} catch (e) { fx = { err: e.message } }

async function audit(label, scheme) {
  const a = await page.evaluate(auditSource({ detectLightSurfaces: scheme === 'dark' }))
  const dark = await page.evaluate(() => document.documentElement.classList.contains('app-dark'))
  if (dark !== (scheme === 'dark')) return fail(`${label} ${scheme}: scheme applied`, `app-dark=${dark}`)
  if (a.lowContrast.length) fail(`${label} ${scheme}: text meets AA`, a.lowContrast.slice(0, 6).map((c) => `${c.sel} "${c.text}" ${c.ratio}:1`).join('; '))
  else if (a.lightSurfaces.length) fail(`${label} ${scheme}: no stranded light surface`, a.lightSurfaces.map((s) => s.sel).join(', '))
  else ok(`${label} ${scheme}: AA, scheme`)
}
async function openP(scheme) {
  await page.evaluate((s) => localStorage.setItem('tripper:theme', s), scheme)
  await page.goto(`${BASE}/p/${fx.token}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}
const openFold = () => page.evaluate(() => { const d = document.querySelector('details.pf-more'); if (d) d.open = true; return !!d })

async function overviewRow() {
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
  for (const scheme of ['light', 'dark']) {
    const L = `/p 390 ${scheme}`
    await openP(scheme)

    // 1 overflow
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ov > 1 ? fail(`${L}: no horizontal overflow`, `${ov}px`) : ok(`${L}: no horizontal overflow`)

    // 3 order, fold closed, page height (measured at rest, before opening the fold)
    const lay = await page.evaluate(() => {
      const form = document.querySelector('form')
      const ids = [...(form || document).querySelectorAll('input[id], textarea[id], [role="combobox"][id], fieldset[id]')]
        .filter((e) => !e.closest('.p-hidden-accessible')).map((e) => e.id)
      const d = document.querySelector('details.pf-more')
      return { ids, fold: !!d, open: d ? d.open : null, h: document.documentElement.scrollHeight }
    })
    const first4 = lay.ids.slice(0, 4)
    const want = ['pf-name', 'pf-phone', 'pf-emergency', 'pf-dietary']
    if (JSON.stringify(first4) !== JSON.stringify(want)) fail(`${L}: first 4 questions are Name, Phone, Emergency, Dietary`, `got ${JSON.stringify(first4)}`)
    else ok(`${L}: first 4 questions are Name, Phone, Emergency, Dietary`)
    if (!lay.fold || lay.open) fail(`${L}: details.pf-more exists and is closed`, `exists=${lay.fold} open=${lay.open}`)
    else ok(`${L}: details.pf-more exists and is closed`)
    lay.h < 2000 ? ok(`${L}: page height at rest < 2000`, `${lay.h}px`) : fail(`${L}: page height at rest < 2000`, `${lay.h}px (pre-change 2531)`)

    // 4 hero
    const hero = await page.evaluate(() => document.querySelector('.p-hero')?.textContent.replace(/\s+/g, ' ').trim() ?? null)
    if (hero == null) fail(`${L}: .p-hero present`, 'no .p-hero')
    else if (/\d{4}-\d{2}-\d{2}/.test(hero) || /invite/i.test(hero)) fail(`${L}: hero has no ISO date, no "invite"`, hero.slice(0, 160))
    else ok(`${L}: hero has no ISO date, no "invite"`)

    // 5 documents
    const docs = await page.evaluate(() => ({
      hint: document.querySelectorAll('.step-card')[1]?.querySelector('.step-hint')?.textContent.trim() ?? null,
      im: document.getElementById('doc-expiry')?.getAttribute('inputmode') ?? null
    }))
    docs.hint === 'Needed: Passport, Visa' ? ok(`${L}: Documents hint`, docs.hint) : fail(`${L}: Documents hint is 'Needed: Passport, Visa'`, `got ${JSON.stringify(docs.hint)}`)
    docs.im === 'numeric' ? ok(`${L}: #doc-expiry inputmode=numeric`) : fail(`${L}: #doc-expiry inputmode=numeric`, `got ${JSON.stringify(docs.im)}`)

    // 7 contrast at rest, then 2 tap targets + contrast with the fold open
    await audit(`${L} rest`, scheme)
    if (SHOOT) await page.screenshot({ path: path.join(shots, `participant-390-${scheme}.png`), fullPage: true })
    await openFold()
    await page.waitForTimeout(150)
    const small = await page.evaluate(() => {
      const sel = 'button, input:not([type=checkbox]):not([type=radio]):not([type=file]), .p-select, textarea, summary, .pf-choice'
      const bad = []; let n = 0
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('.p-hidden-accessible')) continue
        const r = el.getBoundingClientRect()
        if (!el.getClientRects().length || r.height <= 1) continue
        n++
        if (r.height < 44) bad.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${r.height.toFixed(1)}px`)
      }
      return { n, bad }
    })
    small.bad.length ? fail(`${L}: every control >= 44px`, `${small.bad.length}/${small.n} short: ${small.bad.slice(0, 8).join('; ')}`) : ok(`${L}: every control >= 44px`, `${small.n} measured`)
    await audit(`${L} fold open`, scheme)
    if (SHOOT) await page.screenshot({ path: path.join(shots, `participant-390-${scheme}-open.png`), fullPage: true })
  }

  // 6 save flow (light). Match the Overview reason words, not bare "phone":
  // the fixture person is called "Phone QA Person".
  const PROFILE_REASON = /\bno (phone|emergency|dietary)/i
  // 6 save flow (light)
  await openP('light')
  const pre = await overviewRow()
  if (pre?.row && PROFILE_REASON.test(pre.row)) ok('Overview precondition: profile-field reasons before Save', pre.row.slice(0, 90))
  else fail('Overview precondition: person has profile-field reasons before Save', JSON.stringify(pre?.row ?? pre?.text?.slice(0, 160)))
  await openP('light')
  await page.locator('#pf-phone').fill('+91 98450 00000')
  await page.locator('#pf-emergency').fill('Amma +91 98450 11111')
  const veg = page.locator('.pf-choice', { hasText: /^\s*Veg\s*$/ })
  if (!(await veg.count())) fail('/p: Veg .pf-choice exists', 'no .pf-choice labelled Veg')
  else {
    await veg.first().click()
    await page.locator('form').getByRole('button', { name: /^save$/i }).click()
    let confirmed = true
    await page.locator('.pf-confirmed').waitFor({ state: 'visible', timeout: 5000 }).catch(() => { confirmed = false })
    confirmed ? ok('/p: Save with phone + emergency + Veg shows .pf-confirmed') : fail('/p: Save shows .pf-confirmed', `still=${await page.locator('.pf-still').textContent().catch(() => null)}`)
    const post = await overviewRow()
    const gone = !post?.row || !PROFILE_REASON.test(post.row)
    gone ? ok('Overview: person has no profile-field reasons after Save', post?.row ? `remaining: ${post.row.slice(0, 100)}` : 'no row') : fail('Overview: person has no profile-field reasons after Save', post.row.slice(0, 200))
  }
}

if (errors.length) fail('no console errors', errors.slice(0, 5).join(' | '))
else ok('no console errors')
if (fx && !fx.err) {
  // no trip DELETE route: archive (unblocks person delete); purgeQaData() below hard-deletes
  await apiCall('POST', `/api/trips/${fx.trip}/archive`, {}).catch((e) => fail('cleanup trip archive', e.message))
  // DELETE /api/people/:id 500s (FK trip_participants) for a member of an archived trip; purgeQaData() removes the person
}
await page.evaluate(() => localStorage.removeItem('tripper:theme')).catch(() => {})
await browser.close()
purgeQaData()
console.log(failures ? `PARTICIPANT PHONE QA FAILED (${failures})` : 'PARTICIPANT PHONE QA OK')
process.exit(failures ? 1 : 0)
