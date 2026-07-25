// Focused QA gate for the DateField (PrimeVue DatePicker) rollout: visits all six
// date surfaces, EXERCISES the picker (open panel, click a day, type a date), and
// proves the ISO value round-trips through a save + reload with no day shift.
//
// Requires: dev servers already up. Web binds IPv6-only on 5174 and a corporate
// http_proxy hijacks `localhost`, so the base URL must be http://[::1]:5174 and
// Chromium is launched with --no-proxy-server.
// Run: node e2e/qa-datepicker.mjs
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots')
mkdirSync(shots, { recursive: true })

// Prefer the newest cached chromium headless shell; fall back to system Chrome.
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

const BASE = process.env.BASE_URL || 'http://[::1]:5174'
// A document row needs a file, so expiry persistence needs something to upload.
const UPLOAD_FILE = path.join(shots, 'qa-upload.txt')
if (!existsSync(UPLOAD_FILE)) writeFileSync(UPLOAD_FILE, 'QA document placeholder for expiry-date persistence\n')
// Two extra fixture files, so "a second, DIFFERENT file" and "the exact same
// file again" are distinguishable cases rather than the same one twice.
const UPLOAD_FILE_A = path.join(shots, 'qa-upload-a.txt')
const UPLOAD_FILE_B = path.join(shots, 'qa-upload-b.txt')
if (!existsSync(UPLOAD_FILE_A)) writeFileSync(UPLOAD_FILE_A, 'QA sequential-upload fixture A\n')
if (!existsSync(UPLOAD_FILE_B)) writeFileSync(UPLOAD_FILE_B, 'QA sequential-upload fixture B\n')
const consoleErrors = []
let failures = 0
const notes = []
// One test deliberately aborts the upload request to prove a FAILED upload does
// not clear the file selection. That injected failure legitimately logs console
// noise, so it is tagged while the fault is armed — tagged, not dropped: the
// messages are still printed, they just do not count as unexpected errors.
let faultWindow = null

function ok(name, extra) { console.log(`ok - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }
function note(s) { notes.push(s); console.log(`  · ${s}`) }

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})
function wire(p, tag) {
  const mark = () => (faultWindow ? `[EXPECTED-FAULT ${faultWindow}] ` : '')
  p.on('pageerror', (e) => consoleErrors.push(`${mark()}${tag} pageerror: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${mark()}${tag} ${m.text()} (${m.location()?.url || ''})`) })
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
wire(page, 'desktop')

async function shot(name, opts = {}) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: opts.fullPage !== false })
}
async function viewportShot(p, name) {
  await p.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false })
}

// ---------- picker helpers ----------

// The panel is teleported to <body> by PrimeVue, so find it globally.
function panelOf(p) { return p.locator('.p-datepicker-panel').first() }

// icon-display="input" renders the trigger inside the .p-datepicker wrapper as a
// sibling span of the input; it carries the onButtonClick handler.
function iconFor(inputLocator) {
  return inputLocator.locator('xpath=following-sibling::*[contains(@class,"p-datepicker-input-icon")]').first()
}

// :show-on-focus="false" stops the panel opening on focus (the point: tabbing
// through a form must not pop a calendar). But the same prop also gates
// onInputClick — primevue/datepicker/index.mjs:2333 reads
// `if (this.showOnFocus && this.isEnabled() && !this.overlayVisible)` — so it
// silently removes the click-the-field affordance too. Rather than let that one
// regression cascade into ~40 bogus failures and cost us the geometry /
// persistence / timezone signal, open via the icon as a fallback and record how
// the panel actually had to be opened. assertOpenPaths() is what fails on it,
// once, loudly.
let inputClickOpensPanel = null
const openViaCounts = { input: 0, icon: 0 }

async function tryOpen(p, inputLocator, label) {
  await inputLocator.scrollIntoViewIfNeeded()
  const panel = panelOf(p)
  await inputLocator.click()
  let opened = await panel.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)
  let via = 'input click'
  if (!opened) {
    const icon = iconFor(inputLocator)
    if (await icon.count()) {
      await icon.click({ force: true }).catch(() => {})
      opened = await panel.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
      if (opened) via = 'calendar icon'
    }
  }
  if (opened) {
    openViaCounts[via === 'input click' ? 'input' : 'icon']++
    if (inputClickOpensPanel === null) inputClickOpensPanel = via === 'input click'
  }
  return { opened, panel, via }
}

async function openPanel(p, inputLocator, label) {
  const { opened, panel, via } = await tryOpen(p, inputLocator, label)
  if (!opened) { fail(`open panel: ${label}`, 'no .p-datepicker-panel became visible by input click OR calendar-icon click') ; return null }
  if (via !== 'input click') note(`open fallback [${label}]: clicking the FIELD did nothing, had to click the calendar icon`)
  await p.waitForTimeout(350) // let the transition settle before measuring/shooting
  return panel
}

async function closePanel(p) {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
  // Escape only reaches DatePicker.onKeyDown while the input still has focus;
  // after a day click it may not, so fall back to a genuine outside click.
  if (await panelOf(p).isVisible().catch(() => false)) {
    const vp = p.viewportSize() || { width: 1280, height: 900 }
    await p.mouse.click(vp.width - 5, vp.height - 5)
    await p.waitForTimeout(250)
  }
}

// Geometry / clipping / stacking audit of the open panel.
async function auditPanel(p, panel, label) {
  const g = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const clippers = []
    let n = el.parentElement
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n)
      if (/hidden|clip|auto|scroll/.test(`${s.overflow} ${s.overflowX} ${s.overflowY}`)) {
        clippers.push(`${n.tagName.toLowerCase()}.${String(n.className || '').split(' ').slice(0, 2).join('.')}{overflow:${s.overflow}/${s.overflowX}/${s.overflowY}}`)
      }
      n = n.parentElement
    }
    const cx = r.x + r.width / 2
    const probes = [[cx, r.y + 8], [cx, r.y + r.height / 2], [cx, r.bottom - 8]]
      .filter(([, y]) => y > 0 && y < innerHeight)
      .map(([x, y]) => {
        const e = document.elementFromPoint(x, y)
        return e ? `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}` : 'null'
      })
    const insidePanel = probes.map((_, i) => {
      const [x, y] = [[cx, r.y + 8], [cx, r.y + r.height / 2], [cx, r.bottom - 8]].filter(([, yy]) => yy > 0 && yy < innerHeight)[i]
      const e = document.elementFromPoint(x, y)
      return !!(e && el.contains(e))
    })
    return {
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) },
      parent: `${el.parentElement?.tagName.toLowerCase()}.${String(el.parentElement?.className || '')}`,
      zIndex: cs.zIndex, position: cs.position, bg: cs.backgroundColor, color: cs.color,
      clippers, probes, insidePanel,
      vw: innerWidth, vh: innerHeight,
      pageH: document.documentElement.scrollHeight, scrollY: window.scrollY
    }
  })
  const r = g.rect
  note(`panel[${label}] ${r.w}x${r.h} at (${r.x},${r.y}) parent=${g.parent} z=${g.zIndex} vw=${g.vw} vh=${g.vh}`)
  if (g.clippers.length) fail(`panel clipped ancestors: ${label}`, `overflow ancestors between panel and <html>: ${g.clippers.join(', ')}`)
  else ok(`panel not inside any overflow ancestor: ${label}`)
  if (r.x < 0) fail(`panel offscreen-left: ${label}`, `x=${r.x}`)
  if (r.right > g.vw + 0.5) fail(`panel offscreen-right: ${label}`, `right=${r.right} > viewport ${g.vw}`)
  if (r.y < 0) fail(`panel offscreen-top: ${label}`, `y=${r.y}`)
  if (r.bottom > g.vh + 0.5) fail(`panel cut off at viewport bottom: ${label}`, `bottom=${r.bottom} > viewport height ${g.vh} (user must scroll to see the last week row)`)
  if (r.x >= 0 && r.right <= g.vw + 0.5 && r.y >= 0 && r.bottom <= g.vh + 0.5) ok(`panel fully inside viewport: ${label}`)
  // PrimeVue pins the panel's min-width to the DatePicker root width
  // (datepicker/index.mjs:863), so a `fluid` DateField yields a full-width
  // calendar. A month grid has no business being wider than ~26rem.
  if (r.w > 416 && r.w < g.vw) fail(`panel absurdly wide: ${label}`, `${r.w}px wide — min-width is pinned to the fluid input width, so the month grid is stretched across the whole form`)
  else if (r.w <= 416) ok(`panel width sane: ${label}`, `${r.w}px`)
  if (g.insidePanel.some((v) => v === false)) {
    fail(`panel occluded: ${label}`, `elementFromPoint at panel top/middle/bottom returned ${g.probes.join(', ')} — something renders above the panel`)
  } else ok(`panel is topmost at its own centre: ${label}`)
  return g
}

// Click a specific in-month day in the open panel and return the ISO we expect.
async function pickDay(p, panel, dayNum, label) {
  const title = (await panel.locator('.p-datepicker-title').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  const ym = await panel.evaluate(() => {
    const t = document.querySelector('.p-datepicker-panel .p-datepicker-title')
    return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''
  })
  const cells = panel.locator('td:not(.p-datepicker-other-month) > span, td:not(.p-datepicker-other-month) > div')
  const target = cells.filter({ hasText: new RegExp(`^\\s*${dayNum}\\s*$`) }).first()
  const n = await target.count()
  if (!n) { fail(`pick day ${dayNum}: ${label}`, `no in-month cell with text "${dayNum}" (panel title="${title || ym}")`); return null }
  const disabled = await target.evaluate((el) => el.className.includes('p-disabled') || el.closest('td')?.getAttribute('data-p-disabled') === 'true').catch(() => false)
  if (disabled) { fail(`pick day ${dayNum}: ${label}`, 'that day is disabled') ; return null }
  await target.click()
  await p.waitForTimeout(250)
  return { title: title || ym }
}

// Parse "Month YYYY" (or "Month" + separate year buttons) from the panel title.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function isoFromTitle(title, day) {
  const mi = MONTHS.findIndex((m) => new RegExp(m, 'i').test(title))
  const y = /(\d{4})/.exec(title)?.[1]
  if (mi < 0 || !y) return null
  return `${y}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Read the panel header as {month:1-12, year}.
async function readTitle(panel) {
  const t = (await panel.locator('.p-datepicker-title').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  const mi = MONTHS.findIndex((mm) => new RegExp(mm, 'i').test(t))
  return { text: t, month: mi + 1, year: Number(/(\d{4})/.exec(t)?.[1]) || 0 }
}

// TYPING IS DELIBERATELY IMPOSSIBLE. DateField.vue sets :manual-input="false",
// which makes DatePicker render the input `readonly`
// (datepicker/index.mjs:2911 → `readonly: !manualInput || readonly`). The old
// keyboard path silently corrupted the model: DatePicker reformats the field the
// instant the typed text parses, without restoring the caret, so key-by-key
// "2026-11-27" normalised at "2026-11-2" and settled on Nov *2*. So the contract
// under test is now the opposite of before — every keystroke, and a real paste,
// must be a NO-OP that leaves the already-picked date exactly as it was, never a
// partial or wrong date.
async function assertTypingBlocked(p, inputLocator, iso, label) {
  await inputLocator.scrollIntoViewIfNeeded()
  const before = await inputLocator.inputValue()
  const ro = await inputLocator.evaluate((el) => ({ readOnly: el.readOnly, attr: el.getAttribute('readonly') }))
  if (!ro.readOnly) {
    fail(`input readonly (keyboard path closed): ${label}`, `readOnly=${ro.readOnly} attr=${JSON.stringify(ro.attr)} — the field still accepts typing, which is exactly how 2026-11-27 became 2026-11-02`)
  } else ok(`input readonly (keyboard path closed): ${label}`)

  await inputLocator.click()
  await p.waitForTimeout(150)
  // clear-then-type, the way a real user retypes over an existing value
  await p.keyboard.press('ControlOrMeta+a')
  await p.keyboard.press('Backspace')
  const steps = []
  for (const ch of iso) {
    await p.keyboard.type(ch)
    await p.waitForTimeout(30)
    steps.push(await inputLocator.inputValue())
  }
  // the other keyboard route into a text field: an IME/paste-style text insert
  await p.keyboard.insertText(iso)
  await p.waitForTimeout(150)
  // The old harness had a "paste-style input accepted (contrast)" check that used
  // page.fill() to prove the *value* path was sound even though key-by-key typing
  // corrupted it. With manual-input off there is no honest way to assert that any
  // more — fill() is not a user gesture, and asserting it still writes the value
  // would be asserting that the closed keyboard path is secretly open. So the
  // check is inverted into its honest form: Playwright refuses to fill a
  // non-editable element, and that refusal IS the guarantee. A timeout is passed
  // so the expected failure costs ~1.5s instead of the 30s default.
  const fillErr = await inputLocator.fill(iso, { timeout: 1500 }).then(() => null).catch((e) => String(e.message || e))
  if (fillErr === null) {
    fail(`programmatic fill rejected (not editable): ${label}`, `locator.fill("${iso}") succeeded — the input is still editable, so the corrupting keyboard path is not actually closed`)
  } else if (/not editable|element is readonly|readonly/i.test(fillErr)) {
    ok(`programmatic fill rejected (not editable): ${label}`)
  } else {
    fail(`programmatic fill rejected (not editable): ${label}`, `fill() failed, but not because the element is non-editable: ${fillErr.split('\n')[0]}`)
  }
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  // blur so the control settles the way it would for a user tabbing away
  await p.keyboard.press('Tab')
  await p.waitForTimeout(300)
  const after = await inputLocator.inputValue()
  const mutated = [...new Set(steps)].filter((v) => v !== before)
  if (mutated.length) note(`keystroke trace [${label}]: field mutated mid-typing → ${mutated.slice(0, 8).map((v) => JSON.stringify(v)).join(' → ')}`)
  if (after !== before) {
    fail(`typing + paste are a no-op: ${label}`, `field read ${JSON.stringify(before)} before, typed+pasted "${iso}", now reads ${JSON.stringify(after)} — a closed keyboard path must never change the value, least of all to a partial or wrong date`)
  } else ok(`typing + paste are a no-op, picked date intact: ${label}`, JSON.stringify(before))
  return after
}

// DateField gained a `typeable` mode (DateField.vue:96-115): expiry fields render
// a PrimeVue InputMask instead of a DatePicker, because an expiry is read off a
// document rather than browsed for. Those fields have no panel, no readonly and no
// calendar icon, so the picker contract simply does not apply to them — detect the
// mode rather than asserting a contract the component no longer has.
async function isTypeable(inputLocator) {
  return inputLocator.evaluate((el) => !el.classList.contains('p-datepicker-input') && !el.closest('.p-datepicker'))
}

// The masked contract is the INVERSE of the picker's: typing must work, and must
// work *correctly* — which is precisely what DatePicker's own manualInput could not
// do. The original defect was that the field reformatted under the caret mid-entry
// and silently settled on a different date (2026-11-27 -> 2026-11-02), so the
// assertions that matter are: the final text is exactly what was typed, no
// intermediate state was ever a COMPLETE-but-different date, and an impossible
// date is rejected rather than rolled over (Feb 31 -> Mar 3).
async function clearField(p, inputLocator) {
  await inputLocator.click()
  await p.keyboard.press('ControlOrMeta+a')
  await p.keyboard.press('Backspace')
  await p.waitForTimeout(120)
}

// type the 8 digits of an ISO date one key at a time, recording every
// intermediate field state so a mid-entry "settle" on a different date is caught
async function typeMasked(p, inputLocator, iso, delay) {
  await clearField(p, inputLocator)
  const steps = []
  let keys = 0
  for (const ch of iso.replace(/-/g, '')) {
    await p.keyboard.type(ch); keys++
    await p.waitForTimeout(delay)
    steps.push(await inputLocator.inputValue())
  }
  await p.waitForTimeout(200)
  return { final: await inputLocator.inputValue(), steps, keys }
}

async function assertMaskedDate(p, inputLocator, label) {
  const shape = await inputLocator.evaluate((el) => ({
    readOnly: el.readOnly,
    inputMode: el.getAttribute('inputmode'),
    inPicker: !!el.closest('.p-datepicker'),
    placeholder: el.getAttribute('placeholder'),
    h: +el.getBoundingClientRect().height.toFixed(1)
  }))
  note(`masked field [${label}]: ${JSON.stringify(shape)}`)
  if (shape.readOnly) fail(`masked field is typeable: ${label}`, 'the input is readonly, so the whole point of typeable mode is lost')
  else ok(`masked field is typeable (not readonly): ${label}`)
  if (shape.inPicker) fail(`no calendar picker on the expiry field: ${label}`, 'the input is still inside a .p-datepicker wrapper — typeable mode did not replace the picker')
  else ok(`no calendar picker on the expiry field: ${label}`)
  if (shape.inputMode !== 'numeric') fail(`inputmode=numeric on the expiry field: ${label}`, `inputmode is ${JSON.stringify(shape.inputMode)} — mobile will raise the full keyboard instead of the numeric keypad`)
  else ok(`inputmode=numeric (numeric keypad on mobile): ${label}`)

  // The corruption scenario, at two typing speeds. 2035-04-30 is the passport
  // case; the others are dates that used to settle wrong under manualInput;
  // 2028-02-29 is a real leap day and must be ACCEPTED.
  for (const iso of ['2035-04-30', '2030-01-31', '2026-12-31', '2027-03-15', '2028-02-29']) {
    for (const delay of [25, 120]) {
      const r = await typeMasked(p, inputLocator, iso, delay)
      const badSettle = r.steps.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== iso)
      if (r.final !== iso) {
        fail(`masked typing @${delay}ms lands ${iso}: ${label}`, `field reads ${JSON.stringify(r.final)} after typing the 8 digits of ${iso}${badSettle.length ? ` (settled mid-entry on ${[...new Set(badSettle)].join(', ')})` : ''}`)
      } else if (badSettle.length) {
        fail(`no wrong date settles mid-entry @${delay}ms (${iso}): ${label}`, `intermediate states parsed as complete dates other than ${iso}: ${[...new Set(badSettle)].map((s) => JSON.stringify(s)).join(', ')} — the caret-jump corruption class is back`)
      } else {
        ok(`masked typing @${delay}ms lands ${iso} exactly: ${label}`, `${r.keys} keystrokes`)
      }
    }
  }

  // impossible date that still satisfies 9999-99-99 → inline error, nothing emitted
  const errEl = p.locator('.date-field-error').first()
  for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '2027-02-29']) {
    await typeMasked(p, inputLocator, bad, 30)
    await p.waitForTimeout(300)
    const vis = await errEl.isVisible().catch(() => false)
    const role = vis ? await errEl.getAttribute('role').catch(() => null) : null
    if (vis) ok(`impossible date rejected (${bad}): ${label}`, `inline error shown, role=${role}`)
    else fail(`impossible date rejected (${bad}): ${label}`, `no .date-field-error for ${bad} — the mask accepts the shape and Date() would silently roll it over`)
  }
  // correcting it must clear the error
  await typeMasked(p, inputLocator, '2026-02-28', 30)
  await p.waitForTimeout(350)
  if (await errEl.isVisible().catch(() => false)) fail(`correcting to a real date clears the error: ${label}`, 'the inline error is still showing for a valid 2026-02-28')
  else ok(`correcting to a real date clears the error: ${label}`, '2026-02-28')

  // incomplete + blur → autoClear must wipe it, so no partial can be saved
  await clearField(p, inputLocator)
  for (const ch of '2026') { await p.keyboard.type(ch); await p.waitForTimeout(30) }
  const midEntry = await inputLocator.inputValue()
  await p.keyboard.press('Tab')
  await p.waitForTimeout(400)
  const afterBlur = await inputLocator.inputValue()
  if (/\d/.test(afterBlur)) fail(`incomplete entry is cleared on blur: ${label}`, `typed a partial "${midEntry}" and after blur the field still holds ${JSON.stringify(afterBlur)} — a partial date must never survive to be saved`)
  else ok(`incomplete entry is cleared on blur (autoClear): ${label}`, `${JSON.stringify(midEntry)} → ${JSON.stringify(afterBlur)}`)
}

