import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePeopleStore } from './people.js'

function res(body, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }))
}

describe('people store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchPeople() GETs /api/people and sets people', async () => {
    fetch.mockImplementation((path) => {
      expect(path).toBe('/api/people')
      return res({ people: [{ id: 'p1', name: 'Alice' }] })
    })
    const store = usePeopleStore()
    await store.fetchPeople()
    expect(fetch).toHaveBeenCalledWith('/api/people', expect.objectContaining({ method: 'GET' }))
    expect(store.people).toEqual([{ id: 'p1', name: 'Alice' }])
  })

  it('fetchPerson() GETs person and documents', async () => {
    fetch.mockImplementation((path) => {
      if (path === '/api/people/p1') return res({ person: { id: 'p1', name: 'Alice' } })
      if (path === '/api/people/p1/documents') return res({ documents: [{ id: 'd1' }] })
      return res({})
    })
    const store = usePeopleStore()
    await store.fetchPerson('p1')
    expect(store.current).toEqual({ id: 'p1', name: 'Alice' })
    expect(store.documents).toEqual([{ id: 'd1' }])
  })

  it('fetchDocuments() GETs /api/people/:id/documents', async () => {
    fetch.mockImplementation((path) => {
      expect(path).toBe('/api/people/p1/documents')
      return res({ documents: [{ id: 'd1' }] })
    })
    const store = usePeopleStore()
    await store.fetchDocuments('p1')
    expect(store.documents).toEqual([{ id: 'd1' }])
  })

  it('createPerson() POSTs /api/people and pushes to people', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/people')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ name: 'Bob' })
      return res({ person: { id: 'p2', name: 'Bob' } }, 201)
    })
    const store = usePeopleStore()
    const person = await store.createPerson({ name: 'Bob' })
    expect(person).toEqual({ id: 'p2', name: 'Bob' })
    expect(store.people).toEqual([{ id: 'p2', name: 'Bob' }])
  })

  it('updatePerson() PUTs /api/people/:id and updates current + list entry', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/people/p1')
      expect(opts.method).toBe('PUT')
      return res({ person: { id: 'p1', name: 'Alice Updated' } })
    })
    const store = usePeopleStore()
    store.people = [{ id: 'p1', name: 'Alice' }]
    await store.updatePerson('p1', { name: 'Alice Updated' })
    expect(store.current).toEqual({ id: 'p1', name: 'Alice Updated' })
    expect(store.people[0]).toEqual({ id: 'p1', name: 'Alice Updated' })
  })

  it('deletePerson() DELETEs /api/people/:id and removes from list', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/people/p1')
      expect(opts.method).toBe('DELETE')
      return res(null, 204)
    })
    const store = usePeopleStore()
    store.people = [{ id: 'p1', name: 'Alice' }]
    await store.deletePerson('p1')
    expect(store.people).toEqual([])
  })

  it('deletePerson() surfaces 409 TRIP_MEMBER error', async () => {
    fetch.mockImplementation(() => res({ error: { code: 'TRIP_MEMBER', message: 'Person is part of a non-archived trip' } }, 409))
    const store = usePeopleStore()
    store.people = [{ id: 'p1', name: 'Alice' }]
    await expect(store.deletePerson('p1')).rejects.toThrow('Person is part of a non-archived trip')
    expect(store.error).toBe('Person is part of a non-archived trip')
  })

  it('uploadDocument() POSTs FormData to /api/people/:personId/documents', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/people/p1/documents')
      expect(opts.method).toBe('POST')
      expect(opts.body).toBeInstanceOf(FormData)
      return res({ document: { id: 'd1', doc_type: 'passport' } }, 201)
    })
    const store = usePeopleStore()
    const fd = new FormData()
    const doc = await store.uploadDocument('p1', fd)
    expect(doc).toEqual({ id: 'd1', doc_type: 'passport' })
    expect(store.documents).toEqual([{ id: 'd1', doc_type: 'passport' }])
  })

  it('deleteDocument() DELETEs /api/documents/:id and removes from list', async () => {
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/documents/d1')
      expect(opts.method).toBe('DELETE')
      return res(null, 204)
    })
    const store = usePeopleStore()
    store.documents = [{ id: 'd1' }]
    await store.deleteDocument('d1')
    expect(store.documents).toEqual([])
  })
})
