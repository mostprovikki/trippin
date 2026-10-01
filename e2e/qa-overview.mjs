// Trip overview gate (docs/design/tripper.md §2 phase-aware Overview, §4 phone
// reach, §6 one number one place). Plan: docs/superpowers/plans/2026-10-01-phase-aware-overview.md
//
// Creates its own fixtures (names 'Overview QA *', persons 'Overview QA Person *',
// registered in server/scripts/purge-qa-data.js) and checks, in a real browser:
//   before the trip — Who's missing what counts and pills, one Copy ⟨name⟩'s link
//     per incomplete row, no button on the trip line, two columns at desk width,
//     left-then-right stacking and 44px row actions at 390px;
//   tab badges — People/Checklists carry the Overview's numbers and five tabs
//     still fit 390px with two-digit badges;
//   during the trip — Today marks done/next, Quick reference shows tonight's
//     stay, Before tomorrow ticks in place and keeps keyboard focus, phone order
//     Today → Quick reference → Tomorrow → Before tomorrow;
//   both — no horizontal overflow, WCAG AA text in light and dark.
//
// Requires: dev servers up (web on [::1]:43100). Run: node e2e/qa-overview.mjs
// (QA_SHOTS=1 writes screenshots to e2e/shots/overview/).
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'
import { auditSource } from './contrast-audit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots/overview')
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

let failures = 0
const ok = (n, x) => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }
const note = (s) => console.log(`note - ${s}`)