// ---------------------------------------------------------------------------
// FIX-VERIFICATION HELPERS. Four fixes are the point of this run; everything
// else in this file is the regression sweep they must not break.
//   1. the invalid ring went teal while the field was focused
//   2. showing the inline error shoved the Upload button down
//   3. `new Date(doc.expiry_date) < new Date()` parsed a bare YYYY-MM-DD as UTC
//      midnight, so a document expiring TODAY read as expired west of Greenwich
// ---------------------------------------------------------------------------
const TEAL = 'rgb(15, 118, 110)' // --app-primary #0f766e, web/src/assets/main.css:14
function rgbOf(c) { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(c || '')); return m ? [+m[1], +m[2], +m[3]] : null }
function isRedish(c) { const v = rgbOf(c); return !!v && v[0] > 150 && v[0] - v[1] > 50 && v[0] - v[2] > 50 }
function isTeal(c) { const v = rgbOf(c); return !!v && v[1] > v[0] && Math.abs(v[1] - v[2]) < 30 && v[0] < 120 }

// The whole point of fix 1 is a COMPUTED value in a compound state, so read the
// resolved border/shadow off the live element rather than trusting the stylesheet.
async function readRing(p, sel) {
  return p.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      focused: document.activeElement === el,
      classes: String(el.className || ''),
      pInvalid: el.classList.contains('p-invalid'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      dataPInvalid: el.getAttribute('data-p-invalid'),
      // a missing data-v-* attribute would mean DateField's *scoped* rule can
      // never match the InputMask's input at all
      scopeAttrs: [...el.attributes].map((a) => a.name).filter((n) => n.startsWith('data-v-')),
      borderColor: cs.borderTopColor,
      borderAll: cs.borderColor,
      boxShadow: cs.boxShadow,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`
    }
  }, sel)
}

async function assertInvalidFocusRing(p, sel, plainSel, label) {
  const input = p.locator(sel)
  if (!(await input.count())) { fail(`invalid focus ring: ${label}`, `no element matched ${sel}`); return null }

  // (1) FOCUSED *and* INVALID simultaneously — the one state where main.css's
  // `.field input:focus { border-color: var(--app-primary) }` used to win.
  await typeMasked(p, input, '2026-02-31', 25)
  await p.waitForTimeout(400)
  let r = await readRing(p, sel)
  if (!r.focused) { await input.click(); await p.waitForTimeout(300); r = await readRing(p, sel) }
  note(`ring FOCUSED+INVALID [${label}]: focused=${r.focused} p-invalid=${r.pInvalid} border=${r.borderColor} shadow=${r.boxShadow} outline=${r.outline} scopeAttrs=${JSON.stringify(r.scopeAttrs)}`)
  if (!r.focused) {
    fail(`invalid ring measured while focused: ${label}`, 'could not hold focus on the field while it was invalid, so the measurement would be meaningless')
  } else if (!r.pInvalid) {
    fail(`invalid ring stays RED while focused: ${label}`, `the input has no p-invalid class after typing the impossible 2026-02-31 (classes="${r.classes}") — there is no invalid state to colour`)
  } else if (r.borderColor === TEAL) {
    fail(`invalid ring stays RED while focused: ${label}`, `border-color computes to the brand teal ${TEAL} while the field is focused AND invalid — web/src/assets/main.css \`.field input:focus\` is still out-specifying web/src/components/DateField.vue \`input.p-invalid:focus\` (scope attrs on the input: ${JSON.stringify(r.scopeAttrs)})`)
  } else if (!isRedish(r.borderColor)) {
    fail(`invalid ring stays RED while focused: ${label}`, `border-color computes to ${r.borderColor} — neither teal nor red, so the error has no colour signal during the exact moment it is being corrected`)
  } else {
    ok(`invalid ring stays RED while focused: ${label}`, `border=${r.borderColor} shadow=${r.boxShadow}`)
  }

  // (2) the SAME field, valid and still focused — the teal ring must be back
  await typeMasked(p, input, '2026-02-28', 25)
  await p.waitForTimeout(400)
  let v = await readRing(p, sel)
  if (!v.focused) { await input.click(); await p.waitForTimeout(300); v = await readRing(p, sel) }
  note(`ring FOCUSED+VALID [${label}]: focused=${v.focused} p-invalid=${v.pInvalid} border=${v.borderColor} shadow=${v.boxShadow}`)
  if (v.pInvalid) fail(`a real date clears p-invalid: ${label}`, '2026-02-28 still carries the p-invalid class')
  else ok(`a real date clears p-invalid: ${label}`)
  if (isTeal(v.borderColor)) ok(`valid focused date field still shows the TEAL ring: ${label}`, v.borderColor)
  else fail(`valid focused date field still shows the TEAL ring: ${label}`, `border-color is ${v.borderColor}, expected the brand teal ${TEAL} — the invalid-ring fix reddened an ordinary focus ring`)

  // (3) an ordinary text input on the SAME form — proof the fix did not leak
  let plain = null
  if (plainSel && (await p.locator(plainSel).count())) {
    await p.locator(plainSel).click()
    await p.locator(plainSel).fill('QA-RING')
    await p.waitForTimeout(300)
    plain = await readRing(p, plainSel)
    note(`ring FOCUSED plain input ${plainSel} [${label}]: focused=${plain.focused} border=${plain.borderColor} shadow=${plain.boxShadow}`)
    if (isTeal(plain.borderColor)) ok(`ordinary focused text input on the same form is still TEAL: ${label}`, `${plainSel} ${plain.borderColor}`)
    else fail(`ordinary focused text input on the same form is still TEAL: ${label}`, `${plainSel} focus border computes to ${plain.borderColor} — the red focus ring leaked onto every input on the form`)
    await p.locator(plainSel).fill('')
  } else if (plainSel) {
    note(`no plain text input matched ${plainSel} on this surface, teal-leak control skipped`)
  }
  return { invalid: r, valid: v, plain }
}

