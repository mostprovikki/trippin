import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useArchiveStore } from './archive.js'

function jsonResponse(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
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
