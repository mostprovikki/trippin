import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip } from './helpers.js'

// tripper.md §9 data gaps: booking refs on items, a quick-reference source
// (stays, phone, local emergency numbers) — owner decision D4, 2026-10-01.
async function setup() {
  const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
  const t = await createTrip(db, { start_date: '2027-01-10', end_date: '2027-01-11' })
  const init = await authedInject(app, cookie, { method: 'POST', url: `/api/trips/${t.id}/itinerary/init` })
  const dayId = init.json().days[0].id
  return { app, db, cookie, t, dayId, inject: (o) => authedInject(app, cookie, o) }
}

describe('itinerary item booking_ref / phone / stay', () => {
  it('round-trips on create and update', async () => {
    const { inject, dayId } = await setup()
    const c = await inject({ method: 'POST', url: `/api/days/${dayId}/items`, payload: { title: 'Anantara Hoi An', category: 'stay', booking_ref: 'AN-2231', phone: '+84 235 3914 555' } })
    expect(c.statusCode).toBe(201)
    expect(c.json()).toMatchObject({ category: 'stay', booking_ref: 'AN-2231', phone: '+84 235 3914 555' })
    const u = await inject({ method: 'PUT', url: `/api/items/${c.json().id}`, payload: { booking_ref: null, phone: '+84 1' } })
    expect(u.json()).toMatchObject({ booking_ref: null, phone: '+84 1', category: 'stay' })
  })
  it('defaults to null; unknown category still 400', async () => {
    const { inject, dayId } = await setup()
    const c = await inject({ method: 'POST', url: `/api/days/${dayId}/items`, payload: { title: 'Walk' } })
    expect(c.json()).toMatchObject({ booking_ref: null, phone: null })
    const bad = await inject({ method: 'POST', url: `/api/days/${dayId}/items`, payload: { title: 'X', category: 'hotel' } })
    expect(bad.statusCode).toBe(400)
  })
  it('GET itinerary carries the new fields', async () => {
    const { inject, dayId, t } = await setup()
    await inject({ method: 'POST', url: `/api/days/${dayId}/items`, payload: { title: 'Taxi', booking_ref: 'CT-4471' } })
    const days = (await inject({ method: 'GET', url: `/api/trips/${t.id}/itinerary` })).json().days
    expect(days[0].items[0].booking_ref).toBe('CT-4471')
  })
})

describe('trip emergency_info', () => {
  it('saves on PUT /trips/:id and returns on GET', async () => {
    const { inject, t } = await setup()
    const put = await inject({ method: 'PUT', url: `/api/trips/${t.id}`, payload: { emergency_info: 'Police 113 · Ambulance 115' } })
    expect(put.statusCode).toBe(200)
    expect((await inject({ method: 'GET', url: `/api/trips/${t.id}` })).json().trip.emergency_info).toBe('Police 113 · Ambulance 115')
  })
})

// trip-planner-0yh (5): PUT /trips types emergency_info
describe('trip emergency_info validation', () => {
  it('rejects a non-string and an over-long value, accepts null', async () => {
    const { inject, t } = await setup()
    const put = (emergency_info) => inject({ method: 'PUT', url: `/api/trips/${t.id}`, payload: { emergency_info } })
    expect((await put({ police: 113 })).statusCode).toBe(400)
    expect((await put('x'.repeat(2001))).statusCode).toBe(400)
    expect((await put('x'.repeat(2000))).statusCode).toBe(200)
    expect((await put(null)).statusCode).toBe(200)
  })
})