// Fix 2. Document-absolute y (rect.top + scrollY) so a scroll caused by typing
// cannot be mistaken for a layout shift.
async function probeHintLayout(p, sel) {
  return p.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const form = el.closest('form')
    const btns = form ? [...form.querySelectorAll('button')] : []
    const btn = btns.find((b) => b.type === 'submit') || btns.find((b) => /upload/i.test(b.textContent)) || null
    const hint = form ? form.querySelector('.date-field-hint') : null
    const err = form ? form.querySelector('.date-field-error') : null
    const abs = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { y: +(r.top + window.scrollY).toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) } }
    let errBox = null
    if (err) {
      const r = err.getBoundingClientRect()
      const cs = getComputedStyle(err)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
      const text = err.textContent.replace(/\s+/g, ' ').trim()
      // Measure the copy against the room it actually has, in the element's own
      // font, so "shorten it further" can be a number rather than a guess.
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
      const textW = +ctx.measureText(text).width.toFixed(2)
      const hs = hint ? getComputedStyle(hint) : null
      const availW = hint
        ? +(hint.getBoundingClientRect().width - (parseFloat(hs.paddingLeft) || 0) - (parseFloat(hs.paddingRight) || 0)).toFixed(2)
        : null
      errBox = {
        w: +r.width.toFixed(1), h: +r.height.toFixed(1), lineHeight: cs.lineHeight,
        lines: Math.max(1, Math.round(r.height / lh)), text, chars: text.length,
        font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily.split(',')[0].replace(/["']/g, '')}`,
        textW, availW, slack: availW == null ? null : +(availW - textW).toFixed(2)
      }
    }
    return {
      btn: abs(btn), btnLabel: btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null,
      hint: abs(hint), hintMinHeight: hint ? getComputedStyle(hint).minHeight : null,
      err: errBox, errorShown: !!err, input: abs(el),
      pageH: document.documentElement.scrollHeight, vw: innerWidth, scrollY: window.scrollY
    }
  }, sel)
}

async function assertNoErrorShift(p, sel, label) {
  const input = p.locator(sel)
  if (!(await input.count())) { fail(`no layout shift when the error appears: ${label}`, `no element matched ${sel}`); return null }
  // baseline: a real date, so the error is hidden but the field is otherwise identical
  await typeMasked(p, input, '2026-02-28', 25)
  await p.waitForTimeout(450)
  const hidden = await probeHintLayout(p, sel)
  // then the impossible date that still satisfies the 9999-99-99 mask
  await typeMasked(p, input, '2026-02-31', 25)
  await p.waitForTimeout(450)
  const shown = await probeHintLayout(p, sel)
  if (!hidden?.btn || !shown?.btn) {
    fail(`no layout shift when the error appears: ${label}`, `could not locate the Upload button inside the form (hidden=${JSON.stringify(hidden?.btn)} shown=${JSON.stringify(shown?.btn)})`)
    return { hidden, shown }
  }
  const delta = +(shown.btn.y - hidden.btn.y).toFixed(1)
  note(`error-shift [${label}] vw=${hidden.vw}: "${shown.btnLabel}" button y ${hidden.btn.y} (error hidden) → ${shown.btn.y} (error shown), delta ${delta}px | hint h ${hidden.hint?.h} → ${shown.hint?.h} (min-height ${shown.hintMinHeight}) | error box ${shown.err ? `${shown.err.w}x${shown.err.h}px, ${shown.err.lines} line(s), line-height ${shown.err.lineHeight}` : 'ABSENT'} | pageH ${hidden.pageH} → ${shown.pageH}`)
  if (hidden.errorShown) fail(`the baseline really is error-free: ${label}`, 'a .date-field-error is present even for the valid 2026-02-28, so there is nothing to compare against')
  if (!shown.errorShown) fail(`the error really does show: ${label}`, 'no .date-field-error appeared for 2026-02-31, so the shift measurement is vacuous')
  if (Math.abs(delta) <= 0.5) ok(`Upload button does not move when the error appears: ${label}`, `y=${hidden.btn.y} in both states, hint reserves ${shown.hintMinHeight}`)
  else fail(`Upload button does not move when the error appears: ${label}`, `it moves ${delta}px (${hidden.btn.y} → ${shown.btn.y}) at vw=${hidden.vw}${shown.err && shown.err.lines > 1 ? ` — the message wraps to ${shown.err.lines} lines (${shown.err.h}px) and overflows` : ' — the message overflows'} the .date-field-hint min-height of ${shown.hintMinHeight}`)
  return { hidden, shown, delta }
}

// Fix 3. Compute the fixture dates from the BROWSER's own clock, never from
// hardcoded strings — the point is that the same stored string must be judged
// against the viewer's local day.
async function browserDates(p) {
  return p.evaluate(() => {
    const pad = (n) => String(n).padStart(2, '0')
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date()
    const at = (delta) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta))
    return { now: now.toString(), utc: now.toISOString(), offsetMin: now.getTimezoneOffset(), minus2: at(-2), yesterday: at(-1), today: at(0), tomorrow: at(1) }
  })
}

// The "Expired" badge is a PrimeVue Tag whose severity flips to `warn`
// (.p-tag-warn / data-p="warn") when isExpired(doc) is true.
async function readExpiryBadges(p) {
  return p.evaluate(() => [...document.querySelectorAll('table.table tbody tr')].map((tr) => {
    const tag = tr.querySelector('.p-tag')
    if (!tag) return null
    const cs = getComputedStyle(tag)
    return {
      number: tr.children[1] ? tr.children[1].textContent.replace(/\s+/g, ' ').trim() : null,
      expiry: tag.textContent.replace(/\s+/g, ' ').trim(),
      dataP: tag.getAttribute('data-p'),
      warn: tag.classList.contains('p-tag-warn'),
      secondary: tag.classList.contains('p-tag-secondary'),
      bg: cs.backgroundColor, color: cs.color
    }
  }).filter(Boolean))
}

async function assertExpiryBadges(p, label) {
  const d = await browserDates(p)
  const badges = await readExpiryBadges(p)
  note(`badge clock [${label}]: now=${d.now} (UTC ${d.utc}) getTimezoneOffset=${d.offsetMin} → yesterday=${d.yesterday} today=${d.today} tomorrow=${d.tomorrow}`)
  note(`badges [${label}]: ${JSON.stringify(badges)}`)
  if (!badges.length) { fail(`document rows present to judge the badge: ${label}`, 'no table rows with a .p-tag on this surface'); return { d, badges } }
  for (const [iso, shouldWarn, which] of [[d.yesterday, true, 'YESTERDAY'], [d.today, false, 'TODAY'], [d.tomorrow, false, 'TOMORROW']]) {
    const b = badges.find((x) => x.expiry === iso)
    if (!b) { fail(`Expired badge for ${which} (${iso}): ${label}`, `no document row carries expiry ${iso}, so this case went untested`); continue }
    if (b.warn === shouldWarn) {
      ok(`Expired badge ${shouldWarn ? 'SHOWN' : 'ABSENT'} for ${which} (${iso}): ${label}`, `severity=${b.dataP || 'secondary'} bg=${b.bg}`)
    } else if (shouldWarn) {
      fail(`Expired badge SHOWN for ${which} (${iso}): ${label}`, `an already-expired document renders severity=${b.dataP || 'secondary'} bg=${b.bg} — nothing warns the user`)
    } else {
      fail(`Expired badge ABSENT for ${which} (${iso}): ${label}`, `a document expiring ${which.toLowerCase()} is flagged expired (data-p=${b.dataP}, bg=${b.bg}) at getTimezoneOffset=${d.offsetMin} — that is the UTC-midnight parse; isExpiredIso/parseIsoDate in web/src/utils/dates.js is either not on this call site or is not comparing in local time`)
    }
  }
  // and every other row must agree with a plain local-day string comparison
  const dated = badges.filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.expiry))
  const bad = dated.filter((b) => b.warn !== (b.expiry < d.today))
  if (bad.length) fail(`every badge agrees with a local-day comparison: ${label}`, `local today=${d.today}, but these rows disagree: ${JSON.stringify(bad)}`)
  else ok(`every badge agrees with a local-day comparison: ${label}`, `${dated.length} dated row(s), local today=${d.today}`)
  return { d, badges }
}

// Uploading N documents from ONE page load needs a distinct filename each time.
// After a successful upload both DocumentList.vue and ParticipantDocs.vue reset
// their `file` ref to null but never clear the <input type=file>, so the element
// still holds the previous FileList: re-selecting the identical file fires no
// `change`, onFileChange never runs, and upload()'s `if (!file.value) return`
// silently swallows the click. Clearing the input first *and* using a fresh
// filename makes the fixture setup independent of that behaviour.
function fixtureFile(marker) {
  const f = path.join(shots, `qa-upload-${marker}.txt`)
  if (!existsSync(f)) writeFileSync(f, `QA expiry-badge fixture ${marker}\n`)
  return f
}
async function uploadDatedDoc(p, sel, iso, marker, label) {
  const fileInput = p.locator('input[type=file]').first()
  if (!(await fileInput.count())) { fail(`upload a doc expiring ${iso}: ${label}`, 'no file input on the Documents form'); return false }
  const rows = p.locator('table.table tbody tr')
  const before = await rows.count()
  await fileInput.setInputFiles([])
  await p.waitForTimeout(150)
  await fileInput.setInputFiles(fixtureFile(marker))
  await p.waitForTimeout(250)
  const num = p.locator('#doc-number')
  if (await num.count()) await num.fill(marker)
  const r = await typeMasked(p, p.locator(sel), iso, 20)
  if (r.final !== iso) { fail(`upload a doc expiring ${iso}: ${label}`, `typed the 8 digits of ${iso} but the field reads ${JSON.stringify(r.final)}`); return false }
  await p.getByRole('button', { name: /^Upload$/i }).first().click()
  await p.waitForTimeout(1900)
  const after = await rows.count()
  if (after <= before) {
    fail(`upload a doc expiring ${iso}: ${label}`, `clicked Upload with ${marker} but the document table still shows ${after} row(s) (was ${before}) — the fixture was never created, so the badge case below cannot be judged`)
    return false
  }
  ok(`fixture document uploaded (${marker} expires ${iso}): ${label}`, `${before} → ${after} rows`)
  return true
}