// hue in degrees, null for greys — red = within 10° of 0 (see qa-format-polish)
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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
const fx = await page.evaluate(async (ts) => {
  const call = async (method, url, body, token) => {
    const headers = token ? { authorization: `Bearer ${token}` } : {}
    let payload
    if (body instanceof FormData) payload = body
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
    const r = await fetch(url, { method, credentials: 'include', headers, body: payload })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(j)}`)
    return j
  }
  const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
  const person = async (label, fields = {}) => { const p = await call('POST', '/api/people', { name: `Overview QA Person ${label} ${ts}`, ...fields }); return p.person?.id || p.id }
  const trip = async (name, fields) => {
    const t = (await call('POST', '/api/trips', { name: `Overview QA ${name} ${ts}` })).trip
    await call('PUT', `/api/trips/${t.id}`, fields)
    return t.id
  }
  const join = (tripId, pid) => call('POST', `/api/trips/${tripId}/participants`, { person_id: pid })
  const confirm = async (tripId, pid) => {
    const { token } = await call('POST', `/api/trips/${tripId}/participants/${pid}/link`, {})
    await call('PUT', '/api/participant/profile', {}, token)
  }
  const out = {}
  try {
    // before: one complete, one missing dietary, one passport expiring before the trip ends
    const before = await trip('Before', { date_mode: 'confirmed', start_date: iso(30), end_date: iso(40), destination_mode: 'decided', destination: 'Hoi An' })
    const full = { phone: '+91 1', emergency_contact: 'x', dietary: 'veg' }
    const done = await person('Complete', full)
    const diet = await person('Diet', { phone: '+91 2', emergency_contact: 'y' })
    const pass = await person('Passport', full)
    for (const p of [done, diet, pass]) { await join(before, p); await confirm(before, p) }
    const f = new FormData()
    f.append('file', new Blob(['%PDF-1.4 qa'], { type: 'application/pdf' }), 'passport.pdf')
    f.append('doc_type', 'passport')
    f.append('expiry_date', iso(35))
    await call('POST', `/api/people/${pass}/documents`, f)
    out.before = before
    out.passName = `Overview QA Person Passport ${ts}`
    out.dietName = `Overview QA Person Diet ${ts}`

    // badges: ten people missing, ten open checklist items → two-digit badges
    const many = await trip('Badges', { start_date: iso(60), end_date: iso(62) })
    for (let i = 0; i < 10; i++) await join(many, await person(`B${i}`))
    const cl = await call('POST', '/api/checklists', { kind: 'tasks', name: 'Overview QA tasks', trip_id: many })
    const clId = cl.checklist?.id || cl.id
    for (let i = 0; i < 10; i++) await call('POST', `/api/checklists/${clId}/items`, { title: `Task ${i}` })
    out.badges = many

    // during: active, today inside the dates
    const during = await trip('During', {
      date_mode: 'confirmed', start_date: iso(-1), end_date: iso(2), destination_mode: 'decided', destination: 'Hoi An',
      emergency_info: 'Police 113 · Ambulance 115'
    })
    for (const s of ['planning', 'confirmed', 'active']) await call('POST', `/api/trips/${during}/status`, { status: s })
    const { days } = await call('POST', `/api/trips/${during}/itinerary/init`, {})
    const day = (o) => days.find((d) => d.day_date === iso(o)).id
    await call('POST', `/api/days/${day(-1)}/items`, { title: 'QA Stay Anantara', category: 'stay', location: '1 Pham Hong Thai, Hoi An', booking_ref: 'QA-STAY-1', phone: '+84 235 3914 555' })
    await call('POST', `/api/days/${day(0)}/items`, { title: 'QA early start', time_range: '00:00' })
    await call('POST', `/api/days/${day(0)}/items`, { title: 'QA late taxi', time_range: '23:59', location: 'Hoi An', booking_ref: 'QA-REF-1' })
    await call('POST', `/api/days/${day(1)}/items`, { title: 'QA fly out', time_range: '07:00' })
    const tasks = await call('POST', '/api/checklists', { kind: 'tasks', name: 'Overview QA due', trip_id: during })
    const tasksId = tasks.checklist?.id || tasks.id
    await call('POST', `/api/checklists/${tasksId}/items`, { title: 'QA print visas', due_date: iso(1) })
    await call('POST', `/api/checklists/${tasksId}/items`, { title: 'QA confirm taxis', due_date: iso(0) })
    out.during = during
  } catch (e) { out.err = e.message }
  return out
}, TS)

async function audit(label, scheme) {
  const a = await page.evaluate(auditSource({ detectLightSurfaces: scheme === 'dark' }))
  const dark = await page.evaluate(() => document.documentElement.classList.contains('app-dark'))
  if (dark !== (scheme === 'dark')) return fail(`${label} ${scheme}: scheme applied`, `app-dark=${dark}`)
  if (a.lowContrast.length) fail(`${label} ${scheme}: text meets AA`, a.lowContrast.slice(0, 6).map((c) => `${c.sel} "${c.text}" ${c.ratio}:1`).join('; '))
  if (a.lightSurfaces.length) fail(`${label} ${scheme}: no stranded light surface`, a.lightSurfaces.map((s) => s.sel).join(', '))
  if (!a.lowContrast.length && !a.lightSurfaces.length) ok(`${label} ${scheme}: AA, scheme`)
}
async function open(tripId, width, scheme) {
  await page.setViewportSize({ width, height: 900 })
  await page.evaluate((s) => localStorage.setItem('tripper:theme', s), scheme)
  await page.goto(`${BASE}/trips/${tripId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const tops = (sels) => page.evaluate((s) => s.map((x) => { const el = document.querySelector(x); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null }), sels)
const ascending = (xs) => xs.every((v, i) => v != null && (i === 0 || v > xs[i - 1]))

if (fx.err) fail('fixtures', fx.err)
else {
  // ------------------------------------------------------------ before
  await open(fx.before, 1280, 'light')
  const m = await page.evaluate(() => {
    const card = document.querySelector('.missing-card')
    return {
      phase: document.querySelector('[data-phase]')?.dataset.phase,
      heading: card?.querySelector('h2')?.textContent.trim(),
      rows: card ? card.querySelectorAll('[data-person-row]').length : -1,
      buttons: card ? [...card.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
      expired: [...document.querySelectorAll('[data-doc-level="expired"]')].map((t) => getComputedStyle(t).color),
      lineButtons: document.querySelectorAll('.trip-line button').length,
      lefts: ['.missing-card', '.itinerary-card'].map((s) => Math.round(document.querySelector(s)?.getBoundingClientRect().left ?? -1))
    }
  })
  if (m.phase !== 'before') fail('before: phase', `data-phase=${m.phase}`)
  if (m.heading === "Who's missing what · 2 of 3 people") ok('before: missing heading', m.heading)
  else fail('before: missing heading', JSON.stringify(m.heading))
  const wantButtons = [`Copy ${fx.passName}'s link`, `Copy ${fx.dietName}'s link`].sort()
  if (JSON.stringify([...m.buttons].sort()) === JSON.stringify(wantButtons) && m.rows === 2) ok('before: one Copy link per incomplete row')
  else fail('before: copy buttons', `rows=${m.rows} buttons=${JSON.stringify(m.buttons)}`)
  if (m.expired.length === 1 && redish(m.expired[0])) ok('before: expired pill red', m.expired[0])
  else fail('before: expired pill', JSON.stringify(m.expired))
  if (m.lineButtons) fail('before: no button on the trip line (§5)', `${m.lineButtons} found`)
  if (m.lefts[0] >= 0 && m.lefts[1] > m.lefts[0] + 100) ok('before: two columns at 1280', `lefts ${m.lefts}`)
  else fail('before: two columns at 1280', `lefts ${m.lefts}`)
  await audit('before 1280', 'light')
  if (SHOOT) await page.screenshot({ path: path.join(shots, 'before-light-1280.png'), fullPage: true })

  for (const scheme of ['light', 'dark']) {
    await open(fx.before, 390, scheme)
    const vw = await page.evaluate(() => document.documentElement.clientWidth)
    if (vw !== 390) fail(`before 390 ${scheme}: viewport`, `clientWidth ${vw} (headless clamp?)`)
    const ov = await overflow()
    if (ov > 1) fail(`before 390 ${scheme}: no horizontal overflow`, `${ov}px`)
    const t = await tops(['.missing-card', '.since-card', '.itinerary-card', '.budget-card', '.checklists-card'])
    if (ascending(t)) ok(`before 390 ${scheme}: stacks left then right`, t.join(' < '))
    else fail(`before 390 ${scheme}: stack order`, JSON.stringify(t))
    const hs = await page.evaluate(() => [...document.querySelectorAll('.missing-card button')].map((b) => Math.round(b.getBoundingClientRect().height)))
    if (hs.length && hs.every((h) => h >= 44)) ok(`before 390 ${scheme}: row actions ≥ 44px`, hs.join('/'))
    else fail(`before 390 ${scheme}: row actions ≥ 44px`, JSON.stringify(hs))
    await audit('before 390', scheme)
    if (SHOOT) await page.screenshot({ path: path.join(shots, `before-${scheme}-390.png`), fullPage: true })
  }

  // ------------------------------------------------------------ badges
  await open(fx.badges, 390, 'light')
  const b = await page.evaluate(() => ({
    badges: [...document.querySelectorAll('.trip-nav-badge')].map((x) => [x.textContent.trim(), x.getAttribute('aria-label')]),
    rights: Object.fromEntries([...document.querySelectorAll('.trip-nav-item')].map((n) => [n.textContent.replace(/\d+/g, '').trim(), Math.round(n.getBoundingClientRect().right)])),
    missing: document.querySelector('.missing-card h2')?.textContent.trim(),
    open: document.querySelector('.checklists-card h2')?.textContent.trim()
  }))
  const want = [['10', '10 open checklist items'], ['10', '10 people missing details or documents']]
  if (JSON.stringify(b.badges) === JSON.stringify(want)) ok('badges: same numbers as the Overview cards (§6)', `${b.missing} | ${b.open}`)
  else fail('badges: numbers', JSON.stringify(b))
  if (!/· 10 of 10 people$/.test(b.missing || '') || b.open !== 'Checklists · 10 open') fail('badges: cards agree', `${b.missing} | ${b.open}`)
  if (b.rights.People && b.rights.People <= 390) ok('badges: five tabs fit 390px with two-digit badges (§4)', `People right ${b.rights.People}`)
  else fail('badges: five tabs fit 390px', JSON.stringify(b.rights))

  // ------------------------------------------------------------ during
  const nowMin = await page.evaluate(() => new Date().getHours() * 60 + new Date().getMinutes())
  // fixtures sit at 00:00 (done) and 23:59 (next): in those two minutes the
  // assertions can't hold, so say so instead of reporting a false defect
  if (nowMin === 0 || nowMin >= 1439) fail('during: clock edge', `local time ${Math.floor(nowMin / 60)}:${String(nowMin % 60).padStart(2, '0')} — rerun after 00:01 / before 23:59`)
  await open(fx.during, 1280, 'light')
  const d = await page.evaluate(() => ({
    phase: document.querySelector('[data-phase]')?.dataset.phase,
    done: document.querySelector('.today-card .is-done')?.textContent || '',
    next: document.querySelector('.today-card .is-next')?.textContent || '',
    map: document.querySelector('.today-card .is-next a.map-link')?.getAttribute('href') || '',
    quick: document.querySelector('.quickref-card')?.textContent || '',
    tomorrow: document.querySelector('.tomorrow-card')?.textContent || '',
    bt: document.querySelector('.before-tomorrow-card h2')?.textContent.trim(),
    hidden: ['.missing-card', '.since-card', '.budget-card', '.checklists-card'].filter((s) => document.querySelector(s))
  }))
  if (d.phase !== 'during') fail('during: phase', `data-phase=${d.phase}`)
  if (/QA early start/.test(d.done) && /Done/.test(d.done)) ok('during: past item dimmed + Done')
  else fail('during: done row', JSON.stringify(d.done))
  if (/QA late taxi/.test(d.next) && /Next · in/.test(d.next) && /ref QA-REF-1/.test(d.next) && d.map.startsWith('https://www.google.com/maps/')) ok('during: next row timing, ref, Map')
  else fail('during: next row', JSON.stringify({ next: d.next, map: d.map }))
  if (/Tonight: QA Stay Anantara/.test(d.quick) && /QA-STAY-1/.test(d.quick) && /Police 113/.test(d.quick)) ok("during: quick reference has tonight's stay + emergency")
  else fail('during: quick reference', JSON.stringify(d.quick))
  if (/QA fly out/.test(d.tomorrow)) ok('during: tomorrow')
  else fail('during: tomorrow', JSON.stringify(d.tomorrow))
  if (d.hidden.length) fail('during: before-trip cards hidden', d.hidden.join(', '))
  if (d.bt !== 'Before tomorrow · 2 open') fail('during: before tomorrow count', JSON.stringify(d.bt))

  // tick by keyboard: focus the first checkbox, Space, count drops, focus stays
  const box = page.locator('.before-tomorrow-card input[type="checkbox"]').first()
  await box.focus()
  const label = await page.evaluate(() => document.activeElement?.closest('li')?.textContent.trim())
  await page.keyboard.press('Space')
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => ({
    bt: document.querySelector('.before-tomorrow-card h2')?.textContent.trim(),
    focusedRow: document.activeElement?.closest('li')?.textContent.trim(),
    focusedIsBox: document.activeElement?.matches('.before-tomorrow-card input[type="checkbox"]'),
    checked: document.activeElement?.checked
  }))
  const server = await page.evaluate((id) => fetch(`/api/trips/${id}/checklists`).then((r) => r.json()).then((j) => j.checklists.flatMap((c) => c.items).filter((i) => i.done).length), fx.during)
  if (after.bt === 'Before tomorrow · 1 open' && after.focusedIsBox && after.checked && after.focusedRow === label && server === 1) ok('during: tick in place keeps focus, writes through')
  else fail('during: tick in place', JSON.stringify({ ...after, label, serverDone: server }))
  await audit('during 1280', 'light')
  if (SHOOT) await page.screenshot({ path: path.join(shots, 'during-light-1280.png'), fullPage: true })

  for (const scheme of ['light', 'dark']) {
    await open(fx.during, 390, scheme)
    const ov = await overflow()
    if (ov > 1) fail(`during 390 ${scheme}: no horizontal overflow`, `${ov}px`)
    const t = await tops(['.today-card', '.quickref-card', '.tomorrow-card', '.before-tomorrow-card'])
    if (ascending(t)) ok(`during 390 ${scheme}: Today → Quick reference → Tomorrow → Before tomorrow`, t.join(' < '))
    else fail(`during 390 ${scheme}: phone order`, JSON.stringify(t))
    // one-handed on the move (§1): Call, Map and the tick boxes are the row actions
    const taps = await page.evaluate(() => [...document.querySelectorAll('.quickref-actions a, .today-card a.map-link, .bt-item')]
      .map((el) => [el.textContent.trim().slice(0, 20), Math.round(el.getBoundingClientRect().height)]))
    const small = taps.filter(([, h]) => h < 44)
    if (taps.length >= 3 && !small.length) ok(`during 390 ${scheme}: row actions ≥ 44px`, taps.map(([n, h]) => `${n}=${h}`).join(', '))
    else fail(`during 390 ${scheme}: row actions ≥ 44px`, JSON.stringify(taps))
    await audit('during 390', scheme)
    if (SHOOT) await page.screenshot({ path: path.join(shots, `during-${scheme}-390.png`), fullPage: true })
  }
  note(`fixtures ${fx.before} ${fx.badges} ${fx.during}`)
}

await page.evaluate(() => localStorage.removeItem('tripper:theme')).catch(() => {})
if (errors.length) fail('console errors', errors.slice(0, 8).join(' | '))
else ok('no console errors')
await browser.close()
purgeQaData()
console.log(failures ? `OVERVIEW QA FAILED (${failures})` : 'OVERVIEW QA OK')
process.exit(failures ? 1 : 0)
