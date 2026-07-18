import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReadinessStore } from './readiness.js'

describe('readiness store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetch() hits GET /api/trips/:id/readiness and stores data', async () => {
    const payload = {
      participants: [{ person_id: 'p1', name: 'Asha', profile_confirmed: 1, docs_count: 1, doc_warnings: [], has_active_link: true }],
      decisions: { dates_confirmed: true, destination_decided: true, budget_drafted: true, itinerary_days: 4 },
      checklists: { total_items: 3, done_items: 1, overdue: [{ title: 'Book bus', due_date: '2020-01-01', assignee_name: 'Asha' }] }
    }
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/readiness')
      expect(opts?.method ?? 'GET').toBe('GET')
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
    })
    const store = useReadinessStore()
    await store.fetch('t1')
    expect(store.data).toEqual(payload)
    expect(store.error).toBe(null)
  })

  it('fetch() stores error message and rethrows on failure', async () => {
    fetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such trip' } }), { status: 404 })))
    const store = useReadinessStore()
    await expect(store.fetch('bad')).rejects.toThrow('No such trip')
    expect(store.error).toBe('No such trip')
  })
})
