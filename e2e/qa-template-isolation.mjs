// Checklist-template isolation gate.
//
// Templates have trip_id NULL, so before migration 003 they had no owner at all:
// `ownedChecklist` let any organizer through on `is_template = 1`. That was not
// just a visibility leak — another organizer could rename, delete, add items to,
// and clone your templates, and every one of them showed up in their search.
//
// The server suite proves the API boundary. What it cannot prove is the half
// that actually regresses: the owner's own screens still have to show the
// template. Scoping a query is one character away from scoping it to nobody, and
// an empty dropdown looks exactly like a working one to a passing API test. So
// this drives both sides through the real UI — A's template dropdown and search
// must contain it, B's must not.
//
// Requires: dev servers up (server on :3000, web on :5173) and both seeded
// organizers. Vite binds IPv6-only and a corporate http_proxy hijacks
// `localhost`, so BASE must be http://[::1]:<port> and Chromium needs
// --no-proxy-server.
// Run: node e2e/qa-template-isolation.mjs
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { purgeQaData } from './purge-qa.mjs'

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
// The two seeded organizers. Isolation is only testable with a real second one.
const ORG_A = { email: process.env.QA_EMAIL || 'demo@example.com', password: process.env.QA_PASSWORD || 'demo-pass-123' }
const ORG_B = { email: process.env.QA_EMAIL_B || 'demo@tripper.dev', password: process.env.QA_PASSWORD_B || 'demo-pass-1234' }

// A term unlikely to collide with seeded data, so a hit is unambiguously ours.
const STAMP = String(process.pid)
const TEMPLATE_NAME = `QA Template Iso ${STAMP}`
const ITEM_TITLE = `isoqasunscreen${STAMP}`

const failures = []
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`)
  if (!ok) failures.push(label)
}

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server'] })

// Each organizer needs its own context: contexts share cookies, and a second
// login in the same one would just replace the first session.
async function openAs({ email, password }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel(/email/i).fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
  return { context, page }
}

// Fixtures go in through the API (in-page, so the session cookie applies); every
// assertion below is made against the rendered UI.
async function api(page, method, url, body) {
  return page.evaluate(async ([m, u, b]) => {
    const res = await fetch(u, {
      method: m,
      headers: b ? { 'Content-Type': 'application/json' } : undefined,
      body: b ? JSON.stringify(b) : undefined
    })
    return { status: res.status, body: res.status === 204 ? null : await res.json() }
  }, [method, url, body])
}

const a = await openAs(ORG_A)
const b = await openAs(ORG_B)

const aMe = await a.page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).organizer)
const bMe = await b.page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).organizer)
console.log(`   A session=${aMe.email} ${aMe.id}`)
console.log(`   B session=${bMe.email} ${bMe.id}`)
check('the two sessions are different organizers', aMe.id !== bMe.id)

// --- fixtures -------------------------------------------------------------
const tmpl = await api(a.page, 'POST', '/api/checklists', {
  kind: 'packing', name: TEMPLATE_NAME, is_template: true, trip_type_tags: ['beach']
})
check('organizer A can create a template', tmpl.status === 201, `status ${tmpl.status}`)
const templateId = tmpl.body?.checklist?.id
console.log(`   template=${templateId} name=${TEMPLATE_NAME}`)
await api(a.page, 'POST', `/api/checklists/${templateId}/items`, { title: ITEM_TITLE })

// A trip per organizer, so each has a checklists screen with the template Select.
const aTrip = await api(a.page, 'POST', '/api/trips', { name: `Iso QA Trip A ${STAMP}` })
const bTrip = await api(b.page, 'POST', '/api/trips', { name: `Iso QA Trip B ${STAMP}` })

// --- the template dropdown (GET /checklists?template=1) -------------------
// Reading the Select's options rather than its rendered label: PrimeVue only
// paints the overlay on open, and the option list is the actual query result.
async function templateOptions(page, tripId) {
  await page.goto(`${BASE}/trips/${tripId}/checklists`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const select = page.locator('[aria-label="Template"]').first()
  await select.click()
  await page.waitForTimeout(300)
  const names = await page.locator('.p-select-option, .p-dropdown-item').allTextContents()
  await page.keyboard.press('Escape')
  return names.map((n) => n.trim())
}

const aOptions = await templateOptions(a.page, aTrip.body.trip.id)
check("A's template dropdown lists A's template", aOptions.includes(TEMPLATE_NAME),
  `${aOptions.length} option(s)`)

const bOptions = await templateOptions(b.page, bTrip.body.trip.id)
console.log(`   A options: ${JSON.stringify(aOptions)}`)
console.log(`   B options: ${JSON.stringify(bOptions)}`)
check("B's template dropdown excludes A's template", !bOptions.includes(TEMPLATE_NAME),
  `${bOptions.length} option(s)`)

// --- global search --------------------------------------------------------
// Searching the ITEM title, not the template name: matching an item is the path
// that reaches the template through a subquery, so it exercises the scoping the
// hardest.
async function searchTemplateHits(page) {
  await page.goto(`${BASE}/search?q=${encodeURIComponent(ITEM_TITLE)}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  return page.locator('body').innerText()
}

const aText = await searchTemplateHits(a.page)
check("A's search finds A's template", aText.includes(TEMPLATE_NAME))

const bText = await searchTemplateHits(b.page)
check("B's search does not find A's template", !bText.includes(TEMPLATE_NAME))

// --- the write surface ----------------------------------------------------
// Isolation that only hides a row is not isolation; B must not be able to touch it.
const bDelete = await api(b.page, 'DELETE', `/api/checklists/${templateId}`)
check("B cannot delete A's template", bDelete.status === 404, `status ${bDelete.status}`)
const stillThere = await api(a.page, 'GET', '/api/checklists?template=1')
check("A's template survived B's delete",
  (stillThere.body?.checklists || []).some((c) => c.id === templateId))

await browser.close()
purgeQaData()

console.log(failures.length ? `\nFAILED: ${failures.join(', ')}` : '\nTEMPLATE ISOLATION OK')
process.exit(failures.length ? 1 : 0)
