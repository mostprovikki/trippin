import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripsStore } from './trips.js'

function res(body, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }))
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
