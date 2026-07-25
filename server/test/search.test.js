import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  makeTestApp, loginOrganizer, authedInject, createTrip, createPerson, createOrganizer, defaultOrganizer
} from './helpers.js'

function groupOf(body, kind) {
  return body.groups.find((g) => g.kind === kind)
}
function titles(body, kind) {
  return (groupOf(body, kind)?.results || []).map((r) => r.title)
}
async function search(app, cookie, q, extra = '') {
  return authedInject(app, cookie, { method: 'GET', url: `/api/search?q=${encodeURIComponent(q)}${extra}` })
}

function addDocument(db, personId, fields = {}) {
  const id = randomUUID()
  db.prepare(`INSERT INTO documents (id, person_id, doc_type, doc_number, expiry_date, file_path, original_name, mime_type, size_bytes)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, personId, fields.doc_type || 'passport', fields.doc_number ?? null, fields.expiry_date ?? null,
    `data/uploads/${personId}/${id}`, fields.original_name || 'scan.pdf', 'application/pdf', 1234)
  return id
}
function addItineraryItem(db, tripId, fields = {}) {
  const dayId = randomUUID()
  db.prepare('INSERT INTO itinerary_days (id, trip_id, day_date, position) VALUES (?,?,?,?)')
    .run(dayId, tripId, fields.day_date || '2026-08-01', fields.dayPos ?? 0)
  const id = randomUUID()
  db.prepare(`INSERT INTO itinerary_items (id, day_id, position, title, location, category, notes)
              VALUES (?,?,?,?,?,?,?)`).run(
    id, dayId, 0, fields.title || 'Item', fields.location ?? null,
    fields.category || 'activity', fields.notes ?? null)
  return id
}
function addTemplate(db, { name = 'Beach packing', kind = 'packing', tags = '[]', items = [], organizerId } = {}) {
  const id = randomUUID()
  db.prepare('INSERT INTO checklists (id, trip_id, is_template, kind, name, trip_type_tags, organizer_id) VALUES (?,NULL,1,?,?,?,?)')
    .run(id, kind, name, tags, organizerId ?? defaultOrganizer(db).id)
  items.forEach((title, i) => {
    db.prepare('INSERT INTO checklist_items (id, checklist_id, title, position) VALUES (?,?,?,?)')
      .run(randomUUID(), id, title, i)
  })
  return id
}
function archiveTrip(db, tripId, notes) {
  db.prepare('UPDATE trips SET status = ?, archived_at = datetime() WHERE id = ?').run('archived', tripId)
  db.prepare('INSERT INTO archives (trip_id, snapshot_json, notes) VALUES (?,?,?)')
    .run(tripId, '{}', notes)
}

describe('global search', () => {
  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/search?q=goa' })).statusCode).toBe(401)
  })

  it('returns an empty result set for a blank query rather than everything', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createTrip(db, { name: 'Goa' })
    const res = await search(app, cookie, '')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ query: '', total: 0, groups: [] })
  })

  it('rejects a one-character query', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const res = await search(app, cookie, 'g')
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('QUERY_TOO_SHORT')
  })

  it('finds trips by name, destination and vibe tag', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createTrip(db, { name: 'Goa Reunion', destination: 'Goa' })
    createTrip(db, { name: 'Winter break', destination: 'Manali' })
    createTrip(db, { name: 'Surf week', vibe_tags: '["beach","surf"]' })

    expect(titles((await search(app, cookie, 'goa')).json(), 'trip')).toEqual(['Goa Reunion'])
    expect(titles((await search(app, cookie, 'manali')).json(), 'trip')).toEqual(['Winter break'])
    expect(titles((await search(app, cookie, 'surf')).json(), 'trip')).toEqual(['Surf week'])
  })

  it('finds people by name, email and interest', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createPerson(db, { name: 'Asha Kumar', email: 'asha@example.com', interests: '["trekking"]' })
    createPerson(db, { name: 'Bala', home_city: 'Kochi' })

    expect(titles((await search(app, cookie, 'asha')).json(), 'person')).toEqual(['Asha Kumar'])
    expect(titles((await search(app, cookie, 'example.com')).json(), 'person')).toEqual(['Asha Kumar'])
    expect(titles((await search(app, cookie, 'trekking')).json(), 'person')).toEqual(['Asha Kumar'])
    expect(titles((await search(app, cookie, 'kochi')).json(), 'person')).toEqual(['Bala'])
  })

  it('finds documents by owner, type and number, and reports the owner + expiry', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const asha = createPerson(db, { name: 'Asha Kumar' })
    addDocument(db, asha.id, { doc_type: 'passport', doc_number: 'Z1234567', expiry_date: '2035-04-30' })

    const byOwner = (await search(app, cookie, 'asha')).json()
    expect(groupOf(byOwner, 'document').results[0]).toMatchObject({
      person_name: 'Asha Kumar', doc_type: 'passport', expiry_date: '2035-04-30'
    })
    expect(groupOf((await search(app, cookie, 'passport')).json(), 'document').results).toHaveLength(1)
    expect(groupOf((await search(app, cookie, 'Z1234567')).json(), 'document').results).toHaveLength(1)
  })

  it('finds itinerary items and reports which trip and day they belong to', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const trip = createTrip(db, { name: 'Goa Reunion' })
    addItineraryItem(db, trip.id, { title: 'Sunset at Anjuna', location: 'Anjuna Beach', day_date: '2026-08-02' })

    const res = (await search(app, cookie, 'anjuna')).json()
    expect(groupOf(res, 'itinerary').results[0]).toMatchObject({
      title: 'Sunset at Anjuna', trip_id: trip.id, trip_name: 'Goa Reunion', day_date: '2026-08-02'
    })
  })

  it('finds checklist templates by name, tag, and by an item inside them', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    addTemplate(db, { name: 'Beach packing', tags: '["beach"]', items: ['Sunscreen', 'Flip flops'] })
    addTemplate(db, { name: 'Trek packing', items: ['Headlamp'] })

    expect(titles((await search(app, cookie, 'beach')).json(), 'template')).toEqual(['Beach packing'])
    // The whole point of searching templates: find the list that has the thing.
    expect(titles((await search(app, cookie, 'sunscreen')).json(), 'template')).toEqual(['Beach packing'])
    expect(titles((await search(app, cookie, 'headlamp')).json(), 'template')).toEqual(['Trek packing'])
    expect(groupOf((await search(app, cookie, 'beach')).json(), 'template').results[0].item_count).toBe(2)
  })

  it('finds archived trips by their notes', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const trip = createTrip(db, { name: 'Ladakh 2025' })
    archiveTrip(db, trip.id, 'Book the Nubra permits earlier next time')

    const res = (await search(app, cookie, 'permits')).json()
    expect(groupOf(res, 'archive').results[0]).toMatchObject({ id: trip.id, title: 'Ladakh 2025' })
    expect(groupOf(res, 'archive').results[0].notes).toMatch(/Nubra/)
  })

  it('still surfaces archived trips in the trips group, flagged as archived', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const trip = createTrip(db, { name: 'Ladakh 2025' })
    archiveTrip(db, trip.id, 'notes')
    const row = groupOf((await search(app, cookie, 'ladakh')).json(), 'trip').results[0]
    expect(row.status).toBe('archived')
    expect(row.archived_at).toBeTruthy()
  })

  // The whole point of the organizer scoping work: search must not become the
  // one endpoint that leaks across organizers.
  it('never returns another organizer\'s data', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const other = createOrganizer(db, { email: 'other@x.dev' })
    createTrip(db, { name: 'Secret Goa Trip', organizer_id: other.id })
    const theirPerson = createPerson(db, { name: 'Goa Person', organizer_id: other.id })
    addDocument(db, theirPerson.id, { doc_number: 'GOA-999' })
    const theirTrip = createTrip(db, { name: 'Their trip', organizer_id: other.id })
    addItineraryItem(db, theirTrip.id, { title: 'Goa dinner' })
    archiveTrip(db, theirTrip.id, 'Goa notes')

    const res = (await search(app, cookie, 'goa')).json()
    expect(res.total).toBe(0)
    expect(res.groups).toEqual([])
  })

  it('ranks an exact title match above a prefix above an incidental hit', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createTrip(db, { name: 'Weekend in Goa', description: 'Goa again' })
    createTrip(db, { name: 'Goa Reunion' })
    createTrip(db, { name: 'Goa' })

    expect(titles((await search(app, cookie, 'goa')).json(), 'trip'))
      .toEqual(['Goa', 'Goa Reunion', 'Weekend in Goa'])
  })

  it('treats LIKE wildcards in the query as literal characters', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createTrip(db, { name: 'Ladakh 2025' })
    createTrip(db, { name: '50% deposit trip' })

    // Bare '%' would otherwise match every trip.
    expect(titles((await search(app, cookie, '50%')).json(), 'trip')).toEqual(['50% deposit trip'])
    // '_' is LIKE's single-character wildcard; 'L_dakh' must not match 'Ladakh'.
    const res = (await search(app, cookie, 'L_dakh')).json()
    expect(res.total).toBe(0)
  })

  it('is case-insensitive', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createTrip(db, { name: 'Goa Reunion' })
    expect(titles((await search(app, cookie, 'GOA')).json(), 'trip')).toEqual(['Goa Reunion'])
    expect(titles((await search(app, cookie, 'gOa')).json(), 'trip')).toEqual(['Goa Reunion'])
  })

  it('caps results per kind and honours an explicit limit', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    for (let i = 0; i < 12; i++) createTrip(db, { name: `Goa trip ${i}` })

    expect(groupOf((await search(app, cookie, 'goa')).json(), 'trip').results).toHaveLength(5)
    expect(groupOf((await search(app, cookie, 'goa', '&limit=10')).json(), 'trip').results).toHaveLength(10)
    // Above the schema maximum the request is rejected, not silently clamped.
    expect((await search(app, cookie, 'goa', '&limit=999')).statusCode).toBe(400)
  })

  // Generalised guard rather than one assertion per kind: the documents group
  // originally selected original_name without aliasing it to `title`, and the UI
  // rendered every document row as "(untitled)". Any future group that forgets
  // the alias fails here instead of shipping.
  it('gives every result in every group a non-empty title', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const person = createPerson(db, { name: 'SRCH Person' })
    addDocument(db, person.id, { original_name: 'SRCH-scan.pdf', doc_number: 'SRCH-1' })
    const trip = createTrip(db, { name: 'SRCH Trip' })
    addItineraryItem(db, trip.id, { title: 'SRCH Walk' })
    addTemplate(db, { name: 'SRCH Template', items: ['SRCH item'] })
    const past = createTrip(db, { name: 'SRCH Past' })
    archiveTrip(db, past.id, 'SRCH notes')

    const res = (await search(app, cookie, 'SRCH')).json()
    // All six kinds must be present, or this passes by simply not testing them.
    expect(res.groups.map((g) => g.kind).sort())
      .toEqual(['archive', 'document', 'itinerary', 'person', 'template', 'trip'])
    for (const g of res.groups) {
      for (const r of g.results) {
        expect(typeof r.title, `${g.kind} result has a string title`).toBe('string')
        expect(r.title.length, `${g.kind} title is non-empty`).toBeGreaterThan(0)
        expect(r.id, `${g.kind} result has an id`).toBeTruthy()
      }
    }
  })

  it('omits groups that have no hits instead of returning empty shells', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    createTrip(db, { name: 'Goa Reunion' })
    const res = (await search(app, cookie, 'goa')).json()
    expect(res.groups.map((g) => g.kind)).toEqual(['trip'])
    expect(res.total).toBe(1)
  })
})
