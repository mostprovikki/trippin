import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripsStore } from './trips.js'

function res(body, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }))
}

// Lets a test hold a request open and choose when — and in which order — each
// one answers, which is the only way to reproduce a slow response landing after
// a newer one.
function deferred() {
  let settle
  const promise = new Promise((resolve) => { settle = resolve })
  return { promise, respond: (body, status = 200) => settle(new Response(JSON.stringify(body), { status })) }
}

describe('trips store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchTrips() GETs /api/trips', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips')
      expect(opts.method).toBe('GET')
      return res({ trips: [{ id: 't1', name: 'Goa' }] })
    })
    const store = useTripsStore()
    await store.fetchTrips()
    expect(store.trips).toEqual([{ id: 't1', name: 'Goa' }])
  })

  it('fetchTrip() GETs /api/trips/:id', async () => {
    fetch.mockImplementation((path) => {
      expect(path).toBe('/api/trips/t1')
      return res({ trip: { id: 't1', name: 'Goa', goals: [] } })
    })
    const store = useTripsStore()
    await store.fetchTrip('t1')
    expect(store.current).toEqual({ id: 't1', name: 'Goa', goals: [] })
  })

  it('createTrip() POSTs /api/trips and pushes+sets current', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ name: 'Goa' })
      return res({ trip: { id: 't1', name: 'Goa' } }, 201)
    })
    const store = useTripsStore()
    const trip = await store.createTrip({ name: 'Goa' })
    expect(trip).toEqual({ id: 't1', name: 'Goa' })
    expect(store.trips).toEqual([{ id: 't1', name: 'Goa' }])
    expect(store.current).toEqual({ id: 't1', name: 'Goa' })
  })

  it('updateTrip() PUTs /api/trips/:id', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1')
      expect(opts.method).toBe('PUT')
      return res({ trip: { id: 't1', name: 'Goa Updated' } })
    })
    const store = useTripsStore()
    const trip = await store.updateTrip('t1', { name: 'Goa Updated' })
    expect(trip).toEqual({ id: 't1', name: 'Goa Updated' })
    expect(store.current).toEqual({ id: 't1', name: 'Goa Updated' })
  })

  it('setStatus() POSTs /api/trips/:id/status', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/status')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ status: 'planning' })
      return res({ trip: { id: 't1', status: 'planning' } })
    })
    const store = useTripsStore()
    await store.setStatus('t1', 'planning')
    expect(store.current).toEqual({ id: 't1', status: 'planning' })
  })

  it('setStatus() surfaces BAD_TRANSITION error', async () => {
    fetch.mockImplementation(() => res({ error: { code: 'BAD_TRANSITION', message: 'Cannot go idea → active' } }, 400))
    const store = useTripsStore()
    await expect(store.setStatus('t1', 'active')).rejects.toThrow('Cannot go idea → active')
    expect(store.error).toBe('Cannot go idea → active')
  })

  it('saveWindows() PUTs /api/trips/:id/windows and updates current.windows', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/windows')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ windows: [{ start_date: '2026-01-01', end_date: '2026-01-05' }] })
      return res({ windows: [{ id: 'w1', start_date: '2026-01-01', end_date: '2026-01-05' }] })
    })
    const store = useTripsStore()
    store.current = { id: 't1', windows: [] }
    await store.saveWindows('t1', [{ start_date: '2026-01-01', end_date: '2026-01-05' }])
    expect(store.current.windows).toEqual([{ id: 'w1', start_date: '2026-01-01', end_date: '2026-01-05' }])
  })

  it('addGoal() POSTs /api/trips/:id/goals and pushes onto current.goals', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/goals')
      expect(opts.method).toBe('POST')
      return res({ id: 'g1', title: 'Beach day' }, 201)
    })
    const store = useTripsStore()
    store.current = { id: 't1', goals: [] }
    const goal = await store.addGoal('t1', { title: 'Beach day' })
    expect(goal).toEqual({ id: 'g1', title: 'Beach day' })
    expect(store.current.goals).toEqual([{ id: 'g1', title: 'Beach day' }])
  })

  it('updateGoal() PUTs /api/goals/:goalId and replaces entry', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/goals/g1')
      expect(opts.method).toBe('PUT')
      return res({ id: 'g1', title: 'Updated' })
    })
    const store = useTripsStore()
    store.current = { id: 't1', goals: [{ id: 'g1', title: 'Beach day' }] }
    await store.updateGoal('g1', { title: 'Updated' })
    expect(store.current.goals).toEqual([{ id: 'g1', title: 'Updated' }])
  })

  it('deleteGoal() DELETEs /api/goals/:goalId and removes entry', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/goals/g1')
      expect(opts.method).toBe('DELETE')
      return res(null, 204)
    })
    const store = useTripsStore()
    store.current = { id: 't1', goals: [{ id: 'g1', title: 'Beach day' }] }
    await store.deleteGoal('g1')
    expect(store.current.goals).toEqual([])
  })

  it('addParticipant() POSTs /api/trips/:id/participants', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/participants')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ person_id: 'p1' })
      return res({ trip: { id: 't1', participants: [{ person_id: 'p1' }] } }, 201)
    })
    const store = useTripsStore()
    await store.addParticipant('t1', 'p1')
    expect(store.current).toEqual({ id: 't1', participants: [{ person_id: 'p1' }] })
  })

  it('removeParticipant() DELETEs /api/trips/:id/participants/:personId', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/participants/p1')
      expect(opts.method).toBe('DELETE')
      return res(null, 204)
    })
    const store = useTripsStore()
    store.current = { id: 't1', participants: [{ person_id: 'p1' }] }
    await store.removeParticipant('t1', 'p1')
    expect(store.current.participants).toEqual([])
  })

  it('fetchCandidates() GETs /api/trips/:id/candidates', async () => {
    fetch.mockImplementation((path) => {
      expect(path).toBe('/api/trips/t1/candidates')
      return res({ candidates: [{ id: 'c1', name: 'Goa' }] })
    })
    const store = useTripsStore()
    await store.fetchCandidates('t1')
    expect(store.candidates).toEqual([{ id: 'c1', name: 'Goa' }])
  })

  it('addCandidate() POSTs /api/trips/:id/candidates', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/candidates')
      expect(opts.method).toBe('POST')
      return res({ candidate: { id: 'c1', name: 'Goa' } }, 201)
    })
    const store = useTripsStore()
    // the row is only rendered when it belongs to the trip on screen, so the
    // store has to be looking at t1 for this to be that trip's own create.
    store.lastTripId = 't1'
    const candidate = await store.addCandidate('t1', { name: 'Goa' })
    expect(candidate).toEqual({ id: 'c1', name: 'Goa' })
    expect(store.candidates).toEqual([{ id: 'c1', name: 'Goa' }])
  })

  it('aiSuggest() POSTs /api/trips/:id/candidates/ai-suggest and toggles aiBusy', async () => {
    let busyDuringCall
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/candidates/ai-suggest')
      expect(opts.method).toBe('POST')
      busyDuringCall = store.aiBusy
      return res({ candidates: [{ id: 'c1', name: 'Goa', source: 'ai' }] })
    })
    const store = useTripsStore()
    expect(store.aiBusy).toBe(false)
    await store.aiSuggest('t1')
    expect(busyDuringCall).toBe(true)
    expect(store.aiBusy).toBe(false)
    expect(store.candidates).toEqual([{ id: 'c1', name: 'Goa', source: 'ai' }])
  })

  it('decide() POSTs /api/candidates/:id/decide and marks decided', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/candidates/c1/decide')
      expect(opts.method).toBe('POST')
      return res({ trip: { id: 't1', destination: 'Goa' } })
    })
    const store = useTripsStore()
    store.candidates = [{ id: 'c1', decided: 0 }, { id: 'c2', decided: 0 }]
    await store.decide('c1')
    expect(store.current).toEqual({ id: 't1', destination: 'Goa' })
    expect(store.candidates).toEqual([{ id: 'c1', decided: 1 }, { id: 'c2', decided: 0 }])
  })

  it('deleteCandidate() DELETEs /api/candidates/:id', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/candidates/c1')
      expect(opts.method).toBe('DELETE')
      return res(null, 204)
    })
    const store = useTripsStore()
    store.candidates = [{ id: 'c1' }]
    await store.deleteCandidate('c1')
    expect(store.candidates).toEqual([])
  })

  it('createLink() POSTs /api/trips/:tripId/participants/:personId/link and returns token+url once', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/participants/p1/link')
      expect(opts.method).toBe('POST')
      return res({ token: 'abc123', url: '/p/abc123' }, 201)
    })
    const store = useTripsStore()
    const result = await store.createLink('t1', 'p1')
    expect(result).toEqual({ token: 'abc123', url: '/p/abc123' })
  })

  it('fetchLinks() GETs /api/trips/:tripId/links', async () => {
    fetch.mockImplementation((path) => {
      expect(path).toBe('/api/trips/t1/links')
      return res({ links: [{ id: 'l1', person_name: 'Alice', revoked_at: null }] })
    })
    const store = useTripsStore()
    await store.fetchLinks('t1')
    expect(store.links).toEqual([{ id: 'l1', person_name: 'Alice', revoked_at: null }])
  })

  it('revokeLink() POSTs /api/links/:linkId/revoke and marks link revoked', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/links/l1/revoke')
      expect(opts.method).toBe('POST')
      return res(null, 204)
    })
    const store = useTripsStore()
    store.links = [{ id: 'l1', revoked_at: null }]
    await store.revokeLink('l1')
    expect(store.links[0].revoked_at).not.toBeNull()
  })

  it('rethrows ApiError and sets this.error on failure', async () => {
    fetch.mockImplementation(() => res({ error: { code: 'NOT_FOUND', message: 'No such trip' } }, 404))
    const store = useTripsStore()
    await expect(store.fetchTrip('bad')).rejects.toThrow('No such trip')
    expect(store.error).toBe('No such trip')
  })
})