// Item 2: attribute the panel that is still visible after tabbing out of Start.
// aria-controls links an input to its own panel id, so ownership is decidable
// rather than guessed, and rect intersection says what is actually covered.
async function diagnosePanelHandoff(p, startInput, endInput, label) {
  const shut = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(200); const vp = p.viewportSize() || { width: 1280, height: 900 }; if (await panelOf(p).isVisible().catch(() => false)) { await p.mouse.click(vp.width - 5, vp.height - 5); await p.waitForTimeout(250) } }
  await shut()
  await startInput.focus()
  await p.waitForTimeout(700)
  const before = await p.evaluate(() => ({
    panels: [...document.querySelectorAll('.p-datepicker-panel')].map((n) => ({ id: n.id || null, visible: !!n.offsetParent, x: +n.getBoundingClientRect().x.toFixed(1), y: +n.getBoundingClientRect().y.toFixed(1) })),
    inputs: [...document.querySelectorAll('.dwe-row .p-datepicker-input')].map((n, i) => ({ i, expanded: n.getAttribute('aria-expanded'), controls: n.getAttribute('aria-controls') }))
  }))
  note(`handoff BEFORE tab [${label}]: ${JSON.stringify(before)}`)

  await p.keyboard.press('Tab')
  await p.waitForTimeout(700)
  const after = await p.evaluate(() => {
    const panels = [...document.querySelectorAll('.p-datepicker-panel')].map((n) => { const r = n.getBoundingClientRect(); return { id: n.id || null, visible: !!n.offsetParent, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) } } })
    const inputs = [...document.querySelectorAll('.dwe-row .p-datepicker-input')].map((n, i) => ({ i, expanded: n.getAttribute('aria-expanded'), controls: n.getAttribute('aria-controls') }))
    const a = document.activeElement
    const active = { tag: a?.tagName.toLowerCase() || null, isDateInput: !!a?.classList?.contains('p-datepicker-input'), idx: [...document.querySelectorAll('.dwe-row .p-datepicker-input')].indexOf(a) }
    // what does the visible panel actually cover?
    const vis = panels.find((q) => q.visible)
    const overlaps = []
    if (vis) {
      const cands = [
        ['Note input', document.querySelector('.dwe-row input:not(.p-datepicker-input)')],
        ['Remove button', [...document.querySelectorAll('.dwe-row button')].find((b) => /remove/i.test(b.textContent))],
        ['Save windows button', [...document.querySelectorAll('button')].find((b) => /save windows/i.test(b.textContent))],
        ['Add date window button', [...document.querySelectorAll('button')].find((b) => /add date window/i.test(b.textContent))],
        ['End date input', document.querySelectorAll('.dwe-row .p-datepicker-input')[1]]
      ]
      for (const [name, el] of cands) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        const hit = !(r.right < vis.rect.x || r.x > vis.rect.right || r.bottom < vis.rect.y || r.y > vis.rect.bottom)
        if (hit) overlaps.push(name)
      }
    }
    return { panels, inputs, active, visiblePanelId: vis?.id || null, overlaps }
  })
  const visibleCount = after.panels.filter((q) => q.visible).length
  note(`handoff AFTER tab [${label}]: activeElement=${JSON.stringify(after.active)} visiblePanel=${after.visiblePanelId} panelsInDom=${after.panels.length} visible=${visibleCount} inputs=${JSON.stringify(after.inputs)} covers=[${after.overlaps.join(', ')}]`)

  const start = after.inputs[0], end = after.inputs[1]
  const ownedByStart = start?.controls && start.controls === after.visiblePanelId
  const ownedByEnd = end?.controls && end.controls === after.visiblePanelId
  if (visibleCount > 1) fail(`only one panel visible at a time: ${label}`, `${visibleCount} panels are visible simultaneously: ${JSON.stringify(after.panels.filter((q) => q.visible))}`)
  else ok(`only one panel visible at a time: ${label}`, `${visibleCount}`)

  if (ownedByStart) {
    fail(`no stale panel after tab-out: ${label}`, `the visible panel ${after.visiblePanelId} is still owned by the START field (aria-controls match, aria-expanded=${start.expanded}) — a stale overlay lingering over ${after.overlaps.join(', ') || 'the form'}`)
  } else if (ownedByEnd) {
    ok(`the panel after tab-out belongs to the NEXT field, not a stale one: ${label}`, `visible=${after.visiblePanelId} = end field's aria-controls; start reports aria-expanded=${start?.expanded}`)
  } else if (!after.visiblePanelId) {
    ok(`no panel visible after tab-out: ${label}`)
  } else {
    note(`handoff [${label}]: visible panel ${after.visiblePanelId} matched neither input's aria-controls (start=${start?.controls}, end=${end?.controls})`)
  }

  // and it must be dismissible
  await p.keyboard.press('Escape')
  await p.waitForTimeout(350)
  const afterEsc = await panelOf(p).isVisible().catch(() => false)
  if (afterEsc) {
    const vp = p.viewportSize() || { width: 1280, height: 900 }
    await p.mouse.click(vp.width - 5, vp.height - 5)
    await p.waitForTimeout(350)
    const afterClick = await panelOf(p).isVisible().catch(() => false)
    if (afterClick) fail(`panel is dismissible: ${label}`, 'neither Escape nor an outside click closed the panel')
    else ok(`panel is dismissible: ${label}`, 'Escape did not, but an outside click did')
  } else ok(`panel is dismissible: ${label}`, 'Escape closed it')
}

// Every route into the panel, checked one at a time. With typing closed these
// ARE the feature: if a route is dead the date is unreachable by that means.
// Tab-to-focus is the one route that MUST NOT open (that is what
// :show-on-focus="false" bought us); every other route must.
async function assertOpenPaths(p, inputLocator, label) {
  const panel = panelOf(p)
  const vis = () => panel.isVisible().catch(() => false)
  const shut = async () => {
    for (let i = 0; i < 3 && (await vis()); i++) {
      await p.keyboard.press('Escape')
      await p.waitForTimeout(200)
      if (await vis()) {
        const vp = p.viewportSize() || { width: 1280, height: 900 }
        await p.mouse.click(vp.width - 5, vp.height - 5)
        await p.waitForTimeout(250)
      }
    }
    return !(await vis())
  }
  await inputLocator.scrollIntoViewIfNeeded()

  // (a) click the field itself — the primary, most discoverable affordance
  if (!(await shut())) { fail(`open-path harness: ${label}`, 'could not get the panel closed before testing the open paths'); return }
  await inputLocator.click()
  await p.waitForTimeout(900)
  if (await vis()) ok(`open path (a) click the FIELD: ${label}`)
  else fail(`open path (a) click the FIELD: ${label}`, 'clicking the input does NOT open the panel — the field\'s primary affordance is dead and the only pointer route left is the 16px calendar icon. Check for a reintroduced :show-on-focus="false": one prop gates BOTH focus-open and click-open (primevue/datepicker/index.mjs:2333 `if (this.showOnFocus && ...)`)')

  // (b) click the calendar icon
  if (!(await shut())) { fail(`open-path harness: ${label}`, 'panel would not close before path (b)'); return }
  const icon = iconFor(inputLocator)
  if (!(await icon.count())) fail(`open path (b) click the ICON: ${label}`, 'no .p-datepicker-input-icon sibling found next to the input')
  else {
    await icon.click({ force: true })
    await p.waitForTimeout(900)
    if (await vis()) ok(`open path (b) click the ICON: ${label}`)
    else fail(`open path (b) click the ICON: ${label}`, 'clicking the calendar icon does not open the panel either — with (a) also dead the control would be entirely unusable by mouse')
  }

  // (c1) focus. showOnFocus is back at its default, so focusing DOES open the
  // panel — that is accepted: DatePicker's onKeyDown Tab branch sets
  // overlayVisible = false (index.mjs:2369-2377), so a panel opened by tabbing IN
  // closes again the moment the user tabs ON. The invariant worth defending is
  // therefore not "focus must not open" but "tabbing onward must not leave a
  // calendar sitting over the rest of the form" — a flash, not an obstruction.
  if (!(await shut())) { fail(`open-path harness: ${label}`, 'panel would not close before path (c1)'); return }
  await inputLocator.focus()
  await p.waitForTimeout(700)
  const openedOnFocus = await vis()
  if (openedOnFocus) {
    await p.keyboard.press('Tab')
    await p.waitForTimeout(600)
    // "is a panel visible" is the WRONG question on a row of adjacent DateFields:
    // tabbing from Start lands on End, whose own focus handler immediately opens
    // ITS panel, so .p-datepicker-panel is still on screen — a hand-off, not a
    // stuck overlay. aria-expanded on THIS input is the per-field truth
    // (verified: "true" while its panel is open, "false" once it closes).
    const state = await inputLocator.evaluate((el) => ({ expanded: el.getAttribute('aria-expanded'), controls: el.getAttribute('aria-controls') }))
    const somePanel = await vis()
    const next = await p.evaluate(() => { const a = document.activeElement; return { isDatePicker: !!(a && a.classList?.contains('p-datepicker-input')), tag: a?.tagName.toLowerCase() || null } })
    if (state.expanded === 'false') {
      ok(`open path (c1) focus opens, tab-out closes THIS field's panel (flash, not obstruction): ${label}`)
      if (somePanel && next.isDatePicker) note(`open path (c1) [${label}]: a panel is still on screen after tab-out, but it belongs to the NEXT DateField that focus moved into — calendar hand-off across an adjacent date pair, not a stuck overlay`)
    } else {
      fail(`open path (c1) focus-open closes on tab-out: ${label}`, `after tabbing onward this input still reports aria-expanded="${state.expanded}" (aria-controls=${state.controls}) — its own panel is still open over the following fields, which is an obstruction rather than a flash`)
    }
  } else {
    ok(`open path (c1) focus does not open at all: ${label}`, 'quieter than the flash; nothing to close')
  }

  // (c2) Enter on a focused-but-closed field. Escape closes the overlay while
  // keeping focus on the input (onKeyDown handles it there), which is the only way
  // to test Enter-to-open now that focus itself opens the panel.
  if (!(await shut())) { fail(`open-path harness: ${label}`, 'panel would not close before path (c2)'); return }
  await inputLocator.focus()
  await p.waitForTimeout(400)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(350)
  if (await vis()) {
    note(`open path (c2) [${label}]: could not get to a focused-but-closed state, Enter-to-open not measured`)
  } else {
    await p.keyboard.press('Enter')
    await p.waitForTimeout(700)
    if (await vis()) ok(`open path (c2) Enter re-opens: ${label}`)
    else note(`open path (c2) [${label}]: Enter does NOT open — accepted. PrimeVue only wires Enter when manualInput is on (index.mjs:2377); ArrowDown below is the keyboard route in, and the field is a proper role=combobox/aria-haspopup=dialog`)
  }

  // (c3) ArrowDown opens, and arrow+Enter still commits a date
  if (!(await shut())) { fail(`open-path harness: ${label}`, 'panel would not close before path (c3)'); return }
  await inputLocator.focus()
  await p.waitForTimeout(400)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(350)
  await p.keyboard.press('ArrowDown')
  await p.waitForTimeout(800)
  if (!(await vis())) fail(`open path (c3) ArrowDown opens: ${label}`, 'ArrowDown does not open the panel — with (c2) Enter also dead there would be NO keyboard route to a date at all')
  else {
    ok(`open path (c3) ArrowDown opens: ${label}`)
    const before = await inputLocator.inputValue()
    await p.keyboard.press('ArrowDown')
    await p.waitForTimeout(250)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(600)
    const after = await inputLocator.inputValue()
    if (/^\d{4}-\d{2}-\d{2}$/.test(after)) ok(`open path (c3) arrow+Enter commits a date: ${label}`, `${JSON.stringify(before)} → ${JSON.stringify(after)}`)
    else fail(`open path (c3) arrow+Enter commits a date: ${label}`, `after ArrowDown+Enter the field reads ${JSON.stringify(after)} — keyboard-only users can open the panel but cannot commit a date`)
  }
  await shut()
}

// The old scrollWidth > clientWidth probe cannot see this class of bug: the
// calendar icon is absolutely positioned, so a too-long date never overflows the
// input's scroll box, it just slides underneath the icon and gets painted over.
// Measure the rendered text against the real text budget instead
// (width − horizontal padding − borders) using the input's own computed font,
// and probe the WIDEST possible ISO strings rather than whatever value happens
// to be in the field — '0', '8' and '9' are the wide glyphs, '1' is narrow, so
// 2026-09-21 can fit while 2026-09-09 clips.
const WIDE_ISO = ['2026-09-09', '2088-08-08', '0000-00-00', '2035-04-30', '2026-11-27']
async function measureDateFit(p, sel) {
  return p.evaluate(({ s, probes }) => {
    const el = document.querySelector(s)
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
    const budget = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
    const all = [...probes, el.value].filter(Boolean)
    const widths = all.map((t) => ({ t, w: +ctx.measureText(t).width.toFixed(2) }))
    widths.sort((a, b) => b.w - a.w)
    return {
      outerW: +r.width.toFixed(1), outerH: +r.height.toFixed(1),
      fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      padL: cs.paddingLeft, padR: cs.paddingRight,
      budget: +budget.toFixed(2), value: el.value,
      widest: widths[0], widths
    }
  }, { s: sel, probes: WIDE_ISO })
}
async function assertDateTextFits(p, sel, label) {
  const m = await measureDateFit(p, sel)
  if (!m) { fail(`date text fits: ${label}`, `no element matched ${sel}`); return null }
  note(`date fit [${label}]: ${m.outerW}x${m.outerH} font=${m.fontSize} pad=${m.padL}/${m.padR} textBudget=${m.budget}px widest="${m.widest.t}"=${m.widest.w}px value="${m.value}"`)
  const slack = +(m.budget - m.widest.w).toFixed(2)
  if (m.widest.w > m.budget) {
    fail(`date text fits: ${label}`, `widest ISO date "${m.widest.t}" renders ${m.widest.w}px but only ${m.budget}px of text budget exists (${m.outerW}px field − ${m.padL} − ${m.padR} − borders) — overflow ${(-slack).toFixed(2)}px, so the trailing digit slides under the calendar icon`)
  } else ok(`date text fits: ${label}`, `widest ISO "${m.widest.t}" ${m.widest.w}px in ${m.budget}px budget, ${slack}px slack`)
  return m
}

