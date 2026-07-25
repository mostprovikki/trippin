import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, createOrganizer, createTrip, createPerson, authedInject } from './helpers.js'

// Organizer data isolation: organizer B must not see or touch organizer A's
// trips, persons, or anything reachable through them — bare ids read as 404.
let app, db, aCookie, bCookie, aTrip, aPerson

beforeEach(async () => {
  ;({ app, db } = await makeTestApp())
  const a = loginOrganizer(app, db) // default organizer owns the fixtures
  aCookie = a.cookie
  const orgB = createOrganizer(db, { email: 'b@x.dev' })
  bCookie = `tp_session=${app.signSession(orgB)}`
  aTrip = createTrip(db, { name: 'A Trip' })
  aPerson = createPerson(db, { name: 'A Person' })
  db.prepare('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)').run(aTrip.id, aPerson.id)
})

describe('organizer isolation', () => {
  it("B's trip list excludes A's trips; A still sees them", async () => {
    const b = await authedInject(app, bCookie, { method: 'GET', url: '/api/trips' })
    expect(b.json().trips).toHaveLength(0)
    const a = await authedInject(app, aCookie, { method: 'GET', url: '/api/trips' })
    expect(a.json().trips.map((t) => t.id)).toContain(aTrip.id)
  })

  it("B gets 404 on A's trip and its sub-resources", async () => {
    for (const url of [
      `/api/trips/${aTrip.id}`,
      `/api/trips/${aTrip.id}/budget`,
      `/api/trips/${aTrip.id}/itinerary`,
      `/api/trips/${aTrip.id}/checklists`,
      `/api/trips/${aTrip.id}/readiness`,
      `/api/trips/${aTrip.id}/candidates`,
      `/api/trips/${aTrip.id}/links`,
      `/api/trips/${aTrip.id}/archive`,
    ]) {
      const res = await authedInject(app, bCookie, { method: 'GET', url })
      expect(res.statusCode, url).toBe(404)
    }
  })

  it("B cannot mutate A's trip", async () => {
    const put = await authedInject(app, bCookie, { method: 'PUT', url: `/api/trips/${aTrip.id}`, payload: { name: 'stolen' } })
    expect(put.statusCode).toBe(404)
    const status = await authedInject(app, bCookie, { method: 'POST', url: `/api/trips/${aTrip.id}/status`, payload: { status: 'planning' } })
    expect(status.statusCode).toBe(404)
    expect(db.prepare('SELECT name FROM trips WHERE id = ?').get(aTrip.id).name).toBe('A Trip')
  })

  it("B's people list excludes A's person; by-id access 404s", async () => {
    const list = await authedInject(app, bCookie, { method: 'GET', url: '/api/people' })
    expect(list.json().people).toHaveLength(0)
    const get = await authedInject(app, bCookie, { method: 'GET', url: `/api/people/${aPerson.id}` })
    expect(get.statusCode).toBe(404)
    const del = await authedInject(app, bCookie, { method: 'DELETE', url: `/api/people/${aPerson.id}` })
    expect(del.statusCode).toBe(404)
  })

  it("B cannot attach A's person to B's own trip", async () => {
    const bTrip = await authedInject(app, bCookie, { method: 'POST', url: '/api/trips', payload: { name: 'B Trip' } })
    const bTripId = bTrip.json().trip.id
    const res = await authedInject(app, bCookie, {
      method: 'POST', url: `/api/trips/${bTripId}/participants`, payload: { person_id: aPerson.id },
    })
    expect(res.statusCode).toBe(404)
  })

  it("B cannot create or revoke links for A's trip", async () => {
    const create = await authedInject(app, bCookie, {
      method: 'POST', url: `/api/trips/${aTrip.id}/participants/${aPerson.id}/link`,
    })
    expect(create.statusCode).toBe(404)

    const real = await authedInject(app, aCookie, {
      method: 'POST', url: `/api/trips/${aTrip.id}/participants/${aPerson.id}/link`,
    })
    expect(real.statusCode).toBe(201)
    const linkId = db.prepare('SELECT id FROM participant_links WHERE trip_id = ?').get(aTrip.id).id
    const revoke = await authedInject(app, bCookie, { method: 'POST', url: `/api/links/${linkId}/revoke` })
    expect(revoke.statusCode).toBe(404)
  })

  it('trips created via API belong to their creator', async () => {
    const res = await authedInject(app, bCookie, { method: 'POST', url: '/api/trips', payload: { name: 'B Trip' } })
    const id = res.json().trip.id
    expect(db.prepare('SELECT organizer_id FROM trips WHERE id = ?').get(id).organizer_id).toBeTruthy()
    const aList = await authedInject(app, aCookie, { method: 'GET', url: '/api/trips' })
    expect(aList.json().trips.map((t) => t.id)).not.toContain(id)
  })
})

