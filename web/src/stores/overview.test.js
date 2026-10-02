import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOverviewStore } from './overview.js'

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('overview store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchSeen() POSTs /api/trips/:id/seen and keeps since + events for that trip', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/seen')
      expect(opts.method).toBe('POST')
      return json({ since: '2026-09-19 08:00:00', events: [{ id: 'e1', summary: 's', target: 'people', created_at: '2026-09-20 08:00:00' }] })
    })
    const store = useOverviewStore()
    await store.fetchSeen('t1')
    expect(store.since).toBe('2026-09-19 08:00:00')
    expect(store.events).toHaveLength(1)
    expect(store.lastTripId).toBe('t1')
  })

  // trip-planner-0yh (6)
  it('keeps the count of changes past the listed ones', async () => {
    fetch.mockImplementation(() => json({ since: 's', events: [{ id: 'e1' }], more: 4 }))
    const store = useOverviewStore()
    await store.fetchSeen('t1')
    expect(store.more).toBe(4)
  })

  it("asking for another trip drops the previous trip's feed before the request lands", async () => {
    const store = useOverviewStore()
    fetch.mockImplementation(() => json({ since: 'x', events: [{ id: 'e1' }] }))
    await store.fetchSeen('t1')
    let release
    fetch.mockImplementation(() => new Promise((r) => { release = () => r(new Response(JSON.stringify({ since: null, events: [] }))) }))
    const pending = store.fetchSeen('t2')
    expect(store.events).toEqual([])
    expect(store.since).toBe(null)
    release(); await pending
    expect(store.lastTripId).toBe('t2')
  })

  it('a slower response for a trip already left is dropped', async () => {
    const store = useOverviewStore()
    let releaseOld
    fetch.mockImplementationOnce(() => new Promise((r) => { releaseOld = () => r(new Response(JSON.stringify({ since: 'old', events: [{ id: 'old' }] }))) }))
    const oldReq = store.fetchSeen('t1')
    fetch.mockImplementationOnce(() => json({ since: 'new', events: [] }))
    await store.fetchSeen('t2')
    releaseOld(); await oldReq
    expect(store.since).toBe('new')
    expect(store.lastTripId).toBe('t2')
  })
})
