// E2E smoke test: full organizer + participant golden path against a real,
// in-process server instance on a random port with a throwaway temp DB.
// Run: node e2e/smoke.mjs
//
// No test framework, no mocks beyond LLM_PROVIDER=none (which is the real
// "AI disabled" code path, not a stub). Every stage is a small function that
// logs its name on success; the first failed assertion throws and exits 1.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const tmpDir = mkdtempSync(path.join(tmpdir(), 'tp-smoke-'))
const dbPath = path.join(tmpDir, 'smoke.db')
const uploadsDir = path.join(tmpDir, 'uploads')

process.env.DB_PATH = dbPath
process.env.UPLOADS_DIR = uploadsDir
process.env.LLM_PROVIDER = 'none'
process.env.JWT_SECRET = 'smoke-test-secret-do-not-use-elsewhere-0000000000'
process.env.NODE_ENV = 'test' // silences fastify's logger

const ORGANIZER = { email: 'smoke-organizer@example.com', name: 'Smoke Organizer', password: 'smoke-pass-1234' }

let BASE // set once the server is listening
let app, db

function req(method, urlPath, { cookie, token, body, form } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) {
    payload = form
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  return fetch(`${BASE}${urlPath}`, { method, headers, body: payload }).then(async (res) => {
    const text = await res.text()
    let json = null
    if (text) {
      try { json = JSON.parse(text) } catch { json = text }
    }
    return { status: res.status, json, headers: res.headers }
  })
}

function pdfBlob(sizeBytes = 64, byte = 0x25) {
  return new Blob([Buffer.alloc(sizeBytes, byte)], { type: 'application/pdf' })
}

// ---- state threaded across stages ----
const state = {}