// Checklist templates have no trip to inherit ownership from, so they are the
// one surface where scoping has to come from the checklist row itself.
describe('checklist template isolation', () => {
  let aTemplate

  beforeEach(async () => {
    const res = await authedInject(app, aCookie, {
      method: 'POST',
      url: '/api/checklists',
      payload: { kind: 'packing', name: 'A Secret Template', is_template: true, trip_type_tags: ['beach'] },
    })
    aTemplate = res.json().checklist
    await authedInject(app, aCookie, {
      method: 'POST', url: `/api/checklists/${aTemplate.id}/items`, payload: { title: 'sunscreen' },
    })
  })

  it('templates created via API belong to their creator', () => {
    const row = db.prepare('SELECT organizer_id FROM checklists WHERE id = ?').get(aTemplate.id)
    expect(row.organizer_id).toBe(db.prepare('SELECT organizer_id FROM trips WHERE id = ?').get(aTrip.id).organizer_id)
  })

  it("B's template list excludes A's templates; A still sees them", async () => {
    const b = await authedInject(app, bCookie, { method: 'GET', url: '/api/checklists?template=1' })
    expect(b.json().checklists.map((c) => c.id)).not.toContain(aTemplate.id)
    const a = await authedInject(app, aCookie, { method: 'GET', url: '/api/checklists?template=1' })
    expect(a.json().checklists.map((c) => c.id)).toContain(aTemplate.id)
  })

  it("B's unfiltered checklist list excludes A's templates", async () => {
    const b = await authedInject(app, bCookie, { method: 'GET', url: '/api/checklists' })
    expect(b.json().checklists.map((c) => c.id)).not.toContain(aTemplate.id)
  })

  it("B cannot read, mutate or delete A's template", async () => {
    const put = await authedInject(app, bCookie, {
      method: 'PUT', url: `/api/checklists/${aTemplate.id}`, payload: { name: 'stolen' },
    })
    expect(put.statusCode).toBe(404)
    expect(db.prepare('SELECT name FROM checklists WHERE id = ?').get(aTemplate.id).name).toBe('A Secret Template')

    const del = await authedInject(app, bCookie, { method: 'DELETE', url: `/api/checklists/${aTemplate.id}` })
    expect(del.statusCode).toBe(404)
    expect(db.prepare('SELECT id FROM checklists WHERE id = ?').get(aTemplate.id)).toBeTruthy()
  })

  it("B cannot add or edit items inside A's template", async () => {
    const add = await authedInject(app, bCookie, {
      method: 'POST', url: `/api/checklists/${aTemplate.id}/items`, payload: { title: 'injected' },
    })
    expect(add.statusCode).toBe(404)

    const itemId = db.prepare('SELECT id FROM checklist_items WHERE checklist_id = ?').get(aTemplate.id).id
    const edit = await authedInject(app, bCookie, {
      method: 'PUT', url: `/api/checklists/${aTemplate.id}/items/${itemId}`, payload: { title: 'tampered' },
    })
    expect(edit.statusCode).toBe(404)
    expect(db.prepare('SELECT title FROM checklist_items WHERE id = ?').get(itemId).title).toBe('sunscreen')
  })

  it("B cannot clone A's template into B's own trip", async () => {
    const bTrip = await authedInject(app, bCookie, { method: 'POST', url: '/api/trips', payload: { name: 'B Trip' } })
    const res = await authedInject(app, bCookie, {
      method: 'POST',
      url: `/api/trips/${bTrip.json().trip.id}/checklists/from-template`,
      payload: { template_id: aTemplate.id },
    })
    expect(res.statusCode).toBe(404)
  })

  it("A's template does not surface in B's search results", async () => {
    // Empty groups are dropped from the response, so B should see no template
    // group at all — and certainly not A's template inside one.
    const b = await authedInject(app, bCookie, { method: 'GET', url: '/api/search?q=sunscreen' })
    const bTemplates = b.json().groups.find((g) => g.kind === 'template')
    expect(bTemplates?.results.map((r) => r.id) ?? []).not.toContain(aTemplate.id)

    // The same query must still find it for A — proving the scoping is what
    // filtered B's result, not a query that stopped matching anything.
    const a = await authedInject(app, aCookie, { method: 'GET', url: '/api/search?q=sunscreen' })
    const aTemplates = a.json().groups.find((g) => g.kind === 'template')
    expect(aTemplates.results.map((r) => r.id)).toContain(aTemplate.id)
  })
})
