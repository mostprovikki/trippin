import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'

// D11 (tripper.md §2 Archived): an archived trip is read-only except the
// archive's notes / photo links, actuals and Unarchive. Every trip-scoped write
// answers 409 TRIP_ARCHIVED; the same request on a live trip goes through.

let app, db, cookie

// One trip with a row of everything a write route can target. `archived`
// goes through the real archive endpoint, then gets a fresh live link (the
// archive revokes the old ones) so the participant routes are reachable.
async function seed({ archived }) {
  const trip = await createTrip(db, { status: 'idea', start_date: '2027-03-01', end_date: '2027-03-02' })
  const person = await createPerson(db, { name: 'Ann' })
  const outsider = await createPerson(db, { name: 'Bo' })
  await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [trip.id, person.id])
  const checklist = randomUUID(), item = randomUUID(), template = randomUUID()
  const org = (await db.get('SELECT organizer_id FROM trips WHERE id = ?', [trip.id])).organizer_id
  await db.run(`INSERT INTO checklists (id, trip_id, is_template, kind, name, organizer_id) VALUES (?, ?, 0, 'packing', 'Bag', ?)`, [checklist, trip.id, org])
  await db.run(`INSERT INTO checklists (id, trip_id, is_template, kind, name, organizer_id) VALUES (?, NULL, 1, 'packing', 'Tpl', ?)`, [template, org])
  await db.run(`INSERT INTO checklist_items (id, checklist_id, title, done, position) VALUES (?, ?, 'Socks', 0, 0)`, [item, checklist])
  const day = randomUUID(), dayItem = randomUUID()
  await db.run('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?, ?, ?, 0)', [day, trip.id, '2027-03-01'])
  await db.run(`INSERT INTO itinerary_items (id, day_id, position, title, category) VALUES (?, ?, 0, 'Walk', 'activity')`, [dayItem, day])
  const candidate = randomUUID(), candidate2 = randomUUID()
  await db.run(`INSERT INTO destination_candidates (id, trip_id, name, source) VALUES (?, ?, 'Goa', 'manual')`, [candidate, trip.id])
  await db.run(`INSERT INTO destination_candidates (id, trip_id, name, source) VALUES (?, ?, 'Ooty', 'manual')`, [candidate2, trip.id])
  const goal = randomUUID()
  await db.run('INSERT INTO trip_goals (id, trip_id, title) VALUES (?, ?, ?)', [goal, trip.id, 'Swim'])

  if (archived) {
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/archive`, payload: {} })
    expect(res.statusCode).toBe(200)
  }
  const token = randomUUID(), link = randomUUID()
  await db.run('INSERT INTO participant_links (id, trip_id, person_id, token_hash) VALUES (?, ?, ?, ?)',
    [link, trip.id, person.id, app.hashToken(token)])
  return { trip: trip.id, person: person.id, outsider: outsider.id, checklist, item, template, day, dayItem, candidate, candidate2, goal, token, link, noDoc: randomUUID() }
}

// [family, method, url(f), payload(f)?, opts] — opts.participant sends the
// link token instead of the session; opts.liveAny accepts any non-409 on the
// live trip (AI routes with no provider, a paste of junk, a missing upload).
const REFUSED = [
  ['itinerary', 'POST', (f) => `/trips/${f.trip}/itinerary/init`],
  ['itinerary', 'POST', (f) => `/days/${f.day}/items`, () => ({ title: 'Swim' })],
  ['itinerary', 'PUT', (f) => `/items/${f.dayItem}`, () => ({ title: 'Run' })],
  ['itinerary', 'DELETE', (f) => `/items/${f.dayItem}`],
  ['itinerary', 'PUT', (f) => `/days/${f.day}/items/order`, (f) => ({ item_ids: [f.dayItem] })],
  ['itinerary', 'POST', (f) => `/trips/${f.trip}/itinerary/apply-draft`, () => ({ days: [] })],
  ['itinerary', 'POST', (f) => `/days/${f.day}/apply`, () => ({ items: [] })],
  ['ai', 'POST', (f) => `/trips/${f.trip}/itinerary/ai-draft`, null, { liveAny: true }],
  ['ai', 'POST', (f) => `/trips/${f.trip}/itinerary/ai-draft/import`, () => ({ text: 'junk' }), { liveAny: true }],
  ['ai', 'POST', (f) => `/days/${f.day}/ai-regen`, null, { liveAny: true }],
  ['ai', 'POST', (f) => `/days/${f.day}/ai-regen/import`, () => ({ text: 'junk' }), { liveAny: true }],
  ['ai', 'POST', (f) => `/checklists/${f.checklist}/ai-packing-suggest`, null, { liveAny: true }],
  ['ai', 'POST', (f) => `/checklists/${f.checklist}/ai-packing-suggest/import`, () => ({ text: 'junk' }), { liveAny: true }],
  ['ai', 'POST', (f) => `/trips/${f.trip}/budget/ai-draft`, null, { liveAny: true }],
  ['ai', 'POST', (f) => `/trips/${f.trip}/budget/ai-draft/import`, () => ({ text: 'junk' }), { liveAny: true }],
  ['ai', 'POST', (f) => `/trips/${f.trip}/candidates/ai-suggest`, null, { liveAny: true }],
  ['ai', 'POST', (f) => `/trips/${f.trip}/candidates/ai-suggest/import`, () => ({ text: 'junk' }), { liveAny: true }],
  ['checklists', 'POST', () => '/checklists', (f) => ({ kind: 'tasks', name: 'Todo', trip_id: f.trip })],
  ['checklists', 'PUT', (f) => `/checklists/${f.checklist}`, () => ({ name: 'Bags' })],
  ['checklists', 'DELETE', (f) => `/checklists/${f.checklist}`],
  ['checklists', 'POST', (f) => `/checklists/${f.checklist}/items`, () => ({ title: 'Hat' })],
  ['checklists', 'PUT', (f) => `/checklist-items/${f.item}`, () => ({ done: true })],
  ['checklists', 'DELETE', (f) => `/checklist-items/${f.item}`],
  ['checklists', 'POST', (f) => `/trips/${f.trip}/checklists/from-template`, (f) => ({ template_id: f.template })],
  ['budget', 'PUT', (f) => `/trips/${f.trip}/budget`, () => ({ lines: [{ category: 'stay', estimate: 100 }] })],
  ['budget', 'PUT', (f) => `/trips/${f.trip}/budget/overrides`, () => ({ overrides: [] })],
  ['destinations', 'POST', (f) => `/trips/${f.trip}/candidates`, () => ({ name: 'Kochi' })],
  ['destinations', 'POST', (f) => `/candidates/${f.candidate}/decide`],
  ['destinations', 'DELETE', (f) => `/candidates/${f.candidate2}`],
  ['trips', 'PUT', (f) => `/trips/${f.trip}`, () => ({ name: 'Renamed' })],
  ['trips', 'POST', (f) => `/trips/${f.trip}/status`, () => ({ status: 'planning' })],
  ['trips', 'PUT', (f) => `/trips/${f.trip}/windows`, () => ({ windows: [] })],
  ['trips', 'POST', (f) => `/trips/${f.trip}/goals`, () => ({ title: 'Dive' })],
  ['trips', 'PUT', (f) => `/goals/${f.goal}`, () => ({ title: 'Snorkel' })],
  ['trips', 'DELETE', (f) => `/goals/${f.goal}`],
  ['people-on-trip', 'POST', (f) => `/trips/${f.trip}/participants`, (f) => ({ person_id: f.outsider })],
  ['people-on-trip', 'DELETE', (f) => `/trips/${f.trip}/participants/${f.person}`],
  ['links', 'POST', (f) => `/trips/${f.trip}/participants/${f.person}/link`, () => ({})],
  ['participant', 'PUT', () => '/participant/profile', () => ({ name: 'Ann B' }), { participant: true }],
  ['participant', 'PUT', (f) => `/participant/checklist-items/${f.item}`, () => ({ done: true }), { participant: true }],
  ['participant', 'POST', () => '/participant/documents', null, { participant: true, liveAny: true }],
  ['participant', 'DELETE', (f) => `/participant/documents/${f.noDoc}`, null, { participant: true, liveAny: true }],
]

// Still allowed on an archived trip.
const ALLOWED = [
  ['archive meta', 'PUT', (f) => `/trips/${f.trip}/archive`, () => ({ notes: 'lovely', photo_links: ['http://x/1.jpg'] })],
  ['actuals', 'PUT', (f) => `/trips/${f.trip}/actuals`, () => ({ actuals: [{ category: 'stay', amount: 900 }] })],
  ['clone', 'POST', (f) => `/trips/${f.trip}/clone`, () => ({ name: 'Again' })],
  ['seen', 'POST', (f) => `/trips/${f.trip}/seen`],
  ['promote to template', 'POST', (f) => `/checklists/${f.checklist}/promote-to-template`, () => ({ name: 'Reuse' })],
  ['revoke link', 'POST', (f) => `/links/${f.link}/revoke`],
  ['unarchive', 'POST', (f) => `/trips/${f.trip}/unarchive`],
]

// Everything a write route here could touch for this trip. A 409 that still
// wrote (the handler carrying on after the reply was sent) changes this.
async function fingerprint(f) {
  const q = (sql, args = [f.trip]) => db.all(sql, args)
  return JSON.stringify([
    await q('SELECT * FROM trips WHERE id = ?'),
    await q('SELECT * FROM trip_participants WHERE trip_id = ? ORDER BY person_id'),
    await q('SELECT * FROM trip_goals WHERE trip_id = ? ORDER BY id'),
    await q('SELECT * FROM trip_date_windows WHERE trip_id = ? ORDER BY id'),
    await q('SELECT * FROM checklists WHERE trip_id = ? ORDER BY id'),
    await q('SELECT ci.* FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id WHERE c.trip_id = ? ORDER BY ci.id'),
    await q('SELECT * FROM itinerary_days WHERE trip_id = ? ORDER BY id'),
    await q('SELECT i.* FROM itinerary_items i JOIN itinerary_days d ON d.id = i.day_id WHERE d.trip_id = ? ORDER BY i.id'),
    await q('SELECT * FROM destination_candidates WHERE trip_id = ? ORDER BY id'),
    await q('SELECT * FROM budget_lines WHERE trip_id = ? ORDER BY id'),
    await q('SELECT * FROM budget_overrides WHERE trip_id = ? ORDER BY id'),
    await q('SELECT * FROM participant_links WHERE trip_id = ? ORDER BY id'),
    await q('SELECT * FROM persons WHERE id = ?', [f.person]),
    await q('SELECT * FROM documents WHERE person_id = ? ORDER BY id', [f.person]),
  ])
}

function send(f, [, method, url, payload, opts = {}]) {
  const req = { method, url: `/api${url(f)}` }
  if (payload) req.payload = payload(f)
  if (opts.participant) return app.inject({ ...req, headers: { authorization: `Bearer ${f.token}` } })
  return authedInject(app, cookie, req)
}

describe('archived trip is read-only (D11)', () => {
  beforeAll(async () => {
    ;({ app, db } = await makeTestApp())
    ;({ cookie } = await loginOrganizer(app, db))
  })

  it('archived trip refuses new item — POST item on archived trip -> 409 TRIP_ARCHIVED', async () => {
    const f = await seed({ archived: true })
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/checklists/${f.checklist}/items`, payload: { title: 'Hat' } })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('TRIP_ARCHIVED')
    expect((await db.get('SELECT COUNT(*)::int AS n FROM checklist_items WHERE checklist_id = ?', [f.checklist])).n).toBe(1)
  })

  for (const route of REFUSED) {
    const [family, method, , , opts = {}] = route
    const label = `${family}: ${method} ${route[2]({ trip: ':trip', day: ':day', dayItem: ':item', checklist: ':checklist', item: ':item', candidate: ':cand', candidate2: ':cand', goal: ':goal', person: ':person', noDoc: ':doc' })}`
    it(`${label} → 409 on archived, through on live`, async () => {
      const f = await seed({ archived: true })
      const before = await fingerprint(f)
      const archived = await send(f, route)
      expect(archived.statusCode, archived.body).toBe(409)
      expect(archived.json().error.code).toBe('TRIP_ARCHIVED')
      expect(await fingerprint(f)).toBe(before)

      const live = await send(await seed({ archived: false }), route)
      if (opts.liveAny) expect(live.statusCode, live.body).not.toBe(409)
      else expect(live.statusCode, live.body).toBeLessThan(300)
    })
  }

  for (const route of ALLOWED) {
    it(`${route[0]} still works on an archived trip`, async () => {
      const res = await send(await seed({ archived: true }), route)
      expect(res.statusCode, res.body).toBeLessThan(300)
    })
  }

  it('a template checklist (no trip) stays editable', async () => {
    const f = await seed({ archived: true })
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/checklists/${f.template}/items`, payload: { title: 'Hat' } })
    expect(res.statusCode).toBe(201)
  })
})
