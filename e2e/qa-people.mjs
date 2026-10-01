// People tab gate (trip-planner-27f; docs/design/tripper.md §4 D7, §6 "Missing", D1 "copy never revokes").
// Creates its own fixtures (trips 'People QA *', persons 'People QA Person *',
// registered in server/scripts/purge-qa-data.js) and checks in a real browser:
//   one number: People [data-missing] rows = Overview missing rows = People nav badge;
//   same reason on People and Overview; a complete person is untagged, no link-state jargon;
//   Copy never revokes; Copy with no link mints without a dialog;
//   Replace link asks first, then revokes and copies a new link (Cancel revokes nothing);
//   390px light + dark: no overflow, every row button >= 44px tall, AA, menu overlay AA;
//   no console errors.
//
// Requires: dev servers up (web on [::1]:43100). Run: node e2e/qa-people.mjs
// (QA_SHOTS=1 writes screenshots to e2e/shots/people/.)
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'
import { auditSource } from './contrast-audit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots/people')
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
const nm = (label) => `People QA Person ${label} ${TS}`
const NAMES = { complete: nm('Complete'), diet: nm('Diet'), passport: nm('Passport'), nolink: nm('Nolink') }

let failures = 0
const ok = (n, x) => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }

purgeQaData()
const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
// Expected faults are tagged, not silenced (ui-verify): while `fault` is armed,
// console errors and >=400 responses go to it instead of `errors`; closeFault()
// accepts them only if every response is the one the window expects.
let fault = null
page.on('console', (m) => {
  if (m.type() !== 'error' || /favicon|sourcemap|\[vite\]|websocket/i.test(m.text())) return
  if (fault) fault.console.push(m.text())
  else errors.push(m.text())
})
function armFault(label, expectUrl) { fault = { label, expectUrl, console: [], responses: [] } }
function closeFault() {
  const f = fault
  fault = null
  const okResponses = f.responses.length === 1 && f.responses.every((r) => r.status === 404 && r.method === 'GET' && f.expectUrl.test(r.url))
  if (okResponses && f.console.length <= f.responses.length) {
    for (const c of f.console) console.log(`  [EXPECTED-FAULT ${f.label}] ${c}`)
  } else {
    errors.push(...f.console, ...f.responses.map((r) => `${r.status} ${r.method} ${r.url} (inside ${f.label})`))
  }
}

