import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useParticipantStore } from './participant.js'

function jsonResponse(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('participant store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('load() sets token, trip, person, documents, packing, tasks with Bearer auth', async () => {
    const calls = []
    fetch.mockImplementation((path, opts) => {
      calls.push({ path, opts })
      if (path === '/api/participant/me') {
        return jsonResponse({
          trip: { id: 't1', name: 'Goa Trip' },
          person: { id: 'p1', name: 'Alice' },
          profile_confirmed: 1
        })
      }
      if (path === '/api/participant/documents') {
        return jsonResponse({ documents: [{ id: 'd1', original_name: 'passport.pdf' }] })
      }
      if (path === '/api/participant/checklist') {
        return jsonResponse({ packing: [{ id: 'i1', title: 'Sunscreen' }], tasks: [{ id: 'i2', title: 'Book train' }] })
      }
      return jsonResponse({})
    })

    const store = useParticipantStore()
    await store.load('tok-123')

    expect(store.token).toBe('tok-123')
    expect(store.trip).toEqual({ id: 't1', name: 'Goa Trip' })
    expect(store.person).toEqual({ id: 'p1', name: 'Alice' })
    expect(store.profileConfirmed).toBe(true)
    expect(store.documents).toEqual([{ id: 'd1', original_name: 'passport.pdf' }])
    expect(store.packing).toEqual([{ id: 'i1', title: 'Sunscreen' }])
    expect(store.tasks).toEqual([{ id: 'i2', title: 'Book train' }])

    for (const { path, opts } of calls) {
      expect(opts.headers.Authorization).toBe('Bearer tok-123')
      expect(['/api/participant/me', '/api/participant/documents', '/api/participant/checklist']).toContain(path)
    }
  })

  it('load() sets error and rethrows ApiError on 401', async () => {
    fetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: 'Invalid link' } }), { status: 401 }))
    )
    const store = useParticipantStore()
    await expect(store.load('bad-token')).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' })
    expect(store.error).toBe('Invalid link')
  })

  it('saveProfile() PUTs profile with Bearer auth and sets profileConfirmed', async () => {
    const store = useParticipantStore()
    store.token = 'tok-123'
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/participant/profile')
      expect(opts.method).toBe('PUT')
      expect(opts.headers.Authorization).toBe('Bearer tok-123')
      expect(JSON.parse(opts.body)).toEqual({ name: 'Bob' })
      return jsonResponse({ person: { id: 'p1', name: 'Bob' } })
    })
    await store.saveProfile({ name: 'Bob' })
    expect(store.person).toEqual({ id: 'p1', name: 'Bob' })
    expect(store.profileConfirmed).toBe(true)
  })

  it('uploadDocument() posts FormData with Bearer auth and appends document', async () => {
    const store = useParticipantStore()
    store.token = 'tok-123'
    store.documents = []
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/participant/documents')
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toBe('Bearer tok-123')
      expect(opts.body).toBeInstanceOf(FormData)
      return jsonResponse({ document: { id: 'd1', original_name: 'passport.pdf' } }, 201)
    })
    await store.uploadDocument(new FormData())
    expect(store.documents).toEqual([{ id: 'd1', original_name: 'passport.pdf' }])
  })

  it('deleteDocument() DELETEs with Bearer auth and removes from state', async () => {
    const store = useParticipantStore()
    store.token = 'tok-123'
    store.documents = [{ id: 'd1' }, { id: 'd2' }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/participant/documents/d1')
      expect(opts.method).toBe('DELETE')
      expect(opts.headers.Authorization).toBe('Bearer tok-123')
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    await store.deleteDocument('d1')
    expect(store.documents).toEqual([{ id: 'd2' }])
  })

  it('tickItem() PUTs done state with Bearer auth and updates matching item in packing/tasks', async () => {
    const store = useParticipantStore()
    store.token = 'tok-123'
    store.packing = [{ id: 'i1', title: 'Sunscreen', done: 0 }]
    store.tasks = [{ id: 'i2', title: 'Book train', done: 0 }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/participant/checklist-items/i1')
      expect(opts.method).toBe('PUT')
      expect(opts.headers.Authorization).toBe('Bearer tok-123')
      expect(JSON.parse(opts.body)).toEqual({ done: true })
      return jsonResponse({ id: 'i1', title: 'Sunscreen', done: 1 })
    })
    await store.tickItem('i1', true)
    expect(store.packing).toEqual([{ id: 'i1', title: 'Sunscreen', done: 1 }])
    expect(store.tasks).toEqual([{ id: 'i2', title: 'Book train', done: 0 }])
  })

  it('sets this.error after a failing action and rethrows', async () => {
    const store = useParticipantStore()
    store.token = 'tok-123'
    fetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such document' } }), { status: 404 }))
    )
    await expect(store.deleteDocument('missing')).rejects.toThrow('No such document')
    expect(store.error).toBe('No such document')
  })
})