describe('trips store trip tagging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('tags the trip its per-trip slices describe', async () => {
    fetch.mockImplementation(() => res({ trip: { id: 't1', name: 'Goa' } }))
    const store = useTripsStore()
    await store.fetchTrip('t1')
    expect(store.lastTripId).toBe('t1')
  })

  it('drops another trip header, candidates and links before its own request goes out, but keeps the trips list', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useTripsStore()
    store.$patch({
      trips: [{ id: 't1' }, { id: 't2' }],
      current: { id: 't1', name: 'Goa' },
      candidates: [{ id: 'c1' }],
      links: [{ id: 'l1' }],
      aiBusy: true,
      lastTripId: 't1'
    })

    const p = store.fetchTrip('t2')
    expect(store.current).toBe(null)
    expect(store.candidates).toEqual([])
    expect(store.links).toEqual([])
    expect(store.aiBusy).toBe(false)
    // the list is the organizer's, not one trip's: blanking it on every trip
    // change would empty the trips page and the breadcrumb behind it.
    expect(store.trips).toEqual([{ id: 't1' }, { id: 't2' }])
    // tagged before the response lands, so the two sibling fetches below can
    // tell they are asking for the same trip rather than clearing after it.
    expect(store.lastTripId).toBe('t2')

    pending.respond({ trip: { id: 't2' } })
    await p
  })

  it('lets the trip, candidates and links fetches run together without cancelling each other', async () => {
    // Three separate views fire these at once for the same trip. A single
    // store-wide token would make each look superseded by the next, and a tag
    // set only on success would let the second fetch clear the first one's
    // token — either way a list that arrived fine is thrown away.
    const trip = deferred()
    const cands = deferred()
    const links = deferred()
    fetch
      .mockImplementationOnce(() => trip.promise)
      .mockImplementationOnce(() => cands.promise)
      .mockImplementationOnce(() => links.promise)
    const store = useTripsStore()

    const all = Promise.allSettled([store.fetchTrip('t1'), store.fetchCandidates('t1'), store.fetchLinks('t1')])
    links.respond({ links: [{ id: 'l1' }] })
    cands.respond({ candidates: [{ id: 'c1' }] })
    trip.respond({ trip: { id: 't1', name: 'Goa' } })
    await all

    expect(store.current).toEqual({ id: 't1', name: 'Goa' })
    expect(store.candidates).toEqual([{ id: 'c1' }])
    expect(store.links).toEqual([{ id: 'l1' }])
  })
})