let fx
const bad = []
page.on('response', (r) => { if (r.status() >= 400 && fault) fault.responses.push({ status: r.status(), method: r.request().method(), url: r.url() }) })
page.on('response', (r) => { if (r.status() >= 400 && !fault) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (m) => (fx?.ids && Object.entries(fx.ids).find(([, v]) => v === m)?.[0]) || (fx?.trip === m ? 'trip' : m))}`) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill(EMAIL)
await page.locator('#password').fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

// ---------------------------------------------------------------- fixtures
fx = await page.evaluate(async ({ ts, names }) => {
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
  const person = async (name, fields) => { const p = await call('POST', '/api/people', { name, ...fields }); return p.person?.id || p.id }
  try {
    const trip = (await call('POST', '/api/trips', { name: `People QA ${ts}` })).trip.id
    await call('PUT', `/api/trips/${trip}`, { date_mode: 'confirmed', start_date: iso(30), end_date: iso(40), destination_mode: 'decided', destination: 'Hoi An' })
    const full = { phone: '+91 1', emergency_contact: 'x', dietary: 'veg' }
    const ids = {
      complete: await person(names.complete, full),
      diet: await person(names.diet, { phone: '+91 2', emergency_contact: 'y' }),
      passport: await person(names.passport, full),
      nolink: await person(names.nolink, full)
    }
    const tokens = {}
    for (const k of ['complete', 'diet', 'passport']) {
      await call('POST', `/api/trips/${trip}/participants`, { person_id: ids[k] })
      tokens[k] = (await call('POST', `/api/trips/${trip}/participants/${ids[k]}/link`, {})).token
      await call('PUT', '/api/participant/profile', {}, tokens[k])
    }
    const f = new FormData()
    f.append('file', new Blob(['%PDF-1.4 qa'], { type: 'application/pdf' }), 'passport.pdf')
    f.append('doc_type', 'passport')
    f.append('expiry_date', iso(35))
    await call('POST', `/api/people/${ids.passport}/documents`, f)
    await call('POST', `/api/trips/${trip}/participants`, { person_id: ids.nolink })
    return { trip, ids, tokens }
  } catch (e) { return { err: e.message } }
}, { ts: TS, names: NAMES })

async function audit(label, scheme) {
  const a = await page.evaluate(auditSource({ detectLightSurfaces: scheme === 'dark' }))
  const dark = await page.evaluate(() => document.documentElement.classList.contains('app-dark'))
  if (dark !== (scheme === 'dark')) return fail(`${label} ${scheme}: scheme applied`, `app-dark=${dark}`)
  if (a.lowContrast.length) fail(`${label} ${scheme}: text meets AA`, a.lowContrast.slice(0, 6).map((c) => `${c.sel} "${c.text}" ${c.ratio}:1`).join('; '))
  if (a.lightSurfaces.length) fail(`${label} ${scheme}: no stranded light surface`, a.lightSurfaces.map((s) => s.sel).join(', '))
  if (!a.lowContrast.length && !a.lightSurfaces.length) ok(`${label} ${scheme}: AA, scheme`)
}

const links = () => page.evaluate(async (trip) => (await (await fetch(`/api/trips/${trip}/links`, { credentials: 'include' })).json()).links, fx.trip)
const activeOf = (all, pid) => all.filter((l) => l.person_id === pid && !l.revoked_at)
const readClip = () => page.evaluate(() => navigator.clipboard.readText().catch((e) => `ERR ${e.message}`))
const setClip = (t) => page.evaluate((x) => navigator.clipboard.writeText(x), t)
const card = (name) => page.locator('.participant-card').filter({ has: page.locator('.participant-name', { hasText: name }) })
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
// wait for the clipboard to hold a /p/ URL different from `stale`
async function clipChanged(stale, ms = 4000) {
  const end = Date.now() + ms
  let v = ''
  while (Date.now() < end) { v = await readClip(); if (v !== stale && /\/p\//.test(v)) return v; await page.waitForTimeout(100) }
  return v
}
async function copyFor(name) {
  const b = card(name).getByRole('button', { name: `Copy ${name}'s link` })
  if (!(await b.isVisible().catch(() => false))) return false
  await b.click({ timeout: 5000 })
  // A Replace dialog on Copy means Copy is about to revoke (D1). Note it and
  // dismiss it, so the caller can fail by name instead of a later click timing out.
  const d = page.locator('.p-confirmdialog')
  copyFor.dialog = await d.first().waitFor({ state: 'visible', timeout: 500 }).then(() => true, () => false)
  if (copyFor.dialog) { await page.keyboard.press('Escape'); await d.first().waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {}) }
  return true
}
async function openMenu(name) {
  const b = card(name).locator(`button[aria-label="More actions for ${name}"]`)
  if (!(await b.isVisible().catch(() => false))) { fail(`⋯ button for ${name}`, 'not found'); return null }
  await b.click({ timeout: 3000 }).catch((e) => { fail(`⋯ click for ${name}`, e.message.split('\n')[0]) })
  const item = page.locator('.p-menu-item').first()
  if (!(await item.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false))) { fail(`⋯ menu for ${name} opens`, 'no .p-menu-item'); return null }
  return page.locator('.p-menu-item')
}
const menuItem = (name) => page.locator('.p-menu-item').filter({ hasText: name })
const dialog = (name) => page.locator('.p-dialog, .p-confirmdialog').filter({ hasText: `Replace ${name}'s link?` })

