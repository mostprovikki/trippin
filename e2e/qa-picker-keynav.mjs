// Keyboard-navigation gate for the DateField calendar.
//
// The bug this pins down: PrimeVue's onDateCellKeydown resolves ArrowLeft /
// ArrowRight against `cell.parentElement.children` — the seven cells of the
// current WEEK row. At a row edge nextElementSibling/previousElementSibling is
// null, so it falls through to navigateToMonth(), which for a single-month
// panel calls navForward/navBackward. Result: arrowing right off a Saturday
// jumps a whole MONTH instead of stepping to the adjacent Sunday, and arrowing
// left off a Sunday jumps a month back. Roving focus across a calendar is
// supposed to be day-by-day continuous.
//
// The gate walks a full month one ArrowRight at a time and asserts the focused
// date advances by exactly one day each press, then does the same backwards.
//
// Requires: dev servers up. Vite binds IPv6-only and a corporate http_proxy
// hijacks `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-picker-keynav.mjs
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'shots')
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

const BASE = process.env.BASE_URL || 'http://[::1]:5173'
const EMAIL = process.env.QA_EMAIL || 'demo@example.com'
const PASSWORD = process.env.QA_PASSWORD || 'demo-pass-123'

let failures = 0
const consoleErrors = []
function ok(name, extra) { console.log(`ok - ${name}${extra ? ` (${extra})` : ''}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

// Long enough to cross at least two month boundaries in each direction, so the
// fix is proven to keep working after a page rather than just once.
const WALK = 75

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// Read the panel's visible month/year plus the day number that currently holds
// focus, and resolve them into a real calendar date. The focused cell may be a
// leading/trailing day from an adjacent month, which the aria-label on the <td>
// does not disambiguate — so use the cell's position in the grid to decide
// whether the day belongs to the previous, current, or next month.
async function focusState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.p-datepicker-panel')
    if (!panel) return { error: 'no panel' }
    const monthEl = panel.querySelector('.p-datepicker-select-month')
    const yearEl = panel.querySelector('.p-datepicker-select-year')
    const active = document.activeElement
    if (!active || !active.classList.contains('p-datepicker-day')) {
      return { error: 'focus is not on a day cell', activeClass: active ? active.className : null }
    }
    const td = active.parentElement
    const tr = td.parentElement
    const tbody = tr.parentElement
    const rowIndex = Array.from(tbody.children).indexOf(tr)
    const colIndex = Array.from(tr.children).indexOf(td)
    const rowCount = tbody.children.length
    return {
      month: monthEl ? monthEl.textContent.trim() : null,
      year: yearEl ? Number(yearEl.textContent.trim()) : null,
      day: Number(active.textContent.trim()),
      // PrimeVue puts data-p-other-month on the <td>, not the day <span>.
      otherMonth: td.getAttribute('data-p-other-month') === 'true',
      rowIndex,
      colIndex,
      rowCount
    }
  })
}

// Turn a focusState into a YYYY-MM-DD. Cells flagged other-month are the grey
// filler days: leading ones can only appear in row 0 (so they belong to the
// previous month) and trailing ones only in the later rows (the next month).
// That is exact — no guessing from the day number, which is what made an
// earlier version of this gate misreport the ArrowLeft trail.
function resolveDate(s) {
  if (s.error) return null
  let monthIdx = MONTHS.indexOf(s.month)
  let year = s.year
  if (monthIdx < 0 || !year) return null
  if (s.otherMonth) {
    if (s.rowIndex === 0) { monthIdx -= 1; if (monthIdx < 0) { monthIdx = 11; year -= 1 } }
    else { monthIdx += 1; if (monthIdx > 11) { monthIdx = 0; year += 1 } }
  }
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`
}

// Crossing a month edge pages the panel, which is an async Vue re-render plus a
// focus hand-off, so a fixed short delay samples it mid-flight and reports a
// bogus "focus is not on a day cell". Poll until focus settles back onto a day.
async function settledFocusState(page, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  let last = await focusState(page)
  while (last.error && Date.now() < deadline) {
    await page.waitForTimeout(60)
    last = await focusState(page)
  }
  return last
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// ---------- login ----------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill(EMAIL)
await page.getByLabel(/password/i).fill(PASSWORD)
await page.getByRole('button', { name: /sign in|log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
ok('login', EMAIL)

// ---------- fixtures ----------
// Create the trip rather than reusing whatever the dev DB happens to hold: the
// gates purge their own rows now, so there is nothing to inherit, and a gate
// that depends on leftovers either breaks or silently measures nothing.
const tripId = await page.evaluate(async () => {
  const json = (r) => r.json().catch(() => null)
  let trips = await fetch('/api/trips', { credentials: 'include' }).then(json)
  trips = Array.isArray(trips) ? trips : trips?.trips || []
  if (trips[0]?.id) return trips[0].id
  const t = await fetch('/api/trips', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Keynav QA ${Date.now()}` })
  }).then(json)
  return t?.id || t?.trip?.id || null
})
if (!tripId) {
  fail('fixtures', 'could not create a trip to host a date field')
  await browser.close()
  process.exit(1)
}

// ---------- open a picker and put focus on a day ----------
await page.goto(`${BASE}/trips/${tripId}/dates`, { waitUntil: 'networkidle' })
// A fresh trip has no date windows, so no DateField renders until one is added.
if (!(await page.locator('input.p-datepicker-input').count())) {
  const add = page.getByRole('button', { name: /add date window/i }).first()
  if (await add.count()) {
    await add.click()
    await page.waitForTimeout(400)
  }
}
const input = page.locator('input.p-datepicker-input').first()
await input.click({ force: true }).catch(() => {})
// ArrowDown on the input opens the overlay and hands focus to a day cell.
await input.press('ArrowDown')
const panel = page.locator('.p-datepicker-panel').first()
if (!(await panel.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false))) {
  fail('open picker', 'panel never became visible')
} else {
  await page.waitForTimeout(400)
  let st = await focusState(page)
  if (st.error) {
    // Some builds leave focus on the input; nudge once more.
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(250)
    st = await focusState(page)
  }
  if (st.error) {
    fail('focus a day cell', `${st.error}${st.activeClass ? ` (active=${st.activeClass})` : ''}`)
  } else {
    ok('focus a day cell', `${st.month} ${st.year}, day ${st.day} (row ${st.rowIndex}, col ${st.colIndex})`)
    await page.screenshot({ path: path.join(shots, 'keynav-01-open.png') })

    // ---------- walk ArrowRight across ~5 weeks, one day at a time ----------
    let start = resolveDate(st)
    if (!start) {
      fail('resolve start date', JSON.stringify(st))
    } else {
      let cur = start
      let firstBreak = null
      const trail = [cur]
      for (let i = 0; i < WALK; i++) {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(90)
        const s2 = await settledFocusState(page)
        if (s2.error) {
          firstBreak = firstBreak || { at: cur, why: s2.error, activeClass: s2.activeClass }
          break
        }
        const got = resolveDate(s2)
        const want = addDays(cur, 1)
        trail.push(got)
        if (got !== want && !firstBreak) {
          const jump = got && cur
            ? Math.round((new Date(got) - new Date(cur)) / 86400000)
            : null
          firstBreak = { at: cur, want, got, jump, col: s2.colIndex }
        }
        cur = got
      }
      if (firstBreak) {
        const j = firstBreak.jump
        fail('ArrowRight steps one day at a time',
          (firstBreak.why
            ? `at ${firstBreak.at} focus was lost: ${firstBreak.why}${firstBreak.activeClass ? ` (active=${firstBreak.activeClass})` : ''}`
            : `at ${firstBreak.at} expected ${firstBreak.want} but focus landed on ${firstBreak.got}`) +
          (j !== null ? ` (jumped ${j} days)` : '') +
          `\n         trail: ${trail.slice(0, 12).join(' -> ')}${trail.length > 12 ? ' ...' : ''}`)
      } else {
        ok('ArrowRight steps one day at a time', `${trail.length} presses, ${trail[0]} -> ${trail[trail.length - 1]}`)
      }

      // ---------- and the same backwards ----------
      let back = resolveDate(await settledFocusState(page))
      let backBreak = null
      const backTrail = [back]
      for (let i = 0; i < WALK; i++) {
        await page.keyboard.press('ArrowLeft')
        await page.waitForTimeout(90)
        const s2 = await settledFocusState(page)
        if (s2.error) {
          backBreak = backBreak || { at: back, why: s2.error, activeClass: s2.activeClass }
          break
        }
        const got = resolveDate(s2)
        const want = addDays(back, -1)
        backTrail.push(got)
        if (got !== want && !backBreak) {
          const jump = got && back ? Math.round((new Date(got) - new Date(back)) / 86400000) : null
          backBreak = { at: back, want, got, jump }
        }
        back = got
      }
      if (backBreak) {
        const j = backBreak.jump
        fail('ArrowLeft steps one day at a time',
          (backBreak.why
            ? `at ${backBreak.at} focus was lost: ${backBreak.why}${backBreak.activeClass ? ` (active=${backBreak.activeClass})` : ''}`
            : `at ${backBreak.at} expected ${backBreak.want} but focus landed on ${backBreak.got}`) +
          (j !== null ? ` (jumped ${j} days)` : '') +
          `\n         trail: ${backTrail.slice(0, 12).join(' -> ')}${backTrail.length > 12 ? ' ...' : ''}`)
      } else {
        ok('ArrowLeft steps one day at a time', `${backTrail.length} presses, ${backTrail[0]} -> ${backTrail[backTrail.length - 1]}`)
      }

      // ---------- the arrowed-to date must still be selectable ----------
      // Moving focus is only half the job: if the override left focus on a cell
      // PrimeVue does not consider current, Enter would commit the wrong day (or
      // nothing). Arrow across a month edge, then commit and read the input back.
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(120)
      const target = resolveDate(await settledFocusState(page))
      if (!target) {
        fail('Enter commits the focused date', 'could not read the focused date')
      } else {
        await page.keyboard.press('Enter')
        await page.waitForTimeout(400)
        const shown = await input.inputValue()
        if (shown === target) ok('Enter commits the focused date', `input reads ${shown}`)
        else fail('Enter commits the focused date', `focus was on ${target} but the input reads ${shown}`)
      }
      await page.screenshot({ path: path.join(shots, 'keynav-02-after-commit.png') })
    }
  }
}

// ---------- report ----------
console.log('')
if (consoleErrors.length) {
  console.error(`console errors (${consoleErrors.length}):`)
  for (const e of consoleErrors.slice(0, 10)) console.error(`  ! ${e}`)
  failures += consoleErrors.length
}
await browser.close()
purgeQaData()
console.log(failures ? `KEYNAV QA FAILED (${failures})` : 'KEYNAV QA OK')
process.exit(failures ? 1 : 0)
