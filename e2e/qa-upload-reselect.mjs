// Focused gate for the document-upload reset bug: after a successful upload the
// DOM <input type=file> kept the old filename, so re-selecting the SAME file
// fired no change event and the next Upload silently did nothing — exactly one
// upload worked per page load. Covers both surfaces (organizer DocumentList and
// the participant ParticipantDocs) and asserts a FAILED upload keeps the
// selection, since the reset lives in the success path only.
//
// Requires: dev servers already up. Web binds IPv6-only and a corporate
// http_proxy hijacks `localhost`, so the base URL must be http://[::1]:<port>
// and Chromium is launched with --no-proxy-server. The port is 5173 (vite's
// default, and what every other gate uses) — this gate used to default to 5174,
// which on this machine is a *different project's* dev server, so it timed out
// against an app that has no login form rather than reporting a real failure.
// Run: node e2e/qa-upload-reselect.mjs
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
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
const FILE_A = path.join(shots, 'qa-reselect-a.txt')
const FILE_B = path.join(shots, 'qa-reselect-b.txt')
if (!existsSync(FILE_A)) writeFileSync(FILE_A, 'reselect fixture A\n')
if (!existsSync(FILE_B)) writeFileSync(FILE_B, 'reselect fixture B\n')

const consoleErrors = []
let failures = 0
const ok = (n, d) => console.log(`ok - ${n}${d ? ` (${d})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }
const note = (m) => console.log(`  · ${m}`)

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

const rows = () => page.locator('table tbody tr').count()
const fileInput = () => page.locator('#doc-file')
const uploadBtn = () => page.getByRole('button', { name: /^upload/i })

// The filename the browser shows next to the input — the user-visible proof the
// field was actually reset, not just the Vue ref.
const shownFilename = () => fileInput().evaluate((el) => el.value)

async function uploadFile(file, label) {
  const before = await rows()
  await fileInput().setInputFiles(file)
  await uploadBtn().click()
  // Wait for the row count to grow rather than a fixed sleep.
  const grew = await page
    .waitForFunction((n) => document.querySelectorAll('table tbody tr').length > n, before, { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  const after = await rows()
  if (!grew) { fail(label, `row count stayed at ${after} (was ${before}) — the upload silently did nothing`); return false }
  ok(label, `${before} → ${after} rows`)
  return true
}

async function runSurface(label) {
  // 1. First upload works (baseline — this always worked).
  if (!(await uploadFile(FILE_A, `${label}: first upload succeeds`))) return

  // 2. The DOM input must be cleared, or the same file can't be re-picked.
  const cleared = await shownFilename()
  if (cleared === '') ok(`${label}: file input cleared after upload`, 'value=""')
  else fail(`${label}: file input cleared after upload`, `still shows ${JSON.stringify(cleared)} — re-picking this same file will fire no change event`)

  // 3. A second, DIFFERENT file without reloading.
  await uploadFile(FILE_B, `${label}: second DIFFERENT file uploads without reload`)

  // 4. The exact same file again — the case that silently no-opped before.
  await uploadFile(FILE_B, `${label}: the EXACT SAME file re-selected uploads again`)

  // 5. A failed upload must NOT clear the selection.
  await page.route('**/documents', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced"}' }))
  await page.route('**/documents?*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced"}' }))
  const beforeFail = await rows()
  await fileInput().setInputFiles(FILE_A)
  await uploadBtn().click()
  await page.waitForTimeout(1200)
  const afterFail = await rows()
  const keptSelection = await shownFilename()
  if (afterFail !== beforeFail) {
    note(`${label}: could not force a failed upload (rows ${beforeFail} → ${afterFail}); skipping the keep-selection assertion`)
  } else if (keptSelection !== '') {
    ok(`${label}: a FAILED upload keeps the file selection`, `input still holds ${JSON.stringify(keptSelection.split(/[\\/]/).pop())}`)
  } else {
    fail(`${label}: a FAILED upload keeps the file selection`, 'the input was cleared even though the upload failed — the user has to re-pick their file')
  }
  await page.unroute('**/documents')
  await page.unroute('**/documents?*')
}

// ---------- login ----------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/email/i).fill('demo@example.com')
await page.getByLabel(/password/i).fill('demo-pass-123')
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForURL(`${BASE}/`, { timeout: 10000 })
ok('login')

// ---------- surface 1: organizer person detail (DocumentList.vue) ----------
// This gate used to assume a person already existed, which only held because
// earlier gate runs left one behind — and since trips/persons are scoped by
// organizer, the seeded Asha Kumar belongs to demo@tripper.dev, not to the
// demo@example.com this gate logs in as. Now that the gates clean up after
// themselves, create the person we need instead of inheriting someone's litter.
await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
if (!(await page.locator('a[href^="/people/"]').count())) {
  const name = `QA Person ${Date.now() % 100000}`
  await page.getByRole('button', { name: /add person/i }).first().click()
  await page.waitForTimeout(400)
  await page.locator('#pf-name').fill(name)
  await page.locator('#pf-city').fill('Chennai')
  await page.getByRole('button', { name: /^Create$/ }).click()
  await page.waitForURL(/\/people\/[\w-]+/, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
  if (/\/people\/[\w-]+/.test(page.url())) ok('person created', name)
  else fail('person create', `still at ${page.url()}`)
  await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
}
const personLink = page.locator('a[href^="/people/"]').first()
if (!(await personLink.count())) {
  fail('person detail', 'could not create or find a person on /people')
} else {
  await personLink.click()
  await page.waitForURL(/\/people\/[\w-]+/, { timeout: 8000 })
  await page.waitForLoadState('networkidle')
  await runSurface('person detail')
  await page.screenshot({ path: path.join(shots, 'up-01-person-after-uploads.png'), fullPage: true })
}

// ---------- surface 2: participant page (ParticipantDocs.vue) ----------
// Tokens are stored hashed, so an existing link can't be recovered — mint a
// fresh one through the UI, which reveals the URL once.
// A share link needs a trip that has this person as a participant. The gate used
// to just grab trips[0], which silently worked only because previous runs had
// left junk trips behind on this organizer; once the gates clean up, there is
// nothing to inherit and the whole participant surface went unverified. Create
// what we need via the API (cookie-authenticated) rather than depending on
// leftovers.
const tripId = await page.evaluate(async () => {
  const json = (r) => r.json().catch(() => null)
  const listRes = await fetch('/api/trips', { credentials: 'include' }).then(json)
  const list = Array.isArray(listRes) ? listRes : listRes?.trips || []
  let id = list[0]?.id || null
  if (!id) {
    const created = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `QA Upload Trip ${Date.now()}` })
    }).then(json)
    id = created?.id || created?.trip?.id || null
  }
  if (!id) return null
  // Attach the first person so the trip has a participant card to mint from.
  const peopleRes = await fetch('/api/people', { credentials: 'include' }).then(json)
  const people = Array.isArray(peopleRes) ? peopleRes : peopleRes?.people || []
  const personId = people[0]?.id
  if (personId) {
    await fetch(`/api/trips/${id}/participants`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ person_id: personId })
    }).catch(() => {})
  }
  return id
})
let participantUrl = null
if (tripId) {
  await page.goto(`${BASE}/trips/${tripId}/people`, { waitUntil: 'networkidle' })
  await page.locator('.participant-card').first().waitFor({ timeout: 4000 }).catch(() => {})
  if (await page.locator('.participant-card').count()) {
    await page.getByRole('button', { name: /create link/i }).first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(700)
    participantUrl = (await page.locator('.link-reveal code').first().textContent().catch(() => null))?.trim() || null
  }
}

