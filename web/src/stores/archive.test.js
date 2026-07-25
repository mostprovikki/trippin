import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useArchiveStore } from './archive.js'

function jsonResponse(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

// Lets a test hold a request open and choose when — and in which order — each
// one answers, which is the only way to reproduce a slow response landing after
// a newer one.
function deferred() {
  let settle
  const promise = new Promise((resolve) => { settle = resolve })
  return { promise, respond: (body, status = 200) => settle(new Response(JSON.stringify(body), { status })) }
}

const archiveBody = {
  snapshot: { trip: { name: 'Goa' }, budget: { lines: [], total: 0 }, itinerary: [], checklists: [] },
  notes: 'great trip',
  photo_links: ['http://x.com/1.jpg'],
  archived_at: '2026-01-01 00:00:00'
}

describe('archive store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchArchive() hits GET /api/trips/:id/archive and sets state', async () => {
    fetch.mockImplementation(() => jsonResponse({ archive: archiveBody, actuals: [{ category: 'stay', amount: 100 }] }))
    const store = useArchiveStore()
    await store.fetchArchive('t1')
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/archive', expect.objectContaining({ method: 'GET' }))
    expect(store.snapshot).toEqual(archiveBody.snapshot)
    expect(store.notes).toBe('great trip')
    expect(store.photo_links).toEqual(['http://x.com/1.jpg'])
    expect(store.archived_at).toBe('2026-01-01 00:00:00')
    expect(store.actuals).toEqual([{ category: 'stay', amount: 100 }])
  })

  it('archive() POSTs /api/trips/:id/archive with payload and updates state', async () => {
    fetch.mockImplementation(() => jsonResponse({ archive: archiveBody }))
    const store = useArchiveStore()
    await store.archive('t1', { notes: 'great trip', photo_links: ['http://x.com/1.jpg'] })
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/archive', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ notes: 'great trip', photo_links: ['http://x.com/1.jpg'] })
    }))
    expect(store.notes).toBe('great trip')
    expect(store.snapshot).toEqual(archiveBody.snapshot)
  })

  it('saveArchiveMeta() PUTs /api/trips/:id/archive and updates state', async () => {
    fetch.mockImplementation(() => jsonResponse({ archive: { ...archiveBody, notes: 'updated' } }))
    const store = useArchiveStore()
    await store.saveArchiveMeta('t1', { notes: 'updated', photo_links: [] })
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/archive', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ notes: 'updated', photo_links: [] })
    }))
    expect(store.notes).toBe('updated')
  })

  it('saveActuals() PUTs /api/trips/:id/actuals with actuals and updates state', async () => {
    fetch.mockImplementation(() => jsonResponse({ actuals: [{ category: 'food', amount: 500 }] }))
    const store = useArchiveStore()
    const actuals = [{ category: 'food', amount: 500 }]
    await store.saveActuals('t1', actuals)
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/actuals', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ actuals })
    }))
    expect(store.actuals).toEqual([{ category: 'food', amount: 500 }])
  })

  it('clone() POSTs /api/trips/:id/clone with name and returns new trip id', async () => {
    fetch.mockImplementation(() => jsonResponse({ trip: { id: 't2', name: 'Goa (Clone)' } }, 201))
    const store = useArchiveStore()
    const newId = await store.clone('t1', 'Goa (Clone)')
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/clone', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Goa (Clone)' })
    }))
    expect(newId).toBe('t2')
  })

  it('rethrows ApiError and sets this.error on failure', async () => {
    fetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: 'NOT_ARCHIVED', message: 'Trip has not been archived' } }), { status: 404 }))
    )
    const store = useArchiveStore()
    await expect(store.fetchArchive('bad')).rejects.toThrow('Trip has not been archived')
    expect(store.error).toBe('Trip has not been archived')
  })
})

describe('archive store trip tagging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('retargets itself at the requested trip before the response lands', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useArchiveStore()
    store.$patch({ ...archiveBody, actuals: [{ category: 'stay', amount: 100 }], lastTripId: 't1' })

    const p = store.fetchArchive('t2')
    // "not archived" is a 404 that never writes state, so the emptying and the
    // retag both have to happen up front or t1's timestamp stays on screen and
    // t2 looks archived when it is not.
    expect(store.snapshot).toBe(null)
    expect(store.archived_at).toBe(null)
    expect(store.actuals).toEqual([])
    expect(store.lastTripId).toBe('t2')

    pending.respond({ archive: archiveBody, actuals: [] })
    await p
    expect(store.archived_at).toBe('2026-01-01 00:00:00')
  })

  it('keeps the tag on the requested trip when it turns out not to be archived', async () => {
    fetch.mockImplementation(() => jsonResponse({ error: { code: 'NOT_ARCHIVED', message: 'Trip has not been archived' } }, 404))
    const store = useArchiveStore()
    store.lastTripId = 't1'
    await expect(store.fetchArchive('t2')).rejects.toThrow('Trip has not been archived')
    expect(store.lastTripId).toBe('t2')
    expect(store.snapshot).toBe(null)
  })
})

describe('archive store stale responses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('keeps trip B archive when trip A response arrives after it', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useArchiveStore()

    const pa = store.fetchArchive('t1')
    const pb = store.fetchArchive('t2')
    b.respond({ archive: { ...archiveBody, notes: 'trip B' }, actuals: [{ category: 'food', amount: 2 }] })
    await pb
    a.respond({ archive: { ...archiveBody, notes: 'trip A' }, actuals: [{ category: 'food', amount: 1 }] })
    await pa

    expect(store.notes).toBe('trip B')
    expect(store.actuals).toEqual([{ category: 'food', amount: 2 }])
    expect(store.lastTripId).toBe('t2')
  })

  it('keeps the newer actuals when two saves for one trip answer out of order', async () => {
    const first = deferred()
    const second = deferred()
    fetch.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const store = useArchiveStore()
    store.lastTripId = 't1'

    const p1 = store.saveActuals('t1', [{ category: 'food', amount: 1 }])
    const p2 = store.saveActuals('t1', [{ category: 'food', amount: 2 }])
    second.respond({ actuals: [{ category: 'food', amount: 2 }] })
    await p2
    first.respond({ actuals: [{ category: 'food', amount: 1 }] })
    await p1

    expect(store.actuals).toEqual([{ category: 'food', amount: 2 }])
  })

  it('does not raise an error banner for a request the user has already left behind', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useArchiveStore()

    const pa = store.fetchArchive('t1')
    const pb = store.fetchArchive('t2')
    b.respond({ archive: archiveBody, actuals: [] })
    await pb
    a.respond({ error: { code: 'NOT_ARCHIVED', message: 'Trip has not been archived' } }, 404)
    await expect(pa).rejects.toThrow('Trip has not been archived')

    expect(store.error).toBe(null)
    expect(store.snapshot).toEqual(archiveBody.snapshot)
  })
})