// ChecklistCard had two sizes of the same control (item row vs add form) and a
// Select standing 6px taller than both. Now that one rule styles both DateFields,
// assert the two are typographically IDENTICAL and that every control in each row
// sits on one height rhythm.
async function assertChecklistRowRhythm(p) {
  const m = await p.evaluate(() => {
    const box = (el) => el ? +el.getBoundingClientRect().height.toFixed(1) : null
    const typ = (el) => { if (!el) return null; const c = getComputedStyle(el); return { fontSize: c.fontSize, padL: c.paddingLeft, padR: c.paddingRight, w: +el.getBoundingClientRect().width.toFixed(1), h: +el.getBoundingClientRect().height.toFixed(1) } }
    const li = document.querySelector('.checklist-items li')
    const add = document.querySelector('.checklist-add')
    const labelFont = (el) => { const l = el?.querySelector('.p-select-label'); return l ? getComputedStyle(l).fontSize : null }
    return {
      item: {
        date: typ(li?.querySelector('.due-date .p-datepicker-input')),
        selectH: box(li?.querySelector('.p-select')),
        selectLabelFont: labelFont(li),
        buttonH: box(li?.querySelector('.p-button'))
      },
      add: {
        date: typ(add?.querySelector('.due-date .p-datepicker-input')),
        selectH: box(add?.querySelector('.p-select')),
        selectLabelFont: labelFont(add),
        buttonH: box(add?.querySelector('.p-button'))
      }
    }
  })
  note(`checklist rhythm: ${JSON.stringify(m)}`)
  if (!m.item.date || !m.add.date) { fail('checklist row rhythm', `missing a DateField input (item=${!!m.item.date} add=${!!m.add.date})`); return m }

  // typography parity between the two DateFields
  const keys = ['fontSize', 'padL', 'padR', 'w', 'h']
  const diffs = keys.filter((k) => String(m.item.date[k]) !== String(m.add.date[k]))
  if (diffs.length) fail('checklist DateFields typographically identical', `item row vs add form differ on ${diffs.join(', ')}: ${JSON.stringify(m.item.date)} vs ${JSON.stringify(m.add.date)}`)
  else ok('checklist DateFields typographically identical', `both ${m.item.date.w}x${m.item.date.h} font=${m.item.date.fontSize} pad=${m.item.date.padL}/${m.item.date.padR}`)

  // per-row height rhythm: date vs assignee Select vs button
  for (const [row, v] of [['item row', m.item], ['add form', m.add]]) {
    const hs = [['date', v.date.h], ['select', v.selectH], ['button', v.buttonH]].filter(([, h]) => h != null)
    const spread = Math.max(...hs.map(([, h]) => h)) - Math.min(...hs.map(([, h]) => h))
    if (spread > 1) fail(`checklist ${row} control heights agree`, `spread ${spread.toFixed(1)}px across ${hs.map(([k, h]) => `${k}=${h}`).join(', ')} — the tallest control still breaks the row rhythm`)
    else ok(`checklist ${row} control heights agree`, hs.map(([k, h]) => `${k}=${h}`).join(', '))
    // the Select's label kept PrimeVue's 16px while the row runs at 15px
    if (v.selectLabelFont && v.date && v.selectLabelFont !== v.date.fontSize) {
      fail(`checklist ${row} Select label font matches the date field`, `Select label is ${v.selectLabelFont} but the date field is ${v.date.fontSize}`)
    } else if (v.selectLabelFont) ok(`checklist ${row} Select label font matches the date field`, v.selectLabelFont)
  }
  return m
}

// The month/year header buttons carry the whole cost of a far-future date now
// that typing is closed. They must not be quieter than the data beside them, and
// the hover token has to actually resolve — `background: var(--p-primary-50)`
// with an undefined token is an invalid declaration that silently does nothing.
async function assertHeaderAffordance(p, panel, label) {
  const g = await panel.evaluate((el) => {
    const pick = (n) => { if (!n) return null; const c = getComputedStyle(n); return { fontSize: c.fontSize, weight: c.fontWeight, color: c.color, cursor: c.cursor, padding: c.padding, radius: c.borderRadius, bg: c.backgroundColor } }
    const root = getComputedStyle(document.documentElement)
    const day = el.querySelector('td:not(.p-datepicker-other-month) > span')
    return {
      month: pick(el.querySelector('.p-datepicker-select-month')),
      year: pick(el.querySelector('.p-datepicker-select-year')),
      day: pick(day),
      tokens: {
        primary: root.getPropertyValue('--p-primary-color').trim() || '(unset)',
        primary50: root.getPropertyValue('--p-primary-50').trim() || '(unset)'
      }
    }
  })
  if (!g.month || !g.year) { fail(`header affordance: ${label}`, 'no .p-datepicker-select-month/.p-datepicker-select-year in the panel'); return g }
  note(`header [${label}] month=${g.month.fontSize}/${g.month.weight} ${g.month.color} pad=${g.month.padding} radius=${g.month.radius} | day=${g.day?.fontSize} ${g.day?.color} | tokens primary=${g.tokens.primary} primary-50=${g.tokens.primary50}`)

  const hSize = parseFloat(g.month.fontSize), dSize = parseFloat(g.day?.fontSize || '0')
  if (hSize < dSize) fail(`header not quieter than the day grid: ${label}`, `header is ${g.month.fontSize} but day numbers are ${g.day.fontSize} — the only control that reaches a far-future year is still smaller than the data`)
  else ok(`header size >= day-grid size: ${label}`, `header ${g.month.fontSize} vs days ${g.day.fontSize}`)

  if (parseInt(g.month.weight, 10) < 600) fail(`header weight: ${label}`, `font-weight ${g.month.weight}, expected >= 600`)
  else ok(`header weight >= 600: ${label}`, g.month.weight)

  // teal, i.e. not the slate it shipped as
  const tealish = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (!m) return false; const [r, gg, b] = [+m[1], +m[2], +m[3]]; return gg > r && gg >= b - 10 && r < 120 }
  if (g.month.color !== g.day?.color && tealish(g.month.color)) ok(`header is accent-coloured, not slate: ${label}`, g.month.color)
  else fail(`header is accent-coloured, not slate: ${label}`, `header colour ${g.month.color} vs day colour ${g.day?.color} — expected the teal --p-primary-color (${g.tokens.primary})`)

  if (g.tokens.primary50 === '(unset)') {
    fail(`--p-primary-50 token resolves: ${label}`, 'the token is undefined on :root, so `background: var(--p-primary-50)` is an invalid declaration and the header hover state silently does nothing')
  } else ok(`--p-primary-50 token resolves: ${label}`, g.tokens.primary50)

  // and prove the hover actually paints, rather than trusting the token
  const monthBtn = panel.locator('.p-datepicker-select-month').first()
  const before = await monthBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
  await monthBtn.hover()
  await p.waitForTimeout(350)
  const after = await monthBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
  const transparent = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
  if (transparent(after)) fail(`header hover paints a background: ${label}`, `hovering the month button leaves background-color ${after} — no visible hover feedback`)
  else ok(`header hover paints a background: ${label}`, `${before} → ${after}`)
  return g
}

// With typing gone this is the ONLY way to set a date, so it has to work on every
// surface and for far-future years: header year button → decade grid → (prev/next
// decade)* → year → month grid → day. Returns the click count so the real tap
// cost of e.g. a 2035 passport expiry is measured, not guessed.
async function setDateViaPanel(p, inputLocator, iso, label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) { fail(`setDateViaPanel: ${label}`, `not an ISO date: ${iso}`); return null }
  const [ty, tm, td] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let clicks = 0
  // one click to open, whether it lands on the field or on the calendar icon —
  // the tap cost is the same either way, so the click budget stays comparable.
  const { opened, panel } = await tryOpen(p, inputLocator, label); clicks++
  if (!opened) { fail(`open panel: ${label}`, 'panel never became visible — and with manual-input off there is no other way to set a date'); return null }
  await p.waitForTimeout(300)

  const start = await readTitle(panel)
  if (start.year !== ty || start.month !== tm) {
    await panel.locator('.p-datepicker-select-year').first().click(); clicks++
    await p.waitForTimeout(250)
    // NB: the *selected* year button carries a .p-hidden-accessible live-region
    // copy of its own label, so its text is "2026 2026" — parse the first token
    // and address the cell by index, never by a text match.
    const years = panel.locator('.p-datepicker-year-view .p-datepicker-year')
    const readYears = () => years.evaluateAll((els) => els.map((el) => Number((el.textContent || '').trim().split(/\s+/)[0])))
    let idx = -1
    for (let guard = 0; guard < 40; guard++) {
      const nums = (await readYears()).filter((n) => Number.isFinite(n) && n)
      if (!nums.length) break
      idx = nums.indexOf(ty)
      if (idx >= 0) break
      const dir = ty < Math.min(...nums) ? '.p-datepicker-prev-button' : '.p-datepicker-next-button'
      await panel.locator(dir).first().click(); clicks++
      await p.waitForTimeout(200)
    }
    if (idx < 0) { fail(`panel year navigation: ${label}`, `could not bring year ${ty} into the decade grid`); return null }
    const yBtn = years.nth(idx)
    if (await yBtn.evaluate((el) => el.classList.contains('p-disabled')).catch(() => false)) {
      fail(`panel year navigation: ${label}`, `year ${ty} is disabled in the decade grid`); return null
    }
    await yBtn.click(); clicks++
    await p.waitForTimeout(250)
    const mBtn = panel.locator('.p-datepicker-month-view .p-datepicker-month').nth(tm - 1)
    if (!(await mBtn.count())) { fail(`panel month navigation: ${label}`, 'no month grid after choosing a year'); return null }
    if (await mBtn.evaluate((el) => el.classList.contains('p-disabled')).catch(() => false)) {
      fail(`panel month navigation: ${label}`, `month ${tm}/${ty} is disabled`); return null
    }
    await mBtn.click(); clicks++
    await p.waitForTimeout(300)
  }
  const picked = await pickDay(p, panel, td, label)
  if (!picked) return null
  clicks++
  await p.waitForTimeout(300)
  const got = await inputLocator.inputValue()
  note(`panel clicks to set ${iso} [${label}]: ${clicks} (opened on "${start.text}")`)
  if (got !== iso) fail(`set date via panel: ${label}`, `navigated the panel to ${iso}, field reads "${got}"`)
  else ok(`set date via panel: ${label}`, `${iso} in ${clicks} click(s)`)
  return { iso: got, clicks }
}

// ---------- 1. login ----------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await shot('dp-01-login')
await page.getByLabel(/email/i).fill('demo@example.com')
await page.getByLabel(/password/i).fill('demo-pass-123')
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForURL(`${BASE}/`, { timeout: 10000 })
ok('login')

// Wipe any stale wizard draft so step 2 starts from the documented defaults.
await page.evaluate(() => localStorage.removeItem('tripper:draft:trip-new'))

