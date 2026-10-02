import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson, createOrganizer } from './helpers.js'

// tripper.md §2 "Since you last looked · ⟨date⟩", §3 collecting mode; owner
// decision D6: "last" moves only on an open more than an hour after the
// previous one, and the feed is participant-originated changes only.
const memStorage = {
  async put(_req, _key, readable) { let size = 0; for await (const c of readable) size += c.length; return { size } },
  async getDownload() { return { url: 'x' } },
  async remove() {}
}

async function setup() {
  const { app, db } = await makeTestApp({ storage: memStorage })
  const { cookie, organizer } = await loginOrganizer(app, db)
  const t = await createTrip(db)
  const p = await createPerson(db, { name: 'Divya Rao' })
  await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p.id])
  const raw = 'z'.repeat(43)
  await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)', ['lk', t.id, p.id, app.hashToken(raw)])
  const seen = () => authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/seen` })
  const asParticipant = (opts) => app.inject({ ...opts, headers: { authorization: `Bearer ${raw}`, ...(opts.headers || {}) } })
  const backdate = (hours) => db.run(
    `UPDATE organizer_trip_views SET last_seen_at = to_char((now() AT TIME ZONE 'UTC') - (? * INTERVAL '1 hour'), 'YYYY-MM-DD HH24:MI:SS')`, [hours])
  return { app, db, cookie, organizer, t, p, seen, asParticipant, backdate }
}

describe('POST /trips/:id/seen', () => {
  // trip-planner-0yh (2): a first visit seeds "last seen" to the trip's
  // creation, so changes made before the organizer's first sitting show.
  it('first visit: since is the trip creation, and earlier participant changes show', async () => {
    const { db, t, seen, asParticipant } = await setup()
    await db.run(`UPDATE trips SET created_at = to_char((now() AT TIME ZONE 'UTC') - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`, [t.id])
    const { created_at } = await db.get('SELECT created_at FROM trips WHERE id = ?', [t.id])
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    const res = await seen()
    expect(res.statusCode).toBe(200)
    expect(res.json().since).toBe(created_at)
    expect(res.json().events.map((e) => e.summary)).toEqual(['Divya updated their details'])
    expect(res.json().more).toBe(0)
  })

  it('first visit to an old trip looks back 7 days, not to its creation', async () => {
    const { db, t, seen, asParticipant } = await setup()
    await db.run("UPDATE trips SET created_at = '2020-01-01 00:00:00' WHERE id = ?", [t.id])
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    await db.run(`UPDATE trip_events SET created_at = to_char((now() AT TIME ZONE 'UTC') - INTERVAL '8 days', 'YYYY-MM-DD HH24:MI:SS')`)
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'vegan' } })
    const res = (await seen()).json()
    expect(res.since > '2020-01-01 00:00:00').toBe(true)
    expect(res.events).toHaveLength(1)
  })

  // trip-planner-0yh (6): the feed lists 20 and counts the rest
  it('past 20 changes, the rest are counted in more', async () => {
    const { db, t, seen, backdate } = await setup()
    await seen(); await backdate(2)
    for (let i = 0; i < 23; i++) {
      await db.run("INSERT INTO trip_events (id, trip_id, kind, summary, target) VALUES (?, ?, 'profile_saved', ?, 'people')", [`ev${i}`, t.id, `e${i}`])
    }
    const res = (await seen()).json()
    expect(res.events).toHaveLength(20)
    expect(res.more).toBe(3)
  })

  it('lists participant changes made after the previous visit, newest first, with a target', async () => {
    const { seen, asParticipant, backdate } = await setup()
    await seen(); await backdate(2)
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    const res = (await seen()).json()
    expect(res.since).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(res.events).toHaveLength(1)
    expect(res.events[0]).toMatchObject({ summary: 'Divya updated their details', target: 'people' })
  })

  it('reopening within the hour keeps the same since and the same events (Review Focus 2)', async () => {
    const { seen, asParticipant, backdate } = await setup()
    await seen(); await backdate(2)
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    const first = (await seen()).json()
    const again = (await seen()).json()
    expect(again).toEqual(first)
    expect(again.events).toHaveLength(1)
  })

  it('changes older than the previous visit are not listed', async () => {
    const { db, seen, asParticipant, backdate } = await setup()
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    // the change happened 3h ago, the previous visit 2h ago
    await db.run(`UPDATE trip_events SET created_at = to_char((now() AT TIME ZONE 'UTC') - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI:SS')`)
    await seen()
    await backdate(2)
    expect((await seen()).json().events).toEqual([])
  })

  it('doc upload and checklist tick are recorded, an untick is not', async () => {
    const { db, t, p, seen, asParticipant, backdate } = await setup()
    await seen(); await backdate(2)
    const form = new FormData()
    form.append('file', new Blob([Buffer.alloc(10, 0x61)], { type: 'application/pdf' }), 'visa.pdf')
    form.append('doc_type', 'visa')
    const up = await asParticipant({ method: 'POST', url: '/api/participant/documents', payload: form })
    expect(up.statusCode).toBe(201)
    await db.run("INSERT INTO checklists (id,trip_id,kind,name) VALUES ('c1',?,'packing','Pack')", [t.id])
    await db.run("INSERT INTO checklist_items (id,checklist_id,title,assignee_person_id,done,position) VALUES ('i1','c1','Sunscreen',?,0,0)", [p.id])
    await asParticipant({ method: 'PUT', url: '/api/participant/checklist-items/i1', payload: { done: true } })
    await asParticipant({ method: 'PUT', url: '/api/participant/checklist-items/i1', payload: { done: false } })
    const events = (await seen()).json().events
    expect(events.map((e) => [e.summary, e.target]).sort()).toEqual([
      ['Divya ticked Sunscreen', 'checklists'],
      ['Divya uploaded their visa', 'people']
    ])
  })

  // final review 2026-10-02: one participant link could flood the 20-row feed
  it('a profile save that changes nothing records nothing', async () => {
    const { db, seen, asParticipant, backdate } = await setup()
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    await db.run(`UPDATE trip_events SET created_at = to_char((now() AT TIME ZONE 'UTC') - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI:SS')`)
    await seen(); await backdate(2)
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: { dietary: 'veg' } })
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: {} })
    expect((await seen()).json().events).toEqual([])
  })

  it('first save of an untouched but complete profile still records (it confirms the profile)', async () => {
    const { db, p, seen, asParticipant, backdate } = await setup()
    await db.run("UPDATE persons SET phone = '1', emergency_contact = '2', dietary = 'veg' WHERE id = ?", [p.id])
    await seen(); await backdate(2)
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: {} })
    expect((await seen()).json().events.map((e) => e.summary)).toEqual(['Divya updated their details'])
  })

  // trip-planner-4hi: an incomplete profile isn't confirmed by saving, so a
  // no-op save of one has nothing to tell the organizer.
  it('a no-op save of an incomplete profile records nothing', async () => {
    const { seen, asParticipant, backdate } = await setup()
    await seen(); await backdate(2)
    await asParticipant({ method: 'PUT', url: '/api/participant/profile', payload: {} })
    expect((await seen()).json().events).toEqual([])
  })

  it('tick, untick, tick again within the hour records one tick', async () => {
    const { db, t, p, seen, asParticipant, backdate } = await setup()
    await seen(); await backdate(2)
    await db.run("INSERT INTO checklists (id,trip_id,kind,name) VALUES ('c2',?,'packing','Pack')", [t.id])
    await db.run("INSERT INTO checklist_items (id,checklist_id,title,assignee_person_id,done,position) VALUES ('i2','c2','Hat',?,0,0)", [p.id])
    for (const done of [true, false, true, false, true]) {
      await asParticipant({ method: 'PUT', url: '/api/participant/checklist-items/i2', payload: { done } })
    }
    expect((await seen()).json().events.map((e) => e.summary)).toEqual(['Divya ticked Hat'])
  })

  it('a failed participant write records nothing', async () => {
    const { seen, asParticipant, backdate } = await setup()
    await seen(); await backdate(2)
    const bad = await asParticipant({ method: 'PUT', url: '/api/participant/checklist-items/nope', payload: { done: true } })
    expect(bad.statusCode).toBe(404)
    expect((await seen()).json().events).toEqual([])
  })

  it("another organizer's trip → 404", async () => {
    const { app, db, cookie } = await setup()
    const other = await createOrganizer(db, { email: 'other-seen@x.dev' })
    const t2 = await createTrip(db, { organizer_id: other.id })
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t2.id}/seen` })
    expect(res.statusCode).toBe(404)
  })
})
