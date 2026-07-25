import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useItineraryStore } from './itinerary.js'

function jsonRes(body, status = 200) {
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

describe('itinerary store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchItinerary() GETs /api/trips/:id/itinerary and sets days', async () => {
    const days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [] }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/itinerary')
      expect(opts.method).toBe('GET')
      return jsonRes({ days })
    })
    const store = useItineraryStore()
    await store.fetchItinerary('t1')
    expect(store.days).toEqual(days)
  })

  it('init() POSTs /api/trips/:id/itinerary/init and sets days', async () => {
    const days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [] }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/itinerary/init')
      expect(opts.method).toBe('POST')
      return jsonRes({ days })
    })
    const store = useItineraryStore()
    await store.init('t1')
    expect(store.days).toEqual(days)
  })

  it('init() surfaces NO_DATES error and rethrows', async () => {
    fetch.mockImplementation(() =>
      jsonRes({ error: { code: 'NO_DATES', message: 'Trip dates are not confirmed' } }, 400)
    )
    const store = useItineraryStore()
    await expect(store.init('t1')).rejects.toThrow('Trip dates are not confirmed')
    expect(store.error).toBe('Trip dates are not confirmed')
  })

  it('addItem() POSTs /api/days/:dayId/items and appends to day', async () => {
    const store = useItineraryStore()
    store.days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [] }]
    const created = { id: 'i1', position: 0, title: 'Lunch', category: 'food' }
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/days/d1/items')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ title: 'Lunch', category: 'food' })
      return jsonRes(created, 201)
    })
    await store.addItem('d1', { title: 'Lunch', category: 'food' })
    expect(store.days[0].items).toEqual([created])
  })

  it('updateItem() PUTs /api/items/:itemId and merges into day', async () => {
    const store = useItineraryStore()
    store.days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [{ id: 'i1', title: 'Old', category: 'food' }] }]
    const updated = { id: 'i1', title: 'New', category: 'food' }
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/items/i1')
      expect(opts.method).toBe('PUT')
      return jsonRes(updated)
    })
    await store.updateItem('i1', { title: 'New' })
    expect(store.days[0].items[0]).toEqual(updated)
  })

  it('deleteItem() DELETEs /api/items/:itemId and removes from day', async () => {
    const store = useItineraryStore()
    store.days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [{ id: 'i1', title: 'Old' }] }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/items/i1')
      expect(opts.method).toBe('DELETE')
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    await store.deleteItem('i1')
    expect(store.days[0].items).toEqual([])
  })

  it('reorder() PUTs /api/days/:dayId/items/order and replaces items', async () => {
    const store = useItineraryStore()
    store.days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [{ id: 'i1' }, { id: 'i2' }] }]
    const reordered = [{ id: 'i2', position: 0 }, { id: 'i1', position: 1 }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/days/d1/items/order')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ item_ids: ['i2', 'i1'] })
      return jsonRes({ items: reordered })
    })
    await store.reorder('d1', ['i2', 'i1'])
    expect(store.days[0].items).toEqual(reordered)
  })

  it('aiDraft() POSTs /api/trips/:id/itinerary/ai-draft and sets draft', async () => {
    const draftDays = [{ day_date: '2026-01-01', items: [{ title: 'Beach', category: 'activity' }] }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/itinerary/ai-draft')
      expect(opts.method).toBe('POST')
      return jsonRes({ days: draftDays })
    })
    const store = useItineraryStore()
    await store.aiDraft('t1')
    expect(store.draft).toEqual(draftDays)
    expect(store.aiBusy).toBe(false)
  })

  it('applyDraft() POSTs /api/trips/:id/itinerary/apply-draft and sets days, clears draft', async () => {
    const store = useItineraryStore()
    store.draft = [{ day_date: '2026-01-01', items: [] }]
    const days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [] }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/trips/t1/itinerary/apply-draft')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ days: [{ day_date: '2026-01-01', items: [] }] })
      return jsonRes({ days })
    })
    await store.applyDraft('t1')
    expect(store.days).toEqual(days)
    expect(store.draft).toBe(null)
  })

  it('aiRegenDay() POSTs /api/days/:dayId/ai-regen and fills dayDrafts', async () => {
    const items = [{ title: 'Chill morning', category: 'rest' }]
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/days/d1/ai-regen')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ instruction: 'more relaxed' })
      return jsonRes({ items })
    })
    const store = useItineraryStore()
    await store.aiRegenDay('d1', 'more relaxed')
    expect(store.dayDrafts.d1).toEqual(items)
  })

  it('applyDay() POSTs /api/days/:dayId/apply and replaces day, clears dayDrafts entry', async () => {
    const store = useItineraryStore()
    store.days = [{ id: 'd1', day_date: '2026-01-01', position: 0, items: [] }]
    store.dayDrafts.d1 = [{ title: 'X', category: 'food' }]
    const day = { id: 'd1', day_date: '2026-01-01', position: 0, items: [{ id: 'i9', title: 'X', category: 'food' }] }
    fetch.mockImplementation((path, opts) => {
      expect(path).toBe('/api/days/d1/apply')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ items: [{ title: 'X', category: 'food' }] })
      return jsonRes({ day })
    })
    await store.applyDay('d1')
    expect(store.days[0]).toEqual(day)
    expect(store.dayDrafts.d1).toBeUndefined()
  })
})