// ---------- 1b. make sure this organizer owns a person ----------
// demo@example.com seeds with zero people, and without one there is no trip
// participant → no share link → the participant page is unreachable.
let personName = null
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
if (await page.locator('table.table tbody tr').count()) {
  personName = (await page.locator('table.table tbody tr td a').first().innerText()).trim()
  ok('person exists', personName)
} else {
  personName = `QA DP Person ${Date.now() % 100000}`
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.waitForTimeout(400)
  await page.locator('#pf-name').fill(personName)
  await page.locator('#pf-city').fill('Chennai')
  await page.getByRole('button', { name: /^Create$/ }).click()
  await page.waitForURL(/\/people\/[\w-]+/, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  if (/\/people\/[\w-]+/.test(page.url())) ok('person created', personName)
  else fail('person create', `still at ${page.url()}`)
}

// ---------- 2. wizard step 2 (TripWizard.vue) ----------
const TRIP_NAME = `DP QA ${Date.now()}`
await page.goto(`${BASE}/trips/new`, { waitUntil: 'networkidle' })
await page.locator('#w-name').fill(TRIP_NAME)
await page.locator('[data-test="wizard-next"]').click()
await page.waitForTimeout(400)
await shot('dp-02-wizard-step2-broad')
// date_mode defaults to 'broad' → DateWindowsEditor is embedded in the wizard.
ok('wizard step 2 (broad / embedded DateWindowsEditor)')

// switch to Confirmed to reach the start/end DateFields
await page.locator('label[for="dm-confirmed"]').click()
await page.waitForTimeout(300)
await shot('dp-03-wizard-step2-confirmed')
const wStart = page.locator('#w-start')
const wEnd = page.locator('#w-end')
if (!(await wStart.count())) fail('wizard start date', '#w-start not found')
else {
  const panel = await openPanel(page, wStart, 'wizard start')
  if (panel) {
    await auditPanel(page, panel, 'wizard start')
    await assertHeaderAffordance(page, panel, 'wizard start')
    await viewportShot(page, 'dp-04-wizard-panel-open')
    const picked = await pickDay(page, panel, 18, 'wizard start')
    if (picked) {
      const expected = isoFromTitle(picked.title, 18)
      const got = await wStart.inputValue()
      if (expected && got !== expected) fail('wizard start day→value', `panel said "${picked.title}" day 18 → expected ${expected}, input reads "${got}"`)
      else ok('wizard start day→value', `${got} (panel "${picked.title}")`)
    }
    await closePanel(page)
  }
  // the chained end-date field: set it by panel, then prove the keyboard cannot
  // touch it. 2026-11-27 is the exact value the old typing path corrupted to
  // 2026-11-02, so it stays the probe string.
  await setDateViaPanel(page, wEnd, '2026-11-27', 'wizard end date')
  await assertTypingBlocked(page, wEnd, '2026-11-27', 'wizard end date')
  await shot('dp-05-wizard-dates-filled')
}

// ---------- 3. finish the wizard (pick a participant so a share link is possible) ----------
await page.locator('[data-test="wizard-next"]').click() // → 3 destination
await page.waitForTimeout(300)
await page.locator('[data-test="wizard-next"]').click() // → 4 participants
await page.waitForTimeout(500)
const firstParticipant = page.locator('.wizard-participants li label').first()
if (await firstParticipant.count()) await firstParticipant.click()
else fail('wizard participants', 'no selectable person on step 4 — the participant page will be unreachable')
await page.waitForTimeout(300)
await shot('dp-05b-wizard-participants')
await page.getByRole('button', { name: /create trip/i }).click().catch(() => {})
await page.waitForURL(/\/trips\/(?!new)[\w-]+/, { timeout: 10000 }).catch(() => {})
await page.waitForLoadState('networkidle')
const tripUrl = page.url()
const tripId = /\/trips\/([\w-]+)/.exec(tripUrl)?.[1]
if (!tripId) { fail('wizard create', `stuck at ${tripUrl}`) }
else ok('wizard → trip created', tripId)

async function gotoSection(label) {
  await page.locator('.trip-nav-item', { hasText: label }).first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
}

// ---------- 4. trip Dates section (DateWindowsEditor.vue) ----------
await gotoSection('Dates')
await shot('dp-06-dates-empty')
await page.getByRole('button', { name: /add date window/i }).click()
await page.waitForTimeout(300)
await shot('dp-07-dates-row')

const dweInputs = page.locator('.dwe-row .p-datepicker-input')
if ((await dweInputs.count()) < 2) fail('dates row', `expected 2 date inputs in the row, got ${await dweInputs.count()}`)
const dStart = dweInputs.nth(0)
const dEnd = dweInputs.nth(1)

// measure rendered widths for the 11rem min-width claim
const dweMetrics = await page.evaluate(() => {
  const row = document.querySelector('.dwe-row')
  if (!row) return null
  return [...row.children].map((c) => {
    const r = c.getBoundingClientRect()
    const lab = c.querySelector('label')?.textContent?.trim() || c.textContent.trim().slice(0, 14)
    const inp = c.querySelector('input')
    return { label: lab, w: +r.width.toFixed(1), h: +r.height.toFixed(1), inputW: inp ? +inp.getBoundingClientRect().width.toFixed(1) : null, inputH: inp ? +inp.getBoundingClientRect().height.toFixed(1) : null }
  })
})
note(`dwe row fields: ${JSON.stringify(dweMetrics)}`)

let panel = await openPanel(page, dStart, 'trip Dates start')
let expectedStart = null
if (panel) {
  await auditPanel(page, panel, 'trip Dates start')
  await viewportShot(page, 'dp-08-dates-panel-open')
  const picked = await pickDay(page, panel, 12, 'trip Dates start')
  if (picked) {
    expectedStart = isoFromTitle(picked.title, 12)
    const got = await dStart.inputValue()
    if (expectedStart && got !== expectedStart) fail('dates start day→value', `expected ${expectedStart}, input reads "${got}"`)
    else ok('dates start day→value', `${got} (panel "${picked.title}")`)
    expectedStart = got
  }
  await closePanel(page)
}

// end-date panel: min-date is chained off start, so earlier days must be disabled
panel = await openPanel(page, dEnd, 'trip Dates end')
if (panel) {
  await auditPanel(page, panel, 'trip Dates end')
  await viewportShot(page, 'dp-09-dates-endpanel-open')
  const disabledCount = await panel.locator('td.p-datepicker-day-cell > span.p-disabled, td > span.p-disabled').count()
  note(`end-date panel disabled day cells: ${disabledCount} (min-date chaining off start=${expectedStart})`)
  await closePanel(page)
}
// set the end date through its own panel, then prove typing cannot disturb it
const endIso = expectedStart ? bump(expectedStart, 5) : '2026-12-20'
function bump(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
await setDateViaPanel(page, dEnd, endIso, 'trip Dates end')
await assertTypingBlocked(page, dEnd, '2026-11-27', 'trip Dates end')
await page.locator('.dwe-row input:not(.p-datepicker-input)').last().fill('QA window')
await shot('dp-10-dates-filled')

// PERSISTENCE: save → reload → compare
await page.getByRole('button', { name: /save windows/i }).click()
await page.waitForTimeout(1200)
await shot('dp-11-dates-saved')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await shot('dp-12-dates-after-reload')
{
  const inputs = page.locator('.dwe-row .p-datepicker-input')
  const n = await inputs.count()
  if (n < 2) fail('dates persistence', `after reload only ${n} date inputs rendered — the saved window did not come back`)
  else {
    const gotStart = await inputs.nth(0).inputValue()
    const gotEnd = await inputs.nth(1).inputValue()
    if (gotStart !== expectedStart) fail('dates persistence (start)', `set ${expectedStart}, after save+reload reads "${gotStart}"${gotStart && expectedStart ? ` — shift of ${Math.round((new Date(gotStart) - new Date(expectedStart)) / 86400000)} day(s)` : ''}`)
    else ok('dates persistence (start)', `${gotStart} survived save+reload with no day shift`)
    if (gotEnd !== endIso) fail('dates persistence (end)', `typed ${endIso}, after save+reload reads "${gotEnd}"`)
    else ok('dates persistence (end)', `${gotEnd} survived save+reload with no day shift`)
  }
}

// Open paths on trip Dates. Deliberately AFTER the save+reload assertions:
// path (c3) commits a date via arrow+Enter, and DateWindowsEditor only persists
// on the explicit "Save windows" click (DateWindowsEditor.vue:34-35, no autosave
// watcher), so mutating the field here cannot disturb the saved 2026-07-12 /
// 2026-07-17 that the UTC-7 browser re-reads from the API later.
await assertOpenPaths(page, page.locator('.dwe-row .p-datepicker-input').nth(0), 'trip Dates start')
await shot('dp-12b-dates-open-paths')
// Item 2: decide, by aria-controls ownership rather than by "is something on
// screen", whose panel is visible after tabbing out of Start.
await diagnosePanelHandoff(page, page.locator('.dwe-row .p-datepicker-input').nth(0), page.locator('.dwe-row .p-datepicker-input').nth(1), 'trip Dates start→end')
await shot('dp-12c-dates-handoff')

// ---------- 5. trip Goals section (GoalsEditor.vue) ----------
await gotoSection('Goals')
await shot('dp-13-goals')
const goalIso = '2026-10-03'
{
  const form = page.locator('.goal-add-form')
  await form.locator('input.p-inputtext:not(.p-datepicker-input)').first().fill('QA datepicker goal')
  const gDate = form.locator('.p-datepicker-input').first()
  if (!(await gDate.count())) fail('goals add form', 'no DatePicker input in .goal-add-form')
  else {
    const gp = await openPanel(page, gDate, 'goals add')
    if (gp) { await auditPanel(page, gp, 'goals add'); await viewportShot(page, 'dp-14-goals-panel-open'); await closePanel(page) }
    await setDateViaPanel(page, gDate, goalIso, 'goals fixed date')
    await assertTypingBlocked(page, gDate, '2026-11-27', 'goals fixed date')
    await shot('dp-15-goals-filled')
    await page.getByRole('button', { name: /add goal/i }).click()
    await page.waitForTimeout(1200)
    await shot('dp-16-goals-added')
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await shot('dp-17-goals-after-reload')
    const txt = await page.locator('.goals-list').innerText().catch(() => '')
    if (!txt.includes(goalIso)) fail('goals persistence', `after save+reload the goal list does not show ${goalIso}. List text: ${JSON.stringify(txt.slice(0, 300))}`)
    else ok('goals persistence', `${goalIso} survived save+reload with no day shift`)
    // and the edit row should rehydrate the same ISO into its DateField
    const editBtn = page.locator('.goal-item', { hasText: 'QA datepicker goal' }).getByRole('button', { name: /^Edit$/ }).first()
    if (await editBtn.count()) {
      await editBtn.click()
      await page.waitForTimeout(400)
      const ev = await page.locator('.goal-item .p-datepicker-input').first().inputValue()
      if (ev !== goalIso) fail('goals edit-row rehydrate', `expected ${goalIso}, edit row DateField reads "${ev}"`)
      else ok('goals edit-row rehydrate', ev)
      await shot('dp-18-goals-edit-row')
    }
  }
}

// ---------- 6. trip Checklists section (ChecklistCard.vue) ----------
await gotoSection('Checklists')
await shot('dp-19-checklists-empty')
{
  // a 'tasks' checklist is the one with due-date fields
  await page.locator('.checklist-form-row').first().locator('.p-select').first().click()
  await page.waitForTimeout(250)
  await page.locator('.p-select-option', { hasText: /^Tasks$/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#checklist-name').fill('QA tasks')
  await page.locator('.checklist-form-row').first().getByRole('button', { name: /create/i }).click()
  await page.waitForTimeout(1200)
  await shot('dp-20-checklists-created')

  const addForm = page.locator('.checklist-add').first()
  await addForm.locator('input[placeholder="New item title"]').fill('QA task item')
  const addDate = addForm.locator('.p-datepicker-input').first()
  if (!(await addDate.count())) fail('checklist add form', 'no DatePicker input in .checklist-add')
  else {
    // measure the 10rem add-form width claim
    const m = await page.evaluate(() => {
      const f = document.querySelector('.checklist-add')
      if (!f) return null
      return [...f.children].map((c) => {
        const r = c.getBoundingClientRect()
        return { tag: c.tagName.toLowerCase(), cls: String(c.className).split(' ').slice(0, 2).join('.'), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
      })
    })
    note(`checklist ADD form children: ${JSON.stringify(m)}`)
    const ap = await openPanel(page, addDate, 'checklist add-form due date')
    if (ap) { await auditPanel(page, ap, 'checklist add-form due date'); await viewportShot(page, 'dp-21-checklists-addform-panel-open'); await closePanel(page) }
    const clAddIso = '2026-09-09'
    await setDateViaPanel(page, addDate, clAddIso, 'checklist add-form due date')
    await assertTypingBlocked(page, addDate, '2026-11-27', 'checklist add-form due date')
    await shot('dp-22-checklists-addform-filled')
    await addForm.getByRole('button', { name: /add item/i }).click()
    await page.waitForTimeout(1200)
    await shot('dp-23-checklists-item-added')
    // the item row now carries its own DateField
    const itemDate = page.locator('.checklist-items .due-date .p-datepicker-input').first()
    if (!(await itemDate.count())) fail('checklist item row', 'no due-date DatePicker on the created item')
    else {
      const v = await itemDate.inputValue()
      if (v !== clAddIso) fail('checklist add-form → item due date', `added with ${clAddIso}, item row reads "${v}"`)
      else ok('checklist add-form → item due date', v)
      const im = await page.evaluate(() => {
        const li = document.querySelector('.checklist-items li')
        if (!li) return null
        return [...li.children].map((c) => {
          const r = c.getBoundingClientRect()
          return { cls: String(c.className).split(' ').slice(0, 2).join('.'), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
        }).concat([{ cls: 'LI(total)', w: +li.getBoundingClientRect().width.toFixed(1), h: +li.getBoundingClientRect().height.toFixed(1) }])
      })
      note(`checklist ITEM row children: ${JSON.stringify(im)}`)
      // D2/D3/D4 re-check: one rule now styles both DateFields, and the Select
      // was pulled down onto the row rhythm.
      // Regression guard: ONLY the two expiry fields were meant to become masked.
      // Every other surface must still be a real DatePicker.
      for (const [sel, what] of [
        ['.dwe-row .p-datepicker-input', 'trip Dates'],
        ['.checklist-items li .due-date .p-datepicker-input', 'checklist item due date'],
        ['.checklist-add .due-date .p-datepicker-input', 'checklist add-form due date']
      ]) {
        const loc = page.locator(sel).first()
        if (!(await loc.count())) continue
        if (await isTypeable(loc)) fail(`${what} is still a picker (not masked)`, 'this surface became a masked field — only the two expiry fields were meant to change')
        else ok(`${what} is still a picker (not masked)`)
      }
      await assertChecklistRowRhythm(page)
      await assertDateTextFits(page, '.checklist-items li .due-date .p-datepicker-input', 'checklist item row')
      await assertDateTextFits(page, '.checklist-add .due-date .p-datepicker-input', 'checklist add form')
      // exercise the item-row picker: open, audit, pick a day (auto-saves via updateItem)
      const ip = await openPanel(page, itemDate, 'checklist item due date')
      let expectedItem = null
      if (ip) {
        await auditPanel(page, ip, 'checklist item due date')
        await viewportShot(page, 'dp-24-checklists-item-panel-open')
        const picked = await pickDay(page, ip, 21, 'checklist item due date')
        if (picked) {
          expectedItem = isoFromTitle(picked.title, 21)
          const got = await itemDate.inputValue()
          if (expectedItem && got !== expectedItem) fail('checklist item day→value', `expected ${expectedItem}, reads "${got}"`)
          else ok('checklist item day→value', `${got} (panel "${picked.title}")`)
          expectedItem = got
        }
        await closePanel(page)
      }
      // the item-row DateField auto-saves on change, so a keyboard that still
      // reached it would silently persist a wrong date
      await assertTypingBlocked(page, itemDate, '2026-11-27', 'checklist item due date')
      await shot('dp-25-checklists-item-picked')
      // PERSISTENCE: due date auto-saves on change, so just reload
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      await shot('dp-26-checklists-after-reload')
      const after = await page.locator('.checklist-items .due-date .p-datepicker-input').first().inputValue().catch(() => '')
      if (expectedItem && after !== expectedItem) fail('checklist persistence', `picked ${expectedItem}, after reload reads "${after}"${after ? ` — shift of ${Math.round((new Date(after) - new Date(expectedItem)) / 86400000)} day(s)` : ''}`)
      else if (expectedItem) ok('checklist persistence', `${after} survived reload with no day shift`)
    }
  }
}

// ---------- 7. People section → share link ----------
await gotoSection('People')
await shot('dp-27-people')
let participantUrl = null
let personUrl = null
{
  await page.locator('.participant-card').first().waitFor({ timeout: 3000 }).catch(() => {})
  if (await page.locator('.participant-card').count()) {
    await page.getByRole('button', { name: /create link/i }).first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    const code = await page.locator('.link-reveal code').first().textContent().catch(() => null)
    participantUrl = code?.trim() || null
  }
  if (participantUrl) ok('share link created')
  else fail('share link', 'no participant card / no link revealed on the People section')
}

// ---------- 8. Person detail /people/:id (DocumentList.vue) ----------
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
{
  const link = page.locator('table.table a[href^="/people/"], table a').first()
  if (!(await link.count())) fail('person detail', 'no person row on /people')
  else {
    await link.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    await shot('dp-28-person-detail')
    personUrl = page.url()
    const dl = page.locator('#doc-expiry')
    if (!(await dl.count())) fail('person doc expiry', '#doc-expiry not found on the person detail page')
    else {
      const dm = await page.evaluate(() => {
        const i = document.getElementById('doc-expiry')
        const num = document.getElementById('doc-number')
        const r = i.getBoundingClientRect(), rn = num?.getBoundingClientRect()
        return { expiryW: +r.width.toFixed(1), expiryH: +r.height.toFixed(1), numberW: rn ? +rn.width.toFixed(1) : null, numberH: rn ? +rn.height.toFixed(1) : null }
      })
      note(`person-detail doc fields: ${JSON.stringify(dm)}`)
      if (await isTypeable(dl)) {
        ok('person doc expiry is in typeable (masked) mode')
        await shot('dp-29-person-docs-masked-empty')
        // mid-typing frame for the slot-char template
        await clearField(page, dl)
        for (const ch of '20350') { await page.keyboard.type(ch); await page.waitForTimeout(60) }
        await shot('dp-29b-person-docs-masked-midtyping')
        await assertMaskedDate(page, dl, 'person doc expiry')
        // error-state frame
        await typeMasked(page, dl, '2026-02-31', 30)
        await page.waitForTimeout(350)
        await shot('dp-29c-person-docs-masked-error')
        // settle on the passport date and count the keystroke cost for the report
        const r = await typeMasked(page, dl, '2035-04-30', 30)
        note(`FAR-FUTURE COST, typeable: 2035-04-30 in ${r.keys} keystrokes (the picker needed 6 clicks)`)
        await shot('dp-30-person-docs-filled')
        // PERSISTENCE: a document needs a file, so upload one, then reload
        const fileInput = page.locator('input[type=file]').first()
        if (await fileInput.count()) {
          await fileInput.setInputFiles(UPLOAD_FILE)
          await typeMasked(page, dl, '2035-04-30', 25)
          await page.getByRole('button', { name: /^Upload$/i }).first().click()
          await page.waitForTimeout(1600)
          await shot('dp-30c-person-docs-uploaded')
          await page.reload({ waitUntil: 'networkidle' })
          await page.waitForTimeout(1000)
          const listText = await page.locator('.card', { hasText: 'Documents' }).first().innerText().catch(() => '')
          if (listText.includes('2035-04-30')) ok('person doc expiry persistence', '2035-04-30 survived upload+reload with no day shift')
          else fail('person doc expiry persistence', `after upload+reload the Documents card does not show 2035-04-30. Card text: ${JSON.stringify(listText.slice(0, 300))}`)
          await shot('dp-30d-person-docs-after-reload')

          // ===== FIX 1: red ring while focused+invalid, teal while focused+valid
          await assertInvalidFocusRing(page, '#doc-expiry', '#doc-number', 'person doc expiry')
          await shot('dp-41-person-invalid-focus-ring')
          // a tight frame of the field in its focused+invalid state, for the eye
          await page.locator('#doc-expiry').scrollIntoViewIfNeeded()
          await typeMasked(page, page.locator('#doc-expiry'), '2026-02-31', 25)
          await page.waitForTimeout(400)
          const ringClip = await page.locator('#doc-expiry').evaluate((el) => {
            const f = el.closest('.field').getBoundingClientRect()
            const x = Math.max(0, f.x - 12), y = Math.max(0, f.y - 30)
            return {
              x, y,
              width: Math.max(40, Math.min(innerWidth - x, f.width + 24)),
              height: Math.max(40, Math.min(innerHeight - y, f.height + 60))
            }
          })
          await page.screenshot({ path: path.join(shots, 'dp-41b-person-invalid-ring-closeup.png'), clip: ringClip }).catch((e) => note(`closeup shot skipped: ${e.message.split('\n')[0]}`))

          // ===== FIX 2: the error must not move the Upload button, at both widths
          await assertNoErrorShift(page, '#doc-expiry', 'person doc expiry @1280px')
          await shot('dp-42-person-error-shift-1280')
          await page.setViewportSize({ width: 375, height: 812 })
          await page.waitForTimeout(600)
          await assertNoErrorShift(page, '#doc-expiry', 'person doc expiry @375px')
          await shot('dp-43-person-error-shift-375')
          await page.setViewportSize({ width: 1280, height: 900 })
          await page.waitForTimeout(500)

          // ===== FIX 3: the Expired badge, judged against the browser's own day.
          // Four fixtures (-2..+1) rather than three, so the SAME rows can also be
          // judged from the UTC-7 browser, whose "today" is a different calendar
          // day from this one's.
          const pdates = await browserDates(page)
          note(`person badge fixtures from the browser clock (offset ${pdates.offsetMin}min): -2=${pdates.minus2} yesterday=${pdates.yesterday} today=${pdates.today} tomorrow=${pdates.tomorrow}`)
          for (const [iso, marker] of [[pdates.minus2, 'QA-EXP-MINUS2'], [pdates.yesterday, 'QA-EXP-YESTERDAY'], [pdates.today, 'QA-EXP-TODAY'], [pdates.tomorrow, 'QA-EXP-TOMORROW']]) {
            await uploadDatedDoc(page, '#doc-expiry', iso, marker, 'person detail')
          }
          await page.reload({ waitUntil: 'networkidle' })
          await page.waitForTimeout(1300)
          await assertExpiryBadges(page, 'person detail (local, Asia/Kolkata)')
          await shot('dp-44-person-expiry-badges')
        } else fail('person doc upload', 'no file input on the Documents form, cannot test expiry persistence')
      } else {
        fail('person doc expiry is in typeable (masked) mode', 'the field is still a DatePicker — DocumentList.vue was expected to pass `typeable`')
        const pp = await openPanel(page, dl, 'person doc expiry')
        if (pp) { await auditPanel(page, pp, 'person doc expiry'); await viewportShot(page, 'dp-29-person-docs-panel-open'); await closePanel(page) }
        const far = await setDateViaPanel(page, dl, '2035-04-30', 'person doc expiry (far-future passport)')
        if (far) note(`FAR-FUTURE TAP COST: today → 2035-04-30 took ${far.clicks} clicks`)
        await assertTypingBlocked(page, dl, '2035-04-30', 'person doc expiry')
        await shot('dp-30-person-docs-filled')
      }
    }
  }
}

// ---------- 9. participant page at 375px (ParticipantDocs.vue) ----------
if (participantUrl) {
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } })
  wire(mobile, 'mobile')
  await mobile.goto(participantUrl, { waitUntil: 'networkidle' })
  await mobile.waitForTimeout(1000)
  await mobile.screenshot({ path: path.join(shots, 'dp-31-participant-mobile.png'), fullPage: true })
  const mExpiry = mobile.locator('#doc-expiry')
  if (!(await mExpiry.count())) fail('participant doc expiry', '#doc-expiry not rendered on the participant page')
  else {
    await mExpiry.scrollIntoViewIfNeeded()
    await mobile.waitForTimeout(300)
    const mm = await mobile.evaluate(() => {
      const i = document.getElementById('doc-expiry')
      const num = document.getElementById('doc-number')
      const r = i.getBoundingClientRect(), rn = num?.getBoundingClientRect()
      const icon = document.querySelector('.p-datepicker-input-icon')
      const wrap = i.closest('.p-datepicker')?.getBoundingClientRect()
      return {
        expiry: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), right: +r.right.toFixed(1) },
        wrapper: wrap ? { w: +wrap.width.toFixed(1), h: +wrap.height.toFixed(1) } : null,
        number: rn ? { w: +rn.width.toFixed(1), h: +rn.height.toFixed(1) } : null,
        iconRect: icon ? (() => { const ir = icon.getBoundingClientRect(); return { x: +ir.x.toFixed(1), w: +ir.width.toFixed(1), h: +ir.height.toFixed(1) } })() : null,
        paddingRight: getComputedStyle(i).paddingRight,
        vw: innerWidth
      }
    })
    note(`participant mobile expiry: ${JSON.stringify(mm)}`)
    if (mm.expiry.h < 44) fail('participant tap target', `expiry input is ${mm.expiry.h}px tall — below the 44px one-handed tap-target floor`)
    else ok('participant tap target', `${mm.expiry.h}px tall`)
    await mobile.screenshot({ path: path.join(shots, 'dp-32-participant-docs-field.png'), clip: await mExpiry.evaluate((el) => { const r = el.closest('.field').getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(375, r.width + 16), height: r.height + 16 } }) })
    if (await isTypeable(mExpiry)) {
      ok('participant doc expiry is in typeable (masked) mode (375px)')
      await clearField(mobile, mExpiry)
      for (const ch of '20300') { await mobile.keyboard.type(ch); await mobile.waitForTimeout(60) }
      await viewportShot(mobile, 'dp-33-participant-masked-midtyping')
      await assertMaskedDate(mobile, mExpiry, 'participant doc expiry (375px)')
      await typeMasked(mobile, mExpiry, '2026-02-31', 30)
      await mobile.waitForTimeout(350)
      await viewportShot(mobile, 'dp-33b-participant-masked-error')
      await typeMasked(mobile, mExpiry, '2030-01-31', 30)
      await mobile.screenshot({ path: path.join(shots, 'dp-34-participant-docs-filled.png'), fullPage: true })
      // PERSISTENCE on the participant surface too
      const mFile = mobile.locator('input[type=file]').first()
      if (await mFile.count()) {
        await mFile.setInputFiles(UPLOAD_FILE)
        await typeMasked(mobile, mExpiry, '2030-01-31', 25)
        await mobile.getByRole('button', { name: /^Upload$/i }).first().click()
        await mobile.waitForTimeout(1600)
        await mobile.reload({ waitUntil: 'networkidle' })
        await mobile.waitForTimeout(1100)
        const t = await mobile.locator('body').innerText().catch(() => '')
        if (t.includes('2030-01-31')) ok('participant doc expiry persistence', '2030-01-31 survived upload+reload with no day shift')
        else fail('participant doc expiry persistence', `after upload+reload the page does not show 2030-01-31`)
        await mobile.screenshot({ path: path.join(shots, 'dp-34b-participant-after-reload.png'), fullPage: true })

        // ===== FIXES 1-3 on the participant surface, at its real 375px width
        await assertInvalidFocusRing(mobile, '#doc-expiry', '#doc-number', 'participant doc expiry (375px)')
        await viewportShot(mobile, 'dp-45-participant-invalid-focus-ring')
        await assertNoErrorShift(mobile, '#doc-expiry', 'participant doc expiry @375px')
        await viewportShot(mobile, 'dp-46-participant-error-shift-375')
        // The participant page reads the SAME person's documents, so the four
        // dated fixtures uploaded on the person surface are already here — no
        // need to duplicate them; ParticipantDocs.vue's own isExpired() is what
        // is under test, and it renders these rows itself. (Its upload path is
        // already covered by the 2030-01-31 persistence check above.)
        await mobile.reload({ waitUntil: 'networkidle' })
        await mobile.waitForTimeout(1400)
        await assertExpiryBadges(mobile, 'participant (local, Asia/Kolkata, 375px)')
        await mobile.screenshot({ path: path.join(shots, 'dp-47-participant-expiry-badges.png'), fullPage: true })
      } else fail('participant doc upload', 'no file input on the participant Documents form')
    } else {
      fail('participant doc expiry is in typeable (masked) mode (375px)', 'the field is still a DatePicker — ParticipantDocs.vue was expected to pass `typeable`')
      const mp = await openPanel(mobile, mExpiry, 'participant doc expiry (375px)')
      if (mp) {
        await auditPanel(mobile, mp, 'participant doc expiry (375px)')
        await assertHeaderAffordance(mobile, mp, 'participant doc expiry (375px)')
        await viewportShot(mobile, 'dp-33-participant-panel-open')
        await closePanel(mobile)
      }
      await setDateViaPanel(mobile, mExpiry, '2030-01-31', 'participant doc expiry (375px)')
      await assertTypingBlocked(mobile, mExpiry, '2030-01-31', 'participant doc expiry (375px)')
      await mobile.screenshot({ path: path.join(shots, 'dp-34-participant-docs-filled.png'), fullPage: true })
    }
  }
  await mobile.close()
} else {
  console.log('skip - participant page (no share link)')
}

