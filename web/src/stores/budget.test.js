import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBudgetStore } from './budget.js'

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

const budgetResponse = {
  lines: [{ category: 'stay', estimate: 12000, basis: '4n x 3k' }],
  total: 12000,
  participant_count: 3,
  equal_share: 4000,
  overrides: [{ person_id: 'p1', person_name: 'Ann', amount: 2000, note: 'solo' }]
}

describe('budget store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchBudget() hits GET /api/trips/:id/budget and sets state', async () => {
    fetch.mockImplementation(() => jsonResponse(budgetResponse))
    const store = useBudgetStore()
    await store.fetchBudget('t1')
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/budget', expect.objectContaining({ method: 'GET' }))
    expect(store.lines).toEqual(budgetResponse.lines)
    expect(store.total).toBe(12000)
    expect(store.participant_count).toBe(3)
    expect(store.equal_share).toBe(4000)
    expect(store.overrides).toEqual(budgetResponse.overrides)
  })

  it('saveLines() PUTs /api/trips/:id/budget with lines and updates state', async () => {
    fetch.mockImplementation(() => jsonResponse({ ...budgetResponse, total: 18000 }))
    const store = useBudgetStore()
    const lines = [{ category: 'stay', estimate: 12000, basis: '4n x 3k' }, { category: 'food', estimate: 6000 }]
    await store.saveLines('t1', lines)
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/budget', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ lines })
    }))
    expect(store.total).toBe(18000)
  })

  it('saveOverrides() PUTs /api/trips/:id/budget/overrides with overrides and updates state', async () => {
    fetch.mockImplementation(() => jsonResponse(budgetResponse))
    const store = useBudgetStore()
    const overrides = [{ person_id: 'p1', amount: 2000, note: 'solo' }]
    await store.saveOverrides('t1', overrides)
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/budget/overrides', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ overrides })
    }))
    expect(store.overrides).toEqual(budgetResponse.overrides)
  })

  it('aiDraft() POSTs /api/trips/:id/budget/ai-draft, fills draft, toggles aiBusy', async () => {
    fetch.mockImplementation(() => jsonResponse({ lines: [{ category: 'stay', estimate: 9000, basis: 'guess' }] }))
    const store = useBudgetStore()
    const p = store.aiDraft('t1')
    expect(store.aiBusy).toBe(true)
    await p
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/budget/ai-draft', expect.objectContaining({ method: 'POST' }))
    expect(store.aiBusy).toBe(false)
    expect(store.draft).toEqual([{ category: 'stay', estimate: 9000, basis: 'guess' }])
  })

  it('applyDraft() PUTs draft lines to /api/trips/:id/budget and clears draft', async () => {
    fetch.mockImplementation(() => jsonResponse(budgetResponse))
    const store = useBudgetStore()
    store.draft = [{ category: 'stay', estimate: 9000, basis: 'guess' }]
    await store.applyDraft('t1')
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/budget', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ lines: [{ category: 'stay', estimate: 9000, basis: 'guess' }] })
    }))
    expect(store.draft).toBe(null)
  })

  it('applyDraft() is a no-op when draft is empty', async () => {
    const store = useBudgetStore()
    await store.applyDraft('t1')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rethrows ApiError and sets this.error on failure', async () => {
    fetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such trip' } }), { status: 404 }))
    )
    const store = useBudgetStore()
    await expect(store.fetchBudget('bad')).rejects.toThrow('No such trip')
    expect(store.error).toBe('No such trip')
  })
})

describe('budget store trip tagging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('tags what it loaded with the trip it came from', async () => {
    fetch.mockImplementation(() => jsonResponse(budgetResponse))
    const store = useBudgetStore()
    expect(store.lastTripId).toBe(null)
    await store.fetchBudget('t1')
    expect(store.lastTripId).toBe('t1')
  })

  it('drops another trip data before its own request goes out, without the view asking', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useBudgetStore()
    store.$patch({ ...budgetResponse, draft: [{ category: 'stay', estimate: 1 }], lastTripId: 't1' })

    const p = store.fetchBudget('t2')
    // not awaited on purpose: the point is that t1 numbers are already gone
    // while t2 is still in flight, so nothing stale renders under t2's header.
    expect(store.lines).toEqual([])
    expect(store.total).toBe(0)
    expect(store.equal_share).toBe(0)
    expect(store.participant_count).toBe(0)
    expect(store.overrides).toEqual([])
    expect(store.draft).toBe(null)
    expect(store.lastTripId).toBe(null)

    pending.respond(budgetResponse)
    await p
    expect(store.total).toBe(12000)
    expect(store.lastTripId).toBe('t2')
  })

  it('leaves data in place when the same trip is refetched', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useBudgetStore()
    store.$patch({ ...budgetResponse, lastTripId: 't1' })

    const p = store.fetchBudget('t1')
    expect(store.total).toBe(12000)

    pending.respond({ ...budgetResponse, total: 15000 })
    await p
    expect(store.total).toBe(15000)
  })
})

describe('budget store stale responses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('keeps trip B data when trip A response arrives after it', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useBudgetStore()

    const pa = store.fetchBudget('t1')
    const pb = store.fetchBudget('t2')
    b.respond({ ...budgetResponse, total: 22000 })
    await pb
    a.respond({ ...budgetResponse, total: 11000 })
    await pa

    expect(store.total).toBe(22000)
    expect(store.lastTripId).toBe('t2')
  })

  it('keeps the newer save when two saves for one trip answer out of order', async () => {
    const first = deferred()
    const second = deferred()
    fetch.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const store = useBudgetStore()
    store.lastTripId = 't1'

    const p1 = store.saveLines('t1', [{ category: 'stay', estimate: 1000 }])
    const p2 = store.saveLines('t1', [{ category: 'stay', estimate: 2000 }])
    second.respond({ ...budgetResponse, total: 2000 })
    await p2
    first.respond({ ...budgetResponse, total: 1000 })
    await p1

    expect(store.total).toBe(2000)
  })

  it('does not raise an error banner for a request the user has already left behind', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useBudgetStore()

    const pa = store.fetchBudget('t1')
    const pb = store.fetchBudget('t2')
    b.respond(budgetResponse)
    await pb
    a.respond({ error: { code: 'NOT_FOUND', message: 'No such trip' } }, 404)
    await expect(pa).rejects.toThrow('No such trip')

    expect(store.error).toBe(null)
    expect(store.total).toBe(12000)
  })

  it('keeps the newer AI draft when an older draft request answers late', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useBudgetStore()

    const pa = store.aiDraft('t1')
    const pb = store.aiDraft('t2')
    b.respond({ lines: [{ category: 'stay', estimate: 2 }] })
    await pb
    a.respond({ lines: [{ category: 'stay', estimate: 1 }] })
    await pa

    expect(store.draft).toEqual([{ category: 'stay', estimate: 2 }])
    expect(store.aiBusy).toBe(false)
  })
})