async function stage1_seedAndLogin() {
  const seed = spawnSync(process.execPath, [
    path.join(root, 'server/scripts/seed-organizer.js'),
    `--email=${ORGANIZER.email}`,
    `--name=${ORGANIZER.name}`,
    `--password=${ORGANIZER.password}`,
  ], { env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8' })
  assert.equal(seed.status, 0, `seed-organizer.js failed: ${seed.stderr}`)

  const { openDb } = await import(path.join(root, 'server/src/db.js'))
  const { buildApp } = await import(path.join(root, 'server/src/app.js'))
  db = openDb(dbPath)
  app = await buildApp({ db })
  await app.listen({ port: 0, host: '127.0.0.1' })
  BASE = `http://127.0.0.1:${app.server.address().port}/api`

  const res = await req('POST', '/auth/login', { body: { email: ORGANIZER.email, password: ORGANIZER.password } })
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.json)}`)
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]
  const sessionCookie = setCookies.find((c) => c && c.startsWith('tp_session='))
  assert.ok(sessionCookie, 'no tp_session cookie on login response')
  state.cookie = sessionCookie.split(';')[0]
  console.log('ok 1 - seed organizer + login')
}

async function stage2_peopleAndTrip() {
  const p1 = await req('POST', '/people', { cookie: state.cookie, body: { name: 'Asha Rao', dietary: 'veg' } })
  assert.equal(p1.status, 201)
  const p2 = await req('POST', '/people', { cookie: state.cookie, body: { name: 'Ravi Menon', dietary: 'non_veg' } })
  assert.equal(p2.status, 201)
  state.p1 = p1.json.person
  state.p2 = p2.json.person

  const trip = await req('POST', '/trips', {
    cookie: state.cookie,
    body: { name: 'Goa Getaway', vibe_tags: ['beach', 'chill'], origin_city: 'Chennai', participant_ids: [state.p1.id, state.p2.id] },
  })
  assert.equal(trip.status, 201, `trip create failed: ${JSON.stringify(trip.json)}`)
  const t = trip.json.trip
  assert.equal(t.date_mode, 'broad')
  assert.equal(t.destination_mode, 'open')
  assert.equal(t.status, 'idea')
  assert.equal(t.participants.length, 2)
  state.tripId = t.id
  console.log('ok 2 - 2 people (one veg) + trip (broad/open, both participants)')
}

async function stage3_destinationDecide() {
  const cand = await req('POST', `/trips/${state.tripId}/candidates`, { cookie: state.cookie, body: { name: 'Goa' } })
  assert.equal(cand.status, 201)
  const decide = await req('POST', `/candidates/${cand.json.candidate.id}/decide`, { cookie: state.cookie })
  assert.equal(decide.status, 200)
  assert.equal(decide.json.trip.destination, 'Goa')
  assert.equal(decide.json.trip.destination_mode, 'decided')
  console.log('ok 3 - manual destination candidate decided')
}

async function stage4_confirmDates() {
  const toPlanning = await req('POST', `/trips/${state.tripId}/status`, { cookie: state.cookie, body: { status: 'planning' } })
  assert.equal(toPlanning.status, 200)

  const setDates = await req('PUT', `/trips/${state.tripId}`, {
    cookie: state.cookie,
    body: { date_mode: 'confirmed', start_date: '2026-11-02', end_date: '2026-11-04' },
  })
  assert.equal(setDates.status, 200)

  const toConfirmed = await req('POST', `/trips/${state.tripId}/status`, { cookie: state.cookie, body: { status: 'confirmed' } })
  assert.equal(toConfirmed.status, 200, `confirm transition failed: ${JSON.stringify(toConfirmed.json)}`)
  assert.equal(toConfirmed.json.trip.status, 'confirmed')
  console.log('ok 4 - confirmed dates + status planning -> confirmed')
}

async function stage5_linkAndParticipantIntake() {
  const link = await req('POST', `/trips/${state.tripId}/participants/${state.p1.id}/link`, { cookie: state.cookie, body: {} })
  assert.equal(link.status, 201)
  state.token = link.json.token

  const me = await req('GET', '/participant/me', { token: state.token })
  assert.equal(me.status, 200)
  assert.ok(!('participants' in me.json.trip), 'participant/me leaked the full participants list')
  assert.equal(me.json.person.id, state.p1.id)

  const profile = await req('PUT', '/participant/profile', {
    token: state.token,
    body: { dietary: 'veg', interests: ['snorkeling'] },
  })
  assert.equal(profile.status, 200)
  assert.equal(profile.json.person.dietary, 'veg')

  const form = new FormData()
  form.append('file', pdfBlob(128), 'passport.pdf')
  form.append('doc_type', 'passport')
  const upload = await req('POST', '/participant/documents', { token: state.token, form })
  assert.equal(upload.status, 201, `doc upload failed: ${JSON.stringify(upload.json)}`)
  assert.equal(upload.json.document.person_id, state.p1.id)

  const checklist = await req('GET', '/participant/checklist', { token: state.token })
  assert.equal(checklist.status, 200)
  assert.ok(Array.isArray(checklist.json.packing) && Array.isArray(checklist.json.tasks))
  console.log('ok 5 - participant link: me (no leak), profile confirm, doc upload, checklist')
}

async function stage6_budget() {
  const put = await req('PUT', `/trips/${state.tripId}/budget`, {
    cookie: state.cookie,
    body: { lines: [{ category: 'stay', estimate: 12000, basis: '2n x 6k' }, { category: 'food', estimate: 6000 }] },
  })
  assert.equal(put.status, 200)
  assert.equal(put.json.total, 18000)
  assert.equal(put.json.participant_count, 2)
  assert.equal(put.json.equal_share, 9000)
  state.budgetTotal = put.json.total

  const aiDraft = await req('POST', `/trips/${state.tripId}/budget/ai-draft`, { cookie: state.cookie })
  assert.equal(aiDraft.status, 503)
  assert.equal(aiDraft.json.error.code, 'AI_DISABLED')
  console.log('ok 6 - budget lines + equal_share, ai-draft 503 AI_DISABLED')
}

async function stage7_itinerary() {
  const init = await req('POST', `/trips/${state.tripId}/itinerary/init`, { cookie: state.cookie })
  assert.equal(init.status, 200)
  assert.equal(init.json.days.length, 3) // Nov 2, 3, 4
  const dayId = init.json.days[0].id

  const item1 = await req('POST', `/days/${dayId}/items`, { cookie: state.cookie, body: { title: 'Arrive & check in' } })
  assert.equal(item1.status, 201)
  const item2 = await req('POST', `/days/${dayId}/items`, { cookie: state.cookie, body: { title: 'Beach walk' } })
  assert.equal(item2.status, 201)

  const reorder = await req('PUT', `/days/${dayId}/items/order`, {
    cookie: state.cookie,
    body: { item_ids: [item2.json.id, item1.json.id] },
  })
  assert.equal(reorder.status, 200)
  assert.deepEqual(reorder.json.items.map((i) => i.id), [item2.json.id, item1.json.id])
  console.log('ok 7 - itinerary init + add items + reorder')
}

async function stage8_checklistFromScratch() {
  const checklist = await req('POST', '/checklists', {
    cookie: state.cookie,
    body: { kind: 'packing', name: 'Packing List', trip_id: state.tripId },
  })
  assert.equal(checklist.status, 201)

  const item = await req('POST', `/checklists/${checklist.json.checklist.id}/items`, {
    cookie: state.cookie,
    body: { title: 'Sunscreen', assignee_person_id: state.p1.id },
  })
  assert.equal(item.status, 201)
  state.checklistItemId = item.json.id

  const tick = await req('PUT', `/participant/checklist-items/${item.json.id}`, { token: state.token, body: { done: true } })
  assert.equal(tick.status, 200, `tick failed: ${JSON.stringify(tick.json)}`)
  assert.equal(tick.json.done, 1)
  console.log('ok 8 - checklist from scratch + participant ticks assigned item')
}

async function stage9_readiness() {
  const readiness = await req('GET', `/trips/${state.tripId}/readiness`, { cookie: state.cookie })
  assert.equal(readiness.status, 200)
  const body = readiness.json
  const p1Readiness = body.participants.find((p) => p.person_id === state.p1.id)
  assert.equal(p1Readiness.profile_confirmed, 1)
  assert.ok(p1Readiness.docs_count >= 1)
  assert.deepEqual(body.decisions, {
    dates_confirmed: true, destination_decided: true, budget_drafted: true, itinerary_days: 3,
  })
  console.log('ok 9 - readiness: confirmed profile + doc count + decisions flags')
}

async function stage10_archiveAndClone() {
  const archive = await req('POST', `/trips/${state.tripId}/archive`, {
    cookie: state.cookie,
    body: { notes: 'Great trip!', photo_links: ['http://example.com/1.jpg'] },
  })
  assert.equal(archive.status, 200)
  assert.equal(archive.json.archive.notes, 'Great trip!')

  const trip = await req('GET', `/trips/${state.tripId}`, { cookie: state.cookie })
  assert.equal(trip.json.trip.status, 'archived')

  const meAfterArchive = await req('GET', '/participant/me', { token: state.token })
  assert.equal(meAfterArchive.status, 401, 'participant link should be revoked after archive')

  const clone = await req('POST', `/trips/${state.tripId}/clone`, { cookie: state.cookie, body: { name: 'Goa Getaway (Clone)' } })
  assert.equal(clone.status, 201)
  const cloned = clone.json.trip
  assert.equal(cloned.status, 'idea')
  assert.equal(cloned.participants.length, 2)

  const clonedBudget = await req('GET', `/trips/${cloned.id}/budget`, { cookie: state.cookie })
  assert.equal(clonedBudget.status, 200)
  assert.equal(clonedBudget.json.total, state.budgetTotal)
  console.log('ok 10 - archive (status archived, link 401) + clone (idea trip, participants + budget carried over)')
}

async function main() {
  try {
    await stage1_seedAndLogin()
    await stage2_peopleAndTrip()
    await stage3_destinationDecide()
    await stage4_confirmDates()
    await stage5_linkAndParticipantIntake()
    await stage6_budget()
    await stage7_itinerary()
    await stage8_checklistFromScratch()
    await stage9_readiness()
    await stage10_archiveAndClone()
    console.log('SMOKE OK')
    await app.close()
    process.exit(0)
  } catch (err) {
    console.error('SMOKE FAILED:', err)
    try { await app?.close() } catch { /* ignore */ }
    process.exit(1)
  }
}

main()
