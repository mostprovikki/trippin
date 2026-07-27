// UI click-through gate: drives the real app through every trip section via
// the sidebar, breadcrumb back, and the participant page at mobile width.
// Requires: dev servers up (server PORT=43101, web 43100→API_PROXY=43101),
// organizer demo@example.com / demo-pass-123 seeded.
// Run: node e2e/ui-walk.mjs   (install playwright-core next to this file or
// globally; browser binary comes from the playwright cache, falling back to
// system Chrome — do NOT use `chrome --headless --screenshot`, it hangs on
// Vite's HMR socket)
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
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

const BASE = process.env.BASE_URL || 'http://localhost:43100'
const consoleErrors = []
let failures = 0

function ok(name) { console.log(`ok - ${name}`) }
function fail(name, detail) { failures++; console.error(`FAIL - ${name}: ${detail}`) }

const browser = await chromium.launch({ executablePath: findExecutable() })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} (${m.location()?.url || ''})`) })

async function shot(name) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true })
}

// 1. Login
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await shot('01-login')
await page.getByLabel(/email/i).fill('demo@example.com')
await page.getByLabel(/password/i).fill('demo-pass-123')
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForURL(`${BASE}/`)
await shot('02-trips')
ok('login')

// 2. Create a trip through the wizard (minimal path)
await page.getByRole('button', { name: /new trip/i }).first().click()
await page.waitForURL(/trips\/new/)
await page.locator('input[type="text"], input:not([type])').first().fill(`UI Walk ${Date.now()}`)
// advance through wizard steps until it lands on the trip shell
for (let i = 0; i < 6 && !/\/trips\/(?!new)[\w-]+/.test(page.url()); i++) {
  const btn = page.getByRole('button', { name: /next|create|finish|skip/i }).first()
  if (!(await btn.count())) break
  // The final "Create trip" click navigates while the button is in a loading
  // state — tolerate the detach and just watch for the URL to flip.
  await btn.click({ timeout: 5000 }).catch(() => {})
  await page.waitForURL(/\/trips\/(?!new)[\w-]+/, { timeout: 4000 }).catch(() => {})
  await page.waitForLoadState('networkidle')
}
if (!/\/trips\/(?!new)[\w-]+/.test(page.url())) fail('wizard', `stuck at ${page.url()}`)
else ok('wizard → trip shell')
await shot('03-overview')

// 3. Walk every sidebar section
const SECTIONS = ['Overview', 'Dates', 'Destination', 'Goals', 'People', 'Budget', 'Itinerary', 'Checklists', 'Readiness', 'Settings']
for (const label of SECTIONS) {
  const link = page.locator('.trip-nav-item', { hasText: label }).first()
  if (!(await link.count())) { fail(`sidebar:${label}`, 'nav item missing'); continue }
  await link.click()
  await page.waitForLoadState('networkidle')
  // The active class flips on Vue's post-navigation render — poll for it.
  const becameActive = await page.locator('.trip-nav-active', { hasText: label }).first()
    .waitFor({ timeout: 4000 }).then(() => true).catch(() => false)
  if (!becameActive) fail(`sidebar:${label}`, `active is "${(await page.locator('.trip-nav-active').textContent())?.trim()}"`)
  else ok(`section ${label}`)
  await shot(`04-section-${label.toLowerCase()}`)
}

// 4. Breadcrumb back to Trips
await page.locator('.app-crumb', { hasText: 'Trips' }).first().click()
await page.waitForURL(`${BASE}/`)
ok('breadcrumb → trips')
await shot('05-back-to-trips')

// 5. Participant page at mobile width — find a trip that has participants,
// create a share link from its People section.
let participantUrl = null
const cardCount = await page.locator('.trip-card').count()
for (let i = 0; i < Math.min(cardCount, 5) && !participantUrl; i++) {
  await page.locator('.trip-card').nth(i).click()
  await page.waitForLoadState('networkidle')
  await page.locator('.trip-nav-item', { hasText: 'People' }).first().click()
  await page.waitForLoadState('networkidle')
  // Participant cards render after the layout's trip fetch settles — poll briefly.
  await page.locator('.participant-card').first().waitFor({ timeout: 2500 }).catch(() => {})
  if (await page.locator('.participant-card').count()) {
    await page.getByRole('button', { name: /create link/i }).first().click()
    await page.waitForLoadState('networkidle')
    const code = await page.locator('.link-reveal code').textContent().catch(() => null)
    participantUrl = code?.trim() || null
  }
  if (!participantUrl) {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  }
}
if (participantUrl) {
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } })
  mobile.on('pageerror', (e) => consoleErrors.push(`participant pageerror: ${e.message}`))
  await mobile.goto(participantUrl, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: path.join(shots, '06-participant-mobile.png'), fullPage: true })
  const stepCount = await mobile.locator('.step-card').count()
  if (stepCount !== 3) fail('participant', `expected 3 step cards, got ${stepCount}`)
  else ok('participant mobile')
  await mobile.close()
} else {
  console.log('skip - participant page (no participants on first trip; add one to cover this)')
}

await browser.close()

// favicon 404 is cosmetic; the Settings view intentionally probes /archive and
// treats its 404 as "not archived".
const realErrors = consoleErrors.filter((e) => !/favicon|sourcemap|\/api\/trips\/[\w-]+\/archive/i.test(e))
if (realErrors.length) { failures++; console.error('CONSOLE ERRORS:\n' + realErrors.join('\n')) }
purgeQaData()

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nUI WALK OK — now LOOK at e2e/shots/*.png before calling this done.')
