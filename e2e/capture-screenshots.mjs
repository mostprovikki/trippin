// Screenshot capture for design-baseline comparison.
//
// Walks every screen in the app and saves a PNG per screen per theme, so a
// later redesign can be diffed against this run. Not a gate — it asserts only
// that a page rendered *something* (a blank or spinner-only frame is useless as
// a baseline) and prints a warning; it does not judge the UI.
//
// Themes come from two separate browser contexts with `colorScheme` set rather
// than by clicking the in-app toggle: a fresh context has nothing in storage, so
// the OS preference is what App.vue reads, and dark is applied before Vue mounts
// (no white flash captured mid-transition).
//
// Requires: dev servers up, and e2e/seed-demo.mjs already run so the screens
// have data in them. Vite binds IPv6-only and a corporate http_proxy hijacks
// `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
//
// Run: node e2e/capture-screenshots.mjs [outDir]
import { existsSync, readdirSync, mkdirSync } from 'node:fs'
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
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (existsSync(systemChrome)) return systemChrome
  throw new Error('No chromium headless shell in the playwright cache and no system Chrome found')
}

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
const EMAIL = process.env.QA_EMAIL || 'demo@tripper.dev'
const PASSWORD = process.env.QA_PASSWORD || 'tripper1234'
const OUT = process.argv[2] || path.resolve('../working_prototype_screenshots/v0')

// A maximised Chrome window on this 3024x1964 Retina display is ~1512x945
// logical points. deviceScaleFactor 2 captures at native density so text is
// crisp when the baseline is compared side by side later.
const VIEWPORT = { width: 1512, height: 945 }
const SCALE = 2

// Seeded by e2e/seed-demo.mjs.
const TRIPS = {
  flagship: '8da9c5b4-b32a-4af7-984f-26258638afa0', // Vietnam & Cambodia 2026, confirmed, full
  idea: 'd88e2c90-69d0-4aa7-9a04-8209a5d6f2f6',     // Ladakh, idea stage, undecided candidates
  active: '4369fd30-5988-4cf4-a011-635afc483322',   // Kerala, active
  archived: 'ab406df3-c765-4fd3-bc9a-de797f566a1c'  // Bali, archived (settings shows actuals)
}
const PERSON = '32f64cde-1626-49f3-85fe-f440fdda609f' // Priya Iyer — 2 docs, one expired
// Participants whose /p/<token> screens we want: one with a confirmed profile
// (the filled-in state) and one still pending (the empty/prompting state).
const PARTICIPANTS = [
  { label: '16-participant-confirmed', personId: '81f1684a-012d-4fe6-af0b-62cea56d709c' }, // Asha Kumar
  { label: '17-participant-pending', personId: '1b886dc0-e0bf-47d2-a346-ae8298c50eac' }    // Aditya Sharma
]
const SECTIONS = ['', 'dates', 'destination', 'goals', 'people', 'budget', 'itinerary', 'checklists', 'readiness', 'settings']

const warnings = []
let shots = 0
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: findExecutable(),
  args: ['--no-proxy-server', '--proxy-bypass-list=*', '--force-color-profile=srgb', '--hide-scrollbars']
})