describe('trips store stale responses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('keeps trip B in the header when trip A answers after it', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useTripsStore()

    const pa = store.fetchTrip('t1')
    const pb = store.fetchTrip('t2')
    b.respond({ trip: { id: 't2', name: 'Kerala' } })
    await pb
    a.respond({ trip: { id: 't1', name: 'Goa' } })
    await pa

    expect(store.current).toEqual({ id: 't2', name: 'Kerala' })
    expect(store.lastTripId).toBe('t2')
  })

  it('keeps trip B candidates when trip A answers after them', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useTripsStore()

    const pa = store.fetchCandidates('t1')
    const pb = store.fetchCandidates('t2')
    b.respond({ candidates: [{ id: 'b1' }] })
    await pb
    a.respond({ candidates: [{ id: 'a1' }] })
    await pa

    expect(store.candidates).toEqual([{ id: 'b1' }])
  })

  it('keeps trip B links when trip A answers after them', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useTripsStore()

    const pa = store.fetchLinks('t1')
    const pb = store.fetchLinks('t2')
    b.respond({ links: [{ id: 'b1' }] })
    await pb
    a.respond({ links: [{ id: 'a1' }] })
    await pa

    expect(store.links).toEqual([{ id: 'b1' }])
  })

  it('keeps the newer trips list when two list refreshes answer out of order', async () => {
    const first = deferred()
    const second = deferred()
    fetch.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const store = useTripsStore()

    const p1 = store.fetchTrips()
    const p2 = store.fetchTrips()
    second.respond({ trips: [{ id: 'new' }] })
    await p2
    first.respond({ trips: [{ id: 'old' }] })
    await p1

    expect(store.trips).toEqual([{ id: 'new' }])
  })

  it('lets a trips-list refresh survive a trip change', async () => {
    // Opening a trip while the list is still loading must not cancel the list:
    // it is the page the user comes back to, and it belongs to no trip.
    const list = deferred()
    const trip = deferred()
    fetch.mockImplementationOnce(() => list.promise).mockImplementationOnce(() => trip.promise)
    const store = useTripsStore()

    const p = store.fetchTrips()
    store.fetchTrip('t2')
    list.respond({ trips: [{ id: 't9' }] })
    await p

    expect(store.trips).toEqual([{ id: 't9' }])
  })

  it('keeps the newer AI shortlist when an older one answers late', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useTripsStore()

    const pa = store.aiSuggest('t1')
    const pb = store.aiSuggest('t2')
    b.respond({ candidates: [{ id: 'b1' }] })
    await pb
    a.respond({ candidates: [{ id: 'a1' }] })
    await pa

    expect(store.candidates).toEqual([{ id: 'b1' }])
    expect(store.aiBusy).toBe(false)
  })

  it.each([
    ['updateTrip', (s) => s.updateTrip('t1', { name: 'Renamed' })],
    ['setStatus', (s) => s.setStatus('t1', 'planning')],
    ['addParticipant', (s) => s.addParticipant('t1', 'p1')]
  ])('%s() does not put trip A back in the header after trip B was opened', async (_name, run) => {
    // These three answer with a whole trip record that replaces the header
    // outright, so unlike the goal actions they cannot be left to no-op on an
    // id lookup — a late one would rename the trip the user is now looking at.
    const write = deferred()
    const load = deferred()
    fetch.mockImplementationOnce(() => write.promise).mockImplementationOnce(() => load.promise)
    const store = useTripsStore()
    store.$patch({ current: { id: 't1', name: 'Goa' }, lastTripId: 't1' })

    const pWrite = run(store)
    const pLoad = store.fetchTrip('t2')
    load.respond({ trip: { id: 't2', name: 'Kerala' } })
    await pLoad
    write.respond({ trip: { id: 't1', name: 'Renamed' } })
    const returned = await pWrite

    expect(store.current).toEqual({ id: 't2', name: 'Kerala' })
    // and nothing is handed back either: TripSettingsView feeds the return
    // value straight into a draft keyed by whichever trip the route now names.
    expect(returned).toBeUndefined()
  })

  it('does not un-decide trip B shortlist when trip A decision answers late', async () => {
    const decide = deferred()
    const load = deferred()
    fetch.mockImplementationOnce(() => decide.promise).mockImplementationOnce(() => load.promise)
    const store = useTripsStore()
    store.$patch({ current: { id: 't1' }, candidates: [{ id: 'a1', decided: 0 }], lastTripId: 't1' })

    const pDecide = store.decide('a1')
    const pLoad = store.fetchTrip('t2')
    load.respond({ trip: { id: 't2', name: 'Kerala' } })
    await pLoad
    // trip B's own shortlist, already decided, now on screen
    store.candidates = [{ id: 'b1', decided: 1 }]
    decide.respond({ trip: { id: 't1', destination: 'Goa' } })
    await pDecide

    expect(store.current).toEqual({ id: 't2', name: 'Kerala' })
    // the rewrite clears `decided` on every row it touches, so an unguarded one
    // would quietly drop trip B's chosen destination.
    expect(store.candidates).toEqual([{ id: 'b1', decided: 1 }])
  })

  it('keeps a candidate created for the trip the user left out of the list on screen, without pretending it failed', async () => {
    const create = deferred()
    const load = deferred()
    fetch.mockImplementationOnce(() => create.promise).mockImplementationOnce(() => load.promise)
    const store = useTripsStore()
    store.lastTripId = 't1'

    const pCreate = store.addCandidate('t1', { name: 'Goa' })
    const pLoad = store.fetchCandidates('t2')
    load.respond({ candidates: [{ id: 'b1' }] })
    await pLoad
    create.respond({ candidate: { id: 'a1', name: 'Goa' } }, 201)
    const candidate = await pCreate

    expect(store.candidates).toEqual([{ id: 'b1' }])
    // the row was really created, so the caller is told so and no error is
    // raised — it is waiting on trip A the next time trip A is opened.
    expect(candidate).toEqual({ id: 'a1', name: 'Goa' })
    expect(store.error).toBe(null)
  })

  it('does not raise an error banner for a request the user has already left behind', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useTripsStore()

    const pa = store.fetchCandidates('t1')
    const pb = store.fetchCandidates('t2')
    b.respond({ candidates: [] })
    await pb
    a.respond({ error: { code: 'NOT_FOUND', message: 'No such trip' } }, 404)
    await expect(pa).rejects.toThrow('No such trip')

    expect(store.error).toBe(null)
  })
})