describe('itinerary store trip tagging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('tags the days it loaded with the trip they came from', async () => {
    fetch.mockImplementation(() => jsonRes({ days: [{ id: 'd1', items: [] }] }))
    const store = useItineraryStore()
    await store.fetchItinerary('t1')
    expect(store.lastTripId).toBe('t1')
  })

  it('drops another trip days and drafts before its own request goes out', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useItineraryStore()
    store.$patch({
      days: [{ id: 'd1', day_date: '2026-01-01', items: [] }],
      draft: [{ day_date: '2026-01-01', items: [] }],
      dayDrafts: { d1: [{ title: 'X' }] },
      lastTripId: 't1'
    })

    const p = store.fetchItinerary('t2')
    // not awaited on purpose: an unapplied draft left here would be written into
    // t2 the moment Apply is pressed.
    expect(store.days).toEqual([])
    expect(store.draft).toBe(null)
    expect(store.dayDrafts).toEqual({})
    expect(store.lastTripId).toBe(null)

    pending.respond({ days: [{ id: 'd9', items: [] }] })
    await p
    expect(store.lastTripId).toBe('t2')
  })

  it('leaves days in place when the same trip is refetched', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useItineraryStore()
    store.$patch({ days: [{ id: 'd1', items: [] }], lastTripId: 't1' })

    const p = store.fetchItinerary('t1')
    expect(store.days).toEqual([{ id: 'd1', items: [] }])

    pending.respond({ days: [{ id: 'd1', items: [{ id: 'i1' }] }] })
    await p
    expect(store.days[0].items).toEqual([{ id: 'i1' }])
  })
})

describe('itinerary store stale responses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('keeps trip B days when trip A response arrives after them', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useItineraryStore()

    const pa = store.fetchItinerary('t1')
    const pb = store.fetchItinerary('t2')
    b.respond({ days: [{ id: 'b1', items: [] }] })
    await pb
    a.respond({ days: [{ id: 'a1', items: [] }] })
    await pa

    expect(store.days).toEqual([{ id: 'b1', items: [] }])
    expect(store.lastTripId).toBe('t2')
  })

  it('keeps the newer day list when init and a refetch of one trip answer out of order', async () => {
    const first = deferred()
    const second = deferred()
    fetch.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const store = useItineraryStore()
    store.lastTripId = 't1'

    const p1 = store.fetchItinerary('t1')
    const p2 = store.init('t1')
    second.respond({ days: [{ id: 'new', items: [] }] })
    await p2
    first.respond({ days: [], error: null })
    await p1

    expect(store.days).toEqual([{ id: 'new', items: [] }])
  })

  it('keeps the newer AI draft when an older draft request answers late', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useItineraryStore()

    const pa = store.aiDraft('t1')
    const pb = store.aiDraft('t2')
    b.respond({ days: [{ day_date: '2026-02-02', items: [] }] })
    await pb
    a.respond({ days: [{ day_date: '2026-01-01', items: [] }] })
    await pa

    expect(store.draft).toEqual([{ day_date: '2026-02-02', items: [] }])
    expect(store.aiBusy).toBe(false)
  })

  it('does not raise an error banner for a request the user has already left behind', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useItineraryStore()

    const pa = store.fetchItinerary('t1')
    const pb = store.fetchItinerary('t2')
    b.respond({ days: [] })
    await pb
    a.respond({ error: { code: 'NOT_FOUND', message: 'No such trip' } }, 404)
    await expect(pa).rejects.toThrow('No such trip')

    expect(store.error).toBe(null)
  })
})
