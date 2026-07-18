import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBudgetStore } from './budget.js'

function jsonResponse(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
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