// ---------- 10. narrow desktop: does the 11rem / 9rem sizing survive? ----------
// At 1280px the DateWindowsEditor fields are flex-grown to ~278px, so the
// `min-width: 11rem` guess is never exercised. Squeeze the window to find out.
if (tripId) {
  for (const w of [1024, 860, 720]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(`${BASE}/trips/${tripId}/dates`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const m = await page.evaluate(() => {
      const row = document.querySelector('.dwe-row')
      if (!row) return null
      const rows = new Set()
      const kids = [...row.children].map((c) => {
        const r = c.getBoundingClientRect()
        rows.add(Math.round(r.top))
        const inp = c.querySelector('input')
        return { label: c.querySelector('label')?.textContent?.trim() || 'btn', w: +r.width.toFixed(1), inputW: inp ? +inp.getBoundingClientRect().width.toFixed(1) : null, scrollW: inp ? inp.scrollWidth : null, clientW: inp ? inp.clientWidth : null }
      })
      return { kids, wrapLines: rows.size }
    })
    note(`dates row @${w}px: lines=${m?.wrapLines} ${JSON.stringify(m?.kids)}`)
    const truncated = (m?.kids || []).filter((k) => k.scrollW && k.clientW && k.scrollW > k.clientW + 1)
    if (truncated.length) fail(`dates row text truncated @${w}px`, JSON.stringify(truncated))
    await shot(`dp-35-dates-narrow-${w}`)

    await page.goto(`${BASE}/trips/${tripId}/checklists`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const cm = await page.evaluate(() => {
      const li = document.querySelector('.checklist-items li')
      const add = document.querySelector('.checklist-add')
      const grab = (el) => el ? [...el.children].map((c) => { const r = c.getBoundingClientRect(); const i = c.matches('input') ? c : c.querySelector('input'); return { cls: String(c.className).split(' ')[0] || c.tagName.toLowerCase(), w: +r.width.toFixed(1), top: Math.round(r.top), scrollW: i ? i.scrollWidth : null, clientW: i ? i.clientWidth : null } }) : null
      return { item: grab(li), add: grab(add), overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth }
    })
    note(`checklist rows @${w}px: ${JSON.stringify(cm)}`)
    const clTrunc = [...(cm.item || []), ...(cm.add || [])].filter((k) => k.scrollW && k.clientW && k.scrollW > k.clientW + 1)
    if (clTrunc.length) fail(`checklist date text truncated @${w}px`, JSON.stringify(clTrunc))
    // scrollWidth cannot see a date sliding under the absolutely-positioned icon,
    // so re-measure the real text budget at every width too.
    await assertDateTextFits(page, '.checklist-items li .due-date .p-datepicker-input', `checklist item row @${w}px`)
    if (cm.overflowX) fail(`horizontal page overflow @${w}px`, 'the checklists page scrolls sideways')
    await shot(`dp-36-checklists-narrow-${w}`)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
}

// ---------- 11. off-by-one under a NEGATIVE UTC offset ----------
// This machine is Asia/Kolkata (UTC+5:30), where a UTC-midnight parse still
// lands on the same local day — so the "no day shift" result above proves
// nothing on its own. Re-read the saved dates from a UTC-7 browser, where a
// UTC parse WOULD roll the date back a day.
if (tripId) {
  const tz = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Los_Angeles' })
  wire(tz, 'tz(UTC-7)')
  await tz.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await tz.getByLabel(/email/i).fill('demo@example.com')
  await tz.getByLabel(/password/i).fill('demo-pass-123')
  await tz.getByRole('button', { name: /log in/i }).click()
  await tz.waitForURL(`${BASE}/`, { timeout: 10000 })
  const off = await tz.evaluate(() => new Date().getTimezoneOffset())
  note(`second browser timezone offset: ${off} minutes (Asia/Kolkata is -330)`)
  if (off <= 0) fail('timezone harness', `expected a positive getTimezoneOffset for a UTC-negative zone, got ${off}`)

  await tz.goto(`${BASE}/trips/${tripId}/dates`, { waitUntil: 'networkidle' })
  await tz.waitForTimeout(900)
  await tz.screenshot({ path: path.join(shots, 'dp-37-dates-tz-utc-minus7.png'), fullPage: true })
  const tzInputs = tz.locator('.dwe-row .p-datepicker-input')
  if ((await tzInputs.count()) < 2) fail('tz dates', 'saved window did not render in the UTC-7 browser')
  else {
    const s = await tzInputs.nth(0).inputValue()
    const e = await tzInputs.nth(1).inputValue()
    if (s !== '2026-07-12' || e !== '2026-07-17') fail('off-by-one under UTC-7', `saved 2026-07-12/2026-07-17, UTC-7 browser shows ${s}/${e}`)
    else ok('no off-by-one under UTC-7 (dates)', `${s} / ${e}`)
    // and a fresh round trip in that timezone, straight through the panel
    await setDateViaPanel(tz, tzInputs.nth(0), '2026-03-08', 'UTC-7 start (US DST spring-forward day)')
    await tz.getByRole('button', { name: /save windows/i }).click()
    await tz.waitForTimeout(1300)
    await tz.reload({ waitUntil: 'networkidle' })
    await tz.waitForTimeout(900)
    const back = await tz.locator('.dwe-row .p-datepicker-input').first().inputValue()
    if (back !== '2026-03-08') fail('UTC-7 round trip (DST boundary)', `set 2026-03-08, after save+reload reads "${back}"`)
    else ok('UTC-7 round trip across the DST spring-forward day', back)
    await tz.screenshot({ path: path.join(shots, 'dp-38-dates-tz-dst-roundtrip.png'), fullPage: true })
  }
  await tz.goto(`${BASE}/trips/${tripId}/checklists`, { waitUntil: 'networkidle' })
  await tz.waitForTimeout(1200)
  const tzDue = await tz.locator('.checklist-items .due-date .p-datepicker-input').first().inputValue().catch(() => '')
  if (tzDue && tzDue !== '2026-09-21') fail('off-by-one under UTC-7 (checklist due date)', `stored 2026-09-21, UTC-7 browser shows "${tzDue}"`)
  else if (tzDue) ok('no off-by-one under UTC-7 (checklist due date)', tzDue)
  await tz.screenshot({ path: path.join(shots, 'dp-39-checklists-tz-utc-minus7.png'), fullPage: true })
  // The masked expiry writes a plain ISO string too — re-read it from UTC-7, where
  // a UTC parse would roll it back a day.
  if (personUrl) {
    await tz.goto(personUrl, { waitUntil: 'networkidle' })
    await tz.waitForTimeout(1100)
    const t = await tz.locator('body').innerText().catch(() => '')
    if (!t.includes('2035-04-30') && /No documents yet/i.test(t)) {
      note('UTC-7 expiry re-check skipped: no document row on the person page')
    } else if (t.includes('2035-04-30')) ok('no off-by-one under UTC-7 (masked doc expiry)', '2035-04-30')
    else fail('off-by-one under UTC-7 (masked doc expiry)', `saved 2035-04-30, the UTC-7 browser does not show it. Page text: ${JSON.stringify(t.slice(0, 300))}`)
    await tz.screenshot({ path: path.join(shots, 'dp-40-person-docs-tz-utc-minus7.png'), fullPage: true })

    // FIX 3, THE assertion that proves it: UTC-7 is the exact configuration
    // where `new Date('YYYY-MM-DD') < new Date()` was wrong, because UTC
    // midnight of today is 17:00 *yesterday* here. "Today" is recomputed from
    // this browser's own clock, which is a different calendar day from the
    // Asia/Kolkata one that uploaded the rows.
    await assertExpiryBadges(tz, 'person detail @UTC-7 (America/Los_Angeles)')
    await tz.screenshot({ path: path.join(shots, 'dp-48-person-badges-tz-utc-minus7.png'), fullPage: true })
  }
  await tz.close()
}

// ---------- 12. the participant surface, also re-read from UTC-7 ----------
// The share link needs no login, so a fresh UTC-7 context can read it directly.
if (participantUrl) {
  const ptz = await browser.newPage({ viewport: { width: 375, height: 812 }, timezoneId: 'America/Los_Angeles' })
  wire(ptz, 'ptz(UTC-7)')
  await ptz.goto(participantUrl, { waitUntil: 'networkidle' })
  await ptz.waitForTimeout(1500)
  const poff = await ptz.evaluate(() => new Date().getTimezoneOffset())
  if (poff <= 0) fail('participant UTC-7 harness', `expected a positive getTimezoneOffset in the UTC-7 context, got ${poff}`)
  else ok('participant page loaded in a UTC-7 context', `getTimezoneOffset=${poff}`)
  await assertExpiryBadges(ptz, 'participant @UTC-7 (America/Los_Angeles, 375px)')
  await ptz.screenshot({ path: path.join(shots, 'dp-49-participant-badges-tz-utc-minus7.png'), fullPage: true })
  await ptz.close()
}

await browser.close()

// favicon 404 is cosmetic; the Settings view intentionally probes /archive and
// treats its 404 as "not archived".
const realErrors = consoleErrors.filter((e) => !/favicon|sourcemap|\/api\/trips\/[\w-]+\/archive/i.test(e))
console.log('\n--- console/page errors (filtered) ---')
if (realErrors.length) { failures++; console.error(realErrors.join('\n')) } else console.log('(none)')
console.log('--- raw console/page errors (unfiltered) ---')
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)')

console.log('\n--- how panels actually opened ---')
console.log(`input click: ${openViaCounts.input}, calendar icon fallback: ${openViaCounts.icon}`)
if (openViaCounts.icon && !openViaCounts.input) {
  console.log('NOTE: every panel in this run had to be opened via the calendar icon — clicking the field is dead.')
}

console.log('\n--- measurements ---')
for (const n of notes) console.log(n)

purgeQaData()

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nDATEPICKER QA OK — now LOOK at e2e/shots/dp-*.png before calling this done.')