let diet = {}
if (fx.err) fail('fixtures', fx.err)
else {
  await page.evaluate(() => localStorage.setItem('tripper:theme', 'light'))
  await page.goto(`${BASE}/trips/${fx.trip}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  // ------------------------------------------- Overview side of 1 and 2
  const ov = await page.evaluate(() => [...document.querySelectorAll('.missing-card [data-person-row]')].map((r) => ({
    name: r.querySelector('.overview-row-name')?.textContent.trim() || null,
    reason: r.querySelector('.overview-row-reason')?.textContent.replace(/\s+/g, ' ').trim() || null
  })))
  const badgeLink = page.locator('a[href$="/people"]').filter({ has: page.locator('.trip-nav-badge') })
  if (!(await badgeLink.first().isVisible().catch(() => false))) fail('1: People nav link with badge present', 'no a[href$="/people"] .trip-nav-badge')
  else {
    const badgeOv = Number((await badgeLink.first().locator('.trip-nav-badge').textContent()).trim())
    await badgeLink.first().click()
    await page.waitForURL(/\/people$/, { timeout: 5000 }).catch(() => {})
    await page.waitForSelector('.participant-card', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
    if (!/\/people$/.test(page.url())) fail('1: nav click reaches People', page.url())
    const pe = await page.evaluate(() => ({
      cards: document.querySelectorAll('.participant-card').length,
      tagged: [...document.querySelectorAll('.participant-card')].filter((c) => c.querySelector('[data-missing]')).map((c) => ({
        name: c.querySelector('.participant-name')?.textContent.trim() || null,
        tag: c.querySelector('[data-missing]').textContent.trim(),
        reason: c.querySelector('p.participant-reason')?.textContent.replace(/\s+/g, ' ').trim() || null
      })),
      badge: Number(document.querySelector('a[href$="/people"] .trip-nav-badge')?.textContent.trim())
    }))
    const ovNames = ov.map((r) => r.name).sort()
    const peNames = pe.tagged.map((r) => r.name).sort()
    if (pe.cards !== 4) fail('1: People lists all four participants', `cards=${pe.cards}`)
    if (!ov.length || !pe.tagged.length) fail('1: some people are Missing', `overview=${ov.length} people=${pe.tagged.length}`)
    else if (JSON.stringify(ovNames) !== JSON.stringify(peNames) || pe.badge !== peNames.length || badgeOv !== peNames.length) {
      fail('1: one number (People tags = Overview rows = badge)', `people=${JSON.stringify(peNames)} overview=${JSON.stringify(ovNames)} badge(people)=${pe.badge} badge(overview)=${badgeOv}`)
    } else ok('1: one number (People tags = Overview rows = badge)', `${peNames.length}`)
    if (!pe.tagged.every((t) => t.tag === 'Missing')) fail('1: tag text is "Missing"', JSON.stringify(pe.tagged.map((t) => t.tag)))
    if (!pe.tagged.some((t) => t.name === NAMES.diet)) fail('1: Diet is tagged Missing', JSON.stringify(peNames))
    if (!pe.tagged.some((t) => t.name === NAMES.passport)) fail('1: Passport is tagged Missing', JSON.stringify(peNames))

    // 2: same reason
    if (!pe.tagged.length) fail('2: same reason', 'no tagged rows to compare')
    else {
      let fx
const bad = []
      for (const t of pe.tagged) {
        const o = ov.find((r) => r.name === t.name)
        if (!o) { bad.push(`${t.name}: not on Overview`); continue }
        if (!t.reason || !o.reason || t.reason !== o.reason) bad.push(`${t.name}: people="${t.reason}" overview="${o.reason}"`)
      }
      if (bad.length) fail('2: People reason = Overview reason', bad.join('; '))
      else ok('2: People reason = Overview reason')
    }
  }

  // ------------------------------------------------ 3: Complete untagged
  if (!(await card(NAMES.complete).first().isVisible().catch(() => false))) fail('3: Complete row present', 'no card')
  else {
    const c3 = await page.evaluate((name) => {
      const c = [...document.querySelectorAll('.participant-card')].find((x) => x.querySelector('.participant-name')?.textContent.includes(name))
      const bits = [document.body.innerText]
      document.querySelectorAll('[aria-label]').forEach((e) => bits.push(e.getAttribute('aria-label')))
      document.querySelectorAll('img[alt]').forEach((e) => bits.push(e.getAttribute('alt')))
      const m = /link active|no link|profile unconfirmed|invite/i.exec(bits.join('\n'))
      return { tagged: !!c.querySelector('[data-missing]'), jargon: m ? m[0] : null }
    }, NAMES.complete)
    if (c3.tagged) fail('3: Complete person is untagged', 'has [data-missing]')
    else ok('3: Complete person is untagged')
    if (c3.jargon) fail('3: no link-state jargon', `found "${c3.jargon}"`)
    else ok('3: no link-state jargon')
  }
  if (SHOOT) await page.screenshot({ path: path.join(shots, 'people-390-light.png'), fullPage: true })

  // ----------------------------------------------- 4: copy never revokes
  const before = await links()
  const dietLink = activeOf(before, fx.ids.diet)
  const wantUrl = `/p/${fx.tokens.diet}`
  if (dietLink.length !== 1) fail('4: Diet has one active link before Copy', `n=${dietLink.length}`)
  await setClip('')
  const c1 = await copyFor(NAMES.diet)
  if (!c1) fail('4: Copy button for Diet', 'not found')
  else if (copyFor.dialog) fail('4: Copy never asks to replace (D1)', 'a Replace dialog opened on Copy')
  else {
    const u1 = await clipChanged('')
    await setClip('')
    await page.waitForTimeout(300)
    const c2 = await copyFor(NAMES.diet)
    if (!c2) fail('4: second Copy click', 'button gone')
    const u2 = await clipChanged('')
    const after = await links()
    const dialogShown = await page.locator('.p-confirmdialog:visible').count()
    diet.url = u1
    if (!u1.endsWith(wantUrl) || !u2.endsWith(wantUrl)) fail('4: Copy puts the minted /p/ URL on the clipboard both times', `want …${wantUrl}; got1=${u1}; got2=${u2}`)
    else if (u1 !== u2) fail('4: both copies identical', `${u1} vs ${u2}`)
    else ok('4: Copy puts the minted /p/ URL on the clipboard both times')
    const revoked = after.filter((l) => l.person_id === fx.ids.diet && l.revoked_at)
    if (activeOf(after, fx.ids.diet).length !== dietLink.length || revoked.length || after.length !== before.length) {
      fail('4: Copy never revokes', `active ${dietLink.length}→${activeOf(after, fx.ids.diet).length}, revoked=${revoked.length}, total ${before.length}→${after.length}`)
    } else ok('4: Copy never revokes')
    if (dialogShown) fail('4: Copy on an active link shows no dialog', `${dialogShown} dialog(s)`)
  }

  // ------------------------------- 5: no link → mints without a dialog
  const b5 = await links()
  if (activeOf(b5, fx.ids.nolink).length !== 0) fail('5: Nolink starts without a link', `n=${activeOf(b5, fx.ids.nolink).length}`)
  await setClip('')
  // useCopyLink re-reads before minting (D1: never revoke a link the page
  // doesn't know about); for a person with none the server answers 404
  // NO_RECOVERABLE_LINK by design, which Chrome logs. Expected exactly once.
  armFault('5: Nolink re-read', new RegExp(`/api/trips/${fx.trip}/participants/${fx.ids.nolink}/link$`))
  if (!(await copyFor(NAMES.nolink))) { closeFault(); fail('5: Copy button for Nolink', 'not found') }
  else {
    const sawDialog = copyFor.dialog
    const u5 = await clipChanged('')
    await page.waitForTimeout(300)
    closeFault()
    const a5 = await links()
    if (sawDialog) fail('5: Copy with no link shows no dialog', 'dialog visible')
    else ok('5: Copy with no link shows no dialog')
    if (!/\/p\/[\w-]+$/.test(u5)) fail('5: clipboard holds a /p/ URL', JSON.stringify(u5))
    else ok('5: clipboard holds a /p/ URL')
    if (activeOf(a5, fx.ids.nolink).length !== 1) fail('5: Nolink now has exactly one active link', `n=${activeOf(a5, fx.ids.nolink).length}`)
    else ok('5: Nolink now has exactly one active link')
    await page.waitForTimeout(400)

    // --------------------- 5b: Replace link right after a mint must ask
    const nlActive = activeOf(a5, fx.ids.nolink)
    if (await openMenu(NAMES.nolink)) {
      const ri = menuItem('Replace link')
      if (!(await ri.first().isVisible().catch(() => false))) {
        fail('5b: ⋯ menu offers "Replace link" right after Copy minted a link', `items: ${(await page.locator('.p-menu-item').allTextContents()).join(' | ')}`)
        await page.keyboard.press('Escape')
      } else {
        await ri.first().locator('.p-menu-item-content').click()
        const d = dialog(NAMES.nolink)
        if (!(await d.first().waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false))) {
          await page.waitForTimeout(2500)
          fail('5b: Replace dialog appears within 2s', `none by 2s; dialogs visible 2.5s later: ${JSON.stringify(await page.locator('.p-dialog:visible').allInnerTexts())}`)
          await page.keyboard.press('Escape')
          await page.waitForTimeout(500)
        }
        else {
          ok('5b: Replace dialog appears right after a mint')
          await setClip('')
          const cancel = d.first().getByRole('button', { name: /cancel|no|keep/i })
          if (!(await cancel.first().isVisible().catch(() => false))) fail('5b: dialog has a Cancel button', 'none')
          else {
            await cancel.first().click()
            await page.waitForTimeout(600)
            const a5b = await links()
            const clip = await readClip()
            if (activeOf(a5b, fx.ids.nolink).length !== 1 || activeOf(a5b, fx.ids.nolink)[0].id !== nlActive[0]?.id) fail('5b: Cancel leaves the link unrevoked', `active=${JSON.stringify(activeOf(a5b, fx.ids.nolink).map((l) => l.id))} want ${nlActive[0]?.id}`)
            else ok('5b: Cancel leaves the link unrevoked')
            if (clip) fail('5b: Cancel copies nothing', clip)
          }
        }
      }
    }
  }

  // --------------------- 6: Replace asks, then revokes and copies new
  const b6 = await links()
  const oldDiet = activeOf(b6, fx.ids.diet)
  if (await openMenu(NAMES.diet)) {
    const ri = menuItem('Replace link')
    if (!(await ri.first().isVisible().catch(() => false))) fail('6: Diet menu has "Replace link"', 'missing')
    else {
      await ri.first().locator('.p-menu-item-content').click()
      const d = dialog(NAMES.diet)
      if (!(await d.first().waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false))) fail('6: Replace dialog appears within 2s', 'no dialog')
      else {
        ok('6: Replace dialog appears')
        if (SHOOT) await page.screenshot({ path: path.join(shots, 'people-390-light-replace-dialog.png') })
        await setClip('')
        const acc = d.first().getByRole('button', { name: /^replace$/i })
        if (!(await acc.first().isVisible().catch(() => false))) fail('6: dialog has a Replace button', 'none')
        else {
          await acc.first().click()
          const u6 = await clipChanged('')
          const a6 = await links()
          if (!/\/p\/[\w-]+$/.test(u6) || u6 === diet.url || u6.endsWith(`/p/${fx.tokens.diet}`)) fail('6: clipboard holds a NEW /p/ URL', `old=${diet.url} new=${u6}`)
          else ok('6: clipboard holds a NEW /p/ URL')
          const oldNow = a6.find((l) => l.id === oldDiet[0]?.id)
          const act = activeOf(a6, fx.ids.diet)
          if (!oldNow?.revoked_at || act.length !== 1 || act[0].id === oldDiet[0]?.id) fail('6: old link revoked, one new active', `old.revoked=${oldNow?.revoked_at} active=${act.length}`)
          else ok('6: old link revoked, one new active')
        }
      }
    }
  }

  // --------------------------------------------------- 7: phone light + dark
  const qrName = NAMES.complete
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((s) => localStorage.setItem('tripper:theme', s), scheme)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.participant-card', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
    const m = await page.evaluate(() => {
      const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' }
      return [...document.querySelectorAll('.participant-card')].map((c, i) => ({
        i,
        name: c.querySelector('.participant-name')?.textContent.trim(),
        buttons: [...c.querySelectorAll('button')].filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 40), h: Math.round(r.height * 10) / 10, l: Math.round(r.left), r: Math.round(r.right) } })
      }))
    })
    const ovf = await overflow()
    if (ovf > 1) fail(`7 ${scheme}: no horizontal overflow`, `${ovf}px`)
    else ok(`7 ${scheme}: no horizontal overflow`)
    if (m.length !== 4) fail(`7 ${scheme}: four rows`, `n=${m.length}`)
    const short = m.flatMap((r) => r.buttons.filter((b) => b.h < 44).map((b) => `${r.name?.replace(/People QA Person | \d+$/g, '')}: "${b.t}" ${b.h}px`))
    const noCopy = m.filter((r) => !r.buttons.some((b) => /^Copy /.test(b.t))).map((r) => r.name)
    const noMore = m.filter((r) => !r.buttons.some((b) => /^More actions/.test(b.t))).map((r) => r.name)
    if (noCopy.length || noMore.length) fail(`7 ${scheme}: every row has visible Copy and ⋯`, `noCopy=${noCopy.length} noMore=${noMore.length}`)
    if (short.length) fail(`7 ${scheme}: every row button >= 44px tall`, short.join('; '))
    else if (m.length) ok(`7 ${scheme}: every row button >= 44px tall`, `${m.reduce((n, r) => n + r.buttons.length, 0)} buttons`)
    const first = m[0]
    const fc = first?.buttons.find((b) => /^Copy /.test(b.t))
    const fm = first?.buttons.find((b) => /^More actions/.test(b.t))
    if (!fc || !fm) fail(`7 ${scheme}: first row Copy and ⋯ visible`, JSON.stringify(first))
    else if (fc.l < 0 || fc.r > 390 || fm.l < 0 || fm.r > 390) fail(`7 ${scheme}: first row Copy and ⋯ inside 390px`, `copy ${fc.l}-${fc.r}, more ${fm.l}-${fm.r}`)
    else ok(`7 ${scheme}: first row Copy and ⋯ inside 390px`, `copy ${fc.l}-${fc.r}, more ${fm.l}-${fm.r}`)
    await audit('people 390', scheme)
    if (SHOOT) await page.screenshot({ path: path.join(shots, `people-390-${scheme}.png`), fullPage: true })

    // menu open (teleported overlay)
    if (await openMenu(qrName)) {
      await page.waitForTimeout(300)
      await audit('people 390 ⋯ menu open', scheme)
      if (SHOOT) await page.screenshot({ path: path.join(shots, `people-390-${scheme}-menu.png`) })
      const qi = menuItem('Show QR code')
      if (!(await qi.first().isVisible().catch(() => false))) fail(`7 ${scheme}: menu has Show QR code`, 'missing')
      else {
        await qi.first().locator('.p-menu-item-content').click()
        const img = page.locator(`.link-qr img[alt="QR code for ${qrName}'s link"]`)
        if (!(await img.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false))) fail(`7 ${scheme}: QR panel shows`, 'no .link-qr img')
        else {
          await page.waitForTimeout(300)
          const nat = await img.first().evaluate((i) => i.naturalWidth)
          if (!nat) fail(`7 ${scheme}: QR image loaded`, 'naturalWidth 0')
          else ok(`7 ${scheme}: QR panel shows a loaded image`)
          const ovq = await overflow()
          if (ovq > 1) fail(`7 ${scheme}: no overflow with QR open`, `${ovq}px`)
          await audit('people 390 QR open', scheme)
          if (SHOOT) await page.screenshot({ path: path.join(shots, `people-390-${scheme}-qr.png`), fullPage: true })
        }
      }
    }
  }
}

if (errors.length) fail('8: no console errors', errors.slice(0, 5).join(' | ') + (bad.length ? ` [failed requests: ${bad.join(', ')}]` : ''))
else ok('8: no console errors')
await page.evaluate(() => localStorage.removeItem('tripper:theme')).catch(() => {})
await browser.close()
purgeQaData()
console.log(failures ? `PEOPLE QA FAILED (${failures})` : 'PEOPLE QA OK')
process.exit(failures ? 1 : 0)