// Participant tokens have to be MINTED, not listed: GET /trips/:id/links
// returns only token hashes, so the raw token is visible exactly once, in the
// 201 from the mint call. Minting revokes that person's previous link — fine
// here, but it does mean any /p/<token> URL printed by an earlier run dies.
// Minted once and reused across both themes.
async function mintTokens() {
  const api = await browser.newContext()
  const login = await api.request.post(`${BASE}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } })
  if (!login.ok()) { warnings.push(`participant mint: login failed ${login.status()}`); await api.close(); return [] }
  const out = []
  for (const p of PARTICIPANTS) {
    const res = await api.request.post(`${BASE}/api/trips/${TRIPS.flagship}/participants/${p.personId}/link`, { data: {} })
    if (!res.ok()) { warnings.push(`participant mint ${p.label}: ${res.status()}`); continue }
    const body = await res.json()
    if (body.token) out.push({ ...p, token: body.token })
  }
  await api.close()
  return out
}

const links = await mintTokens()
if (links.length < PARTICIPANTS.length) warnings.push(`minted only ${links.length}/${PARTICIPANTS.length} participant links`)

async function capture(page, theme, name) {
  // Let fonts, images and any entrance transition settle before the frame.
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await page.waitForTimeout(500)

  const r = await page.evaluate(() => {
    const root = document.querySelector('main, .trip-shell, #app') || document.body
    return {
      chars: (root.innerText || '').trim().length,
      spinnerOnly: !!document.querySelector('.p-progressspinner') && (root.innerText || '').trim().length < 40,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      dark: document.documentElement.classList.contains('app-dark')
    }
  })

  if (r.chars < 25) warnings.push(`${theme}/${name}: only ${r.chars} chars of text — likely blank`)
  if (r.spinnerOnly) warnings.push(`${theme}/${name}: spinner only after settle`)
  if (theme === 'dark' && !r.dark) warnings.push(`${theme}/${name}: html.app-dark missing`)
  if (theme === 'light' && r.dark) warnings.push(`${theme}/${name}: app-dark set on a light capture`)

  const base = `${name}--${theme}`
  await page.screenshot({ path: path.join(OUT, `${base}.png`) })
  shots++

  // Pages taller than the window get a second, whole-page frame so nothing
  // below the fold is lost from the baseline.
  const tall = r.scrollH > r.clientH + 40
  if (tall) {
    await page.screenshot({ path: path.join(OUT, `${base}--fullpage.png`), fullPage: true })
    shots++
  }
  console.log(`  ${base}${tall ? ' (+fullpage)' : ''}  ${r.chars} chars`)
}

async function run(theme) {
  console.log(`\n=== ${theme} ===`)
  const ctx = await browser.newContext({ colorScheme: theme, viewport: VIEWPORT, deviceScaleFactor: SCALE })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => warnings.push(`${theme}: pageerror ${e.message}`))

  const go = async (url) => { await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }) }

  // --- login (before any session exists) ---
  await go('/login')
  await capture(page, theme, '01-login')

  await page.getByLabel(/email/i).fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

  // --- top-level shell ---
  await capture(page, theme, '02-trips-list')

  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(400)
  await page.keyboard.type('viet', { delay: 40 })
  await page.waitForTimeout(900)
  await capture(page, theme, '03-command-palette')
  await page.keyboard.press('Escape')

  await go('/trips/new')
  await capture(page, theme, '04-trip-new')

  // --- flagship trip: every section ---
  for (const [i, s] of SECTIONS.entries()) {
    await go(`/trips/${TRIPS.flagship}${s ? `/${s}` : ''}`)
    await capture(page, theme, `05-${String(i).padStart(2, '0')}-trip-${s || 'overview'}`)
  }

  // --- other trip states ---
  await go(`/trips/${TRIPS.idea}`)
  await capture(page, theme, '06-idea-trip-overview')
  await go(`/trips/${TRIPS.idea}/destination`)
  await capture(page, theme, '07-idea-trip-destination-undecided')
  await go(`/trips/${TRIPS.idea}/dates`)
  await capture(page, theme, '08-idea-trip-dates-windows')
  await go(`/trips/${TRIPS.active}`)
  await capture(page, theme, '09-active-trip-overview')
  await go(`/trips/${TRIPS.archived}`)
  await capture(page, theme, '10-archived-trip-overview')
  await go(`/trips/${TRIPS.archived}/settings`)
  await capture(page, theme, '11-archived-trip-settings-actuals')

  // --- people ---
  await go('/people')
  await capture(page, theme, '12-people-list')
  await go(`/people/${PERSON}`)
  await capture(page, theme, '13-person-detail-with-documents')

  // --- search + 404 ---
  await go('/search?q=vietnam')
  await capture(page, theme, '14-search-results')
  await go('/no-such-page')
  await capture(page, theme, '15-not-found')

  await ctx.close()

  // --- participant view: public, bare shell, its own context (no organizer session) ---
  for (const link of links) {
    const pctx = await browser.newContext({ colorScheme: theme, viewport: VIEWPORT, deviceScaleFactor: SCALE })
    const ppage = await pctx.newPage()
    ppage.on('pageerror', (e) => warnings.push(`${theme}: pageerror ${e.message}`))
    await ppage.goto(`${BASE}/p/${link.token}`, { waitUntil: 'domcontentloaded' })
    await capture(ppage, theme, link.label)
    await pctx.close()
  }
}

await run('light')
await run('dark')
await browser.close()

console.log(`\n${shots} screenshots written to ${OUT}`)
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`)
  for (const w of warnings) console.log(`  ! ${w}`)
} else {
  console.log('no warnings — every captured screen rendered content in the expected theme')
}
