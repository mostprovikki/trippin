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

// Lets a test hold a request open and choose when — and in which order — each
// one answers, which is the only way to reproduce a slow response landing after
// a newer one.
function deferred() {
  let settle
  const promise = new Promise((resolve) => { settle = resolve })
  return { promise, respond: (body, status = 200) => settle(new Response(JSON.stringify(body), { status })) }
}

describe('readiness store trip tagging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('drops another trip data before its own request goes out', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useReadinessStore()
    store.$patch({ data: { checklists: { total_items: 9 } }, lastTripId: 't1' })

    const p = store.fetch('t2')
    expect(store.data).toBe(null)
    // cleared too: a view that guards on "do you already hold this trip?" must
    // not be told yes by an id whose data has just been thrown away.
    expect(store.lastTripId).toBe(null)

    pending.respond({ checklists: { total_items: 1 } })
    await p
    expect(store.lastTripId).toBe('t2')
  })

  it('leaves this trip data in place while refetching it, so the sidebar badges do not blink', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useReadinessStore()
    store.$patch({ data: { checklists: { total_items: 9 } }, lastTripId: 't1' })

    const p = store.fetch('t1')
    expect(store.data).toEqual({ checklists: { total_items: 9 } })

    pending.respond({ checklists: { total_items: 10 } })
    await p
    expect(store.data).toEqual({ checklists: { total_items: 10 } })
  })
})

describe('readiness store stale responses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('keeps trip B data when trip A response arrives after it', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useReadinessStore()

    const pa = store.fetch('t1')
    const pb = store.fetch('t2')
    b.respond({ checklists: { total_items: 2 } })
    await pb
    a.respond({ checklists: { total_items: 1 } })
    await pa

    expect(store.data).toEqual({ checklists: { total_items: 2 } })
    expect(store.lastTripId).toBe('t2')
  })

  it('keeps the newer refresh when two refreshes of one trip answer out of order', async () => {
    // TripLayout refreshes badges on every section change, so two refreshes for
    // the same trip can easily overlap without any trip change involved.
    const first = deferred()
    const second = deferred()
    fetch.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const store = useReadinessStore()
    store.lastTripId = 't1'

    const p1 = store.fetch('t1')
    const p2 = store.fetch('t1')
    second.respond({ checklists: { total_items: 5 } })
    await p2
    first.respond({ checklists: { total_items: 4 } })
    await p1

    expect(store.data).toEqual({ checklists: { total_items: 5 } })
  })

  it('does not raise an error banner for a request the user has already left behind', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useReadinessStore()

    const pa = store.fetch('t1')
    const pb = store.fetch('t2')
    b.respond({ checklists: { total_items: 2 } })
    await pb
    a.respond({ error: { code: 'NOT_FOUND', message: 'No such trip' } }, 404)
    await expect(pa).rejects.toThrow('No such trip')

    expect(store.error).toBe(null)
    expect(store.data).toEqual({ checklists: { total_items: 2 } })
  })
})