if (!participantUrl) {
  note(`could not mint a participant share link (trip=${tripId}) — participant surface NOT verified`)
} else {
  const token = participantUrl.split('/p/').pop()
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } })
  mobile.on('pageerror', (e) => consoleErrors.push(`pageerror(mobile): ${e.message}`))
  mobile.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`mobile: ${m.text()}`) })
  const desktop = page
  // Point the shared helpers at the mobile page for this section.
  globalThis.__swap = true
  await mobile.goto(`${BASE}/p/${token}`, { waitUntil: 'networkidle' })
  const mFile = mobile.locator('#doc-file')
  if (!(await mFile.count())) {
    note('participant page has no document upload form (profile may need confirming) — skipping')
  } else {
    const mRows = () => mobile.locator('table tbody tr').count()
    const before = await mRows()
    await mFile.setInputFiles(FILE_A)
    await mobile.getByRole('button', { name: /^upload/i }).click()
    await mobile.waitForFunction((n) => document.querySelectorAll('table tbody tr').length > n, before, { timeout: 8000 }).catch(() => {})
    const afterFirst = await mRows()
    if (afterFirst > before) ok('participant: first upload succeeds', `${before} → ${afterFirst} rows`)
    else fail('participant: first upload succeeds', `rows stayed at ${afterFirst}`)

    const mCleared = await mFile.evaluate((el) => el.value)
    if (mCleared === '') ok('participant: file input cleared after upload', 'value=""')
    else fail('participant: file input cleared after upload', `still shows ${JSON.stringify(mCleared)}`)

    const beforeSame = await mRows()
    await mFile.setInputFiles(FILE_A)
    await mobile.getByRole('button', { name: /^upload/i }).click()
    await mobile.waitForFunction((n) => document.querySelectorAll('table tbody tr').length > n, beforeSame, { timeout: 8000 }).catch(() => {})
    const afterSame = await mRows()
    if (afterSame > beforeSame) ok('participant: the EXACT SAME file re-selected uploads again', `${beforeSame} → ${afterSame} rows`)
    else fail('participant: the EXACT SAME file re-selected uploads again', `rows stayed at ${afterSame} — the silent no-op is still present`)

    await mobile.screenshot({ path: path.join(shots, 'up-02-participant-after-uploads.png'), fullPage: true })
  }
  await mobile.close()
  void desktop
}

console.log('\n--- console/page errors ---')
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)')
await browser.close()
purgeQaData()

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nUPLOAD RESELECT OK')
