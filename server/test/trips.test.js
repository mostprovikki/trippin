import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createPerson, createOrganizer, createTrip } from './helpers.js'

async function seedParticipantLink(app, db, tripId, personId) {
  await db.run('INSERT INTO participant_links (id, trip_id, person_id, token_hash) VALUES (?,?,?,?)',
    [randomUUID(), tripId, personId, app.hashToken(randomUUID())])
}

// Server-local calendar date offset from today, matching trips.routes.js's todayLocalDate().
function localDateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function mkTrip(app, cookie, extra = {}) {
  return (await authedInject(app, cookie, { method: 'POST', url: '/api/trips',
    payload: { name: 'Goa', vibe_tags: ['chill','beach'], origin_city: 'Chennai', ...extra } })).json().trip
}

describe('trips', () => {
  it('creates trip with defaults idea/broad/open and participant_ids', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)
    const t = await mkTrip(app, cookie, { participant_ids: [p.id] })
    expect(t).toMatchObject({ status: 'idea', date_mode: 'broad', destination_mode: 'open', vibe_tags: ['chill','beach'] })
    expect(t.participants).toEqual([{ person_id: p.id, name: p.name, profile_confirmed: 0 }])
    expect(t.windows).toEqual([])
    expect(t.goals).toEqual([])
  })

  // The ownership check used to run inside the participant insert loop with no enclosing
  // transaction, so an unowned id 404'd only after the trip — and any participants listed
  // before it — had already been committed. A refusal must leave no partial state.
  it('POST /trips with one owned and one unowned participant 404s and creates nothing', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const mine = await createPerson(db, { name: 'Mine' })
    const rival = await createOrganizer(db, { email: 'rival@x.dev', name: 'Rival' })
    const other = await createPerson(db, { name: 'Theirs', organizer_id: rival.id })

    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/trips',
      payload: { name: 'Half-written', participant_ids: [mine.id, other.id] } })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')

    expect((await db.get('SELECT COUNT(*)::int AS c FROM trips')).c).toBe(0)
    expect((await db.get('SELECT COUNT(*)::int AS c FROM trip_participants')).c).toBe(0)
  })

  it('POST /api/trips returns 201', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/trips', payload: { name: 'Goa' } })
    expect(res.statusCode).toBe(201)
  })

  it('GET /api/trips lists summaries, supports status filter', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)
    await mkTrip(app, cookie, { name: 'Goa', participant_ids: [p.id] })
    await mkTrip(app, cookie, { name: 'Manali' })
    const all = await authedInject(app, cookie, { method: 'GET', url: '/api/trips' })
    expect(all.json().trips).toHaveLength(2)
    const summary = all.json().trips.find(t => t.name === 'Goa')
    expect(summary).toMatchObject({ name: 'Goa', status: 'idea', participant_count: 1 })

    const filtered = await authedInject(app, cookie, { method: 'GET', url: '/api/trips?status=idea' })
    expect(filtered.json().trips).toHaveLength(2)
    const none = await authedInject(app, cookie, { method: 'GET', url: '/api/trips?status=active' })
    expect(none.json().trips).toHaveLength(0)
  })

  // The list projection is hand-built (unlike tripToJson) and was silently dropping
  // vibe_tags, so the web list view's per-card vibe accent had nothing to hash on.
  it('GET /api/trips list summaries include parsed vibe_tags', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    await mkTrip(app, cookie, { name: 'Goa', vibe_tags: ['beach', 'chill'] })
    const res = await authedInject(app, cookie, { method: 'GET', url: '/api/trips' })
    const summary = res.json().trips.find(t => t.name === 'Goa')
    expect(summary.vibe_tags).toEqual(['beach', 'chill'])
  })

  it('GET /api/trips/:id returns trip or 404', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().trip.id).toBe(t.id)

    const missing = await authedInject(app, cookie, { method: 'GET', url: '/api/trips/does-not-exist' })
    expect(missing.statusCode).toBe(404)
  })

  it('PUT /api/trips/:id partial update', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const res = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`,
      payload: { description: 'Beach trip', origin_city: 'Chennai' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().trip).toMatchObject({ description: 'Beach trip', origin_city: 'Chennai', name: 'Goa' })

    const missing = await authedInject(app, cookie, { method: 'PUT', url: '/api/trips/does-not-exist', payload: { name: 'x' } })
    expect(missing.statusCode).toBe(404)
  })

  it('windows replace-all; goals CRUD with fixed_date hard constraint stored', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const w = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/windows`,
      payload: { windows: [{ start_date: '2026-10-02', end_date: '2026-10-06' }, { start_date: '2026-10-16', end_date: '2026-10-20', note: 'after payday' }] } })
    expect(w.json().windows).toHaveLength(2)

    // replace-all: calling again with fewer windows drops the old ones
    const w2 = await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}/windows`,
      payload: { windows: [{ start_date: '2026-11-01', end_date: '2026-11-05' }] } })
    expect(w2.json().windows).toHaveLength(1)
    expect(w2.json().windows[0]).toMatchObject({ start_date: '2026-11-01', end_date: '2026-11-05' })

    const g = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/goals`,
      payload: { title: 'Sunburn concert', fixed_date: '2026-10-04', fixed_place: 'Vagator' } })
    expect(g.statusCode).toBe(201)
    const goalId = g.json().id
    expect(g.json()).toMatchObject({ title: 'Sunburn concert', fixed_date: '2026-10-04', fixed_place: 'Vagator' })

    const upd = await authedInject(app, cookie, { method: 'PUT', url: `/api/goals/${goalId}`, payload: { title: 'Sunburn Festival' } })
    expect(upd.statusCode).toBe(200)

    const afterUpdate = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(afterUpdate.json().trip.goals.find(gl => gl.id === goalId).title).toBe('Sunburn Festival')

    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/goals/${goalId}` })
    expect(del.statusCode).toBe(204)

    const afterDelete = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(afterDelete.json().trip.goals).toHaveLength(0)
  })

  it('participants: add returns trip, 409 on duplicate, delete removes', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const p = await createPerson(db)
    const add = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants`, payload: { person_id: p.id } })
    expect(add.statusCode).toBe(201)
    expect(add.json().trip.participants).toEqual([{ person_id: p.id, name: p.name, profile_confirmed: 0 }])

    const dup = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/participants`, payload: { person_id: p.id } })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('ALREADY_MEMBER')

    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/trips/${t.id}/participants/${p.id}` })
    expect(del.statusCode).toBe(204)

    const after = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${t.id}` })
    expect(after.json().trip.participants).toHaveLength(0)
  })

  it('lifecycle: idea→planning ok; planning→confirmed blocked until dates+destination ready; archived rejected here', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const t = await mkTrip(app, cookie)
    const s = (status) => authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/status`, payload: { status } })
    expect((await s('planning')).statusCode).toBe(200)
    const notReady = await s('confirmed')
    expect(notReady.statusCode).toBe(400); expect(notReady.json().error.code).toBe('NOT_READY')
    await authedInject(app, cookie, { method: 'PUT', url: `/api/trips/${t.id}`,
      payload: { date_mode: 'confirmed', start_date: '2026-10-02', end_date: '2026-10-06', destination_mode: 'decided', destination: 'Goa' } })
    expect((await s('confirmed')).statusCode).toBe(200)
    expect((await s('idea')).statusCode).toBe(400)
    expect((await s('idea')).json().error.code).toBe('BAD_TRANSITION')
    expect((await s('archived')).statusCode).toBe(400)
    expect((await s('archived')).json().error.code).toBe('USE_ARCHIVE_ENDPOINT')
  })

  // First failing test: an active trip past its own end_date reads back archived, from
  // both the single-trip GET and the list GET, without anyone archiving it by hand — and
  // it's a *real* archive (archiveTrip()), not a bare status flip: it leaves a snapshot
  // behind, revokes participant links, and unarchive restores 'active' — same as if the
  // organizer had hit POST /trips/:id/archive themselves.
  it('active trip past its end date reads back archived (full archiveTrip: snapshot, revoked link, unarchive restores active)', async () => {
    const { app, db } = await makeTestApp(); const { cookie, organizer } = await loginOrganizer(app, db)
    const trip = await createTrip(db, { organizer_id: organizer.id, status: 'active', end_date: localDateOffset(-1) })
    const person = await createPerson(db, { name: 'Alice' })
    await db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [trip.id, person.id])
    await seedParticipantLink(app, db, trip.id, person.id)

    const one = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}` })
    expect(one.statusCode).toBe(200)
    expect(one.json().trip.status).toBe('archived')

    const list = await authedInject(app, cookie, { method: 'GET', url: '/api/trips' })
    const summary = list.json().trips.find((t) => t.id === trip.id)
    expect(summary.status).toBe('archived')

    const archiveRes = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/archive` })
    expect(archiveRes.statusCode).toBe(200)
    expect(archiveRes.json().archive.snapshot.trip.id).toBe(trip.id)

    const link = await db.get('SELECT revoked_at FROM participant_links WHERE trip_id = ?', [trip.id])
    expect(link.revoked_at).toBeTruthy()

    const unarchiveRes = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${trip.id}/unarchive` })
    expect(unarchiveRes.statusCode).toBe(200)
    expect(unarchiveRes.json().trip.status).toBe('active')
  })

  it('active trip whose end date is today stays active', async () => {
    const { app, db } = await makeTestApp(); const { cookie, organizer } = await loginOrganizer(app, db)
    const trip = await createTrip(db, { organizer_id: organizer.id, status: 'active', end_date: localDateOffset(0) })

    const one = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}` })
    expect(one.json().trip.status).toBe('active')

    const list = await authedInject(app, cookie, { method: 'GET', url: '/api/trips' })
    const summary = list.json().trips.find((t) => t.id === trip.id)
    expect(summary.status).toBe('active')
  })

  it('status 404 on missing trip', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'POST', url: '/api/trips/does-not-exist/status', payload: { status: 'planning' } })
    expect(res.statusCode).toBe(404)
  })

  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/trips' })
    expect(res.statusCode).toBe(401)
  })
})
