import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSearchStore, MIN_QUERY } from './search.js'

function res(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}
const payload = (overrides = {}) => ({
  query: 'goa',
  total: 1,
  groups: [{ kind: 'trip', label: 'Trips', results: [{ id: 't1', title: 'Goa' }] }],
  ...overrides
})

describe('search store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn(() => res(payload()))
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call the API below the minimum query length', async () => {
    const store = useSearchStore()
    await store.setQuery('g')
    await vi.runAllTimersAsync()
    expect(fetch).not.toHaveBeenCalled()
    expect(store.tooShort).toBe(true)
    expect(store.total).toBe(0)
  })

  it('clears results when the query is emptied', async () => {
    const store = useSearchStore()
    store.groups = payload().groups
    store.total = 1
    await store.setQuery('')
    expect(store.groups).toEqual([])
    expect(store.total).toBe(0)
    expect(store.tooShort).toBe(false)
  })

  it('debounces typing into a single request', async () => {
    const store = useSearchStore()
    store.setQuery('g')
    store.setQuery('go')
    store.setQuery('goa')
    await vi.runAllTimersAsync()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/search?q=goa')
  })

  it('skips the debounce when asked for an immediate run', async () => {
    const store = useSearchStore()
    await store.setQuery('goa', { immediate: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.total).toBe(1)
  })

  it('URL-encodes the query and passes an explicit limit', async () => {
    const store = useSearchStore()
    store.query = 'a&b c'
    await store.run(25)
    expect(fetch.mock.calls[0][0]).toBe('/api/search?q=a%26b+c&limit=25')
  })

  it('exposes results as one flat, decorated list', async () => {
    const store = useSearchStore()
    await store.setQuery('goa', { immediate: true })
    expect(store.items).toHaveLength(1)
    expect(store.items[0]).toMatchObject({ id: 't1', kind: 'trip', to: '/trips/t1', groupLabel: 'Trips' })
  })

  // The classic search race: deleting a character fires a second request that
  // resolves FIRST, and the slower earlier response then overwrites it — leaving
  // the user looking at hits for a query they already changed.
  it('ignores a stale response that lands after a newer one', async () => {
    const store = useSearchStore()
    let resolveSlow
    fetch.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
    fetch.mockImplementationOnce(() => res(payload({
      query: 'go', total: 2,
      groups: [{ kind: 'trip', label: 'Trips', results: [{ id: 't9', title: 'Second' }] }]
    })))

    store.query = 'goa'
    const slow = store.run()          // request 1, still pending
    store.query = 'go'
    await store.run()                 // request 2, resolves now
    expect(store.items[0].id).toBe('t9')

    resolveSlow(new Response(JSON.stringify(payload()), { status: 200 }))
    await slow
    // Still the newer result, not the stale one.
    expect(store.items[0].id).toBe('t9')
    expect(store.total).toBe(2)
  })

  it('records an error and clears stale results when the request fails', async () => {
    const store = useSearchStore()
    fetch.mockImplementation(() => res({ error: { code: 'BOOM', message: 'Search exploded' } }, 500))
    store.query = 'goa'
    await store.run()
    expect(store.error).toBe('Search exploded')
    expect(store.groups).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('reports emptiness only once a real query has returned nothing', async () => {
    const store = useSearchStore()
    fetch.mockImplementation(() => res({ query: 'zzz', total: 0, groups: [] }))
    expect(store.isEmpty).toBe(false)          // nothing typed yet
    await store.setQuery('zzz', { immediate: true })
    expect(store.isEmpty).toBe(true)
  })

  it('reset() drops in-flight results so a reopened palette starts clean', async () => {
    const store = useSearchStore()
    let resolveSlow
    fetch.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
    store.query = 'goa'
    const slow = store.run()
    store.reset()
    resolveSlow(new Response(JSON.stringify(payload()), { status: 200 }))
    await slow
    expect(store.query).toBe('')
    expect(store.groups).toEqual([])
    expect(store.total).toBe(0)
  })

  it('cancels a pending debounce when the query drops below the minimum', async () => {
    const store = useSearchStore()
    store.setQuery('goa')
    await store.setQuery('g')
    await vi.runAllTimersAsync()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps MIN_QUERY in step with what the store enforces', async () => {
    const store = useSearchStore()
    await store.setQuery('x'.repeat(MIN_QUERY - 1))
    await vi.runAllTimersAsync()
    expect(fetch).not.toHaveBeenCalled()
    await store.setQuery('x'.repeat(MIN_QUERY), { immediate: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
