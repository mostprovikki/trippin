import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChecklistsStore } from './checklists.js'

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

describe('checklists store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('fetchForTrip() hits GET /api/trips/:tripId/checklists and sets checklists', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklists: [{ id: 'c1', kind: 'packing', name: 'Packing', items: [] }] }))
    const store = useChecklistsStore()
    await store.fetchForTrip('t1')
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/checklists', expect.objectContaining({ method: 'GET' }))
    expect(store.checklists).toEqual([{ id: 'c1', kind: 'packing', name: 'Packing', items: [] }])
  })

  it('fetchTemplates() hits GET /api/checklists?template=1 and sets templates', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklists: [{ id: 'tpl1', name: 'Beach', kind: 'packing', items: [] }] }))
    const store = useChecklistsStore()
    await store.fetchTemplates()
    expect(fetch).toHaveBeenCalledWith('/api/checklists?template=1', expect.objectContaining({ method: 'GET' }))
    expect(store.templates).toEqual([{ id: 'tpl1', name: 'Beach', kind: 'packing', items: [] }])
  })

  it('createChecklist() POSTs /api/checklists and appends to checklists', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklist: { id: 'c2', kind: 'tasks', name: 'Tasks', items: [] } }, 201))
    const store = useChecklistsStore()
    // the row is only rendered when it belongs to the list on screen, so the
    // store has to be looking at t1 for this to be that trip's own create.
    store.lastTripId = 't1'
    await store.createChecklist({ kind: 'tasks', name: 'Tasks', trip_id: 't1' })
    expect(fetch).toHaveBeenCalledWith('/api/checklists', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ kind: 'tasks', name: 'Tasks', trip_id: 't1' })
    }))
    expect(store.checklists).toEqual([{ id: 'c2', kind: 'tasks', name: 'Tasks', items: [] }])
  })

  it('createChecklist() with is_template appends to templates', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklist: { id: 'tpl2', kind: 'packing', name: 'Tpl', is_template: 1, items: [] } }, 201))
    const store = useChecklistsStore()
    await store.createChecklist({ kind: 'packing', name: 'Tpl', is_template: true })
    expect(store.templates).toEqual([{ id: 'tpl2', kind: 'packing', name: 'Tpl', is_template: 1, items: [] }])
  })

  it('deleteChecklist() DELETEs /api/checklists/:id and removes it', async () => {
    fetch.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    const store = useChecklistsStore()
    store.checklists = [{ id: 'c1', items: [] }]
    await store.deleteChecklist('c1')
    expect(fetch).toHaveBeenCalledWith('/api/checklists/c1', expect.objectContaining({ method: 'DELETE' }))
    expect(store.checklists).toEqual([])
  })

  it('addItem() POSTs /api/checklists/:id/items and pushes into checklist.items', async () => {
    fetch.mockImplementation(() => jsonResponse({ id: 'i1', title: 'Passport', done: 0 }, 201))
    const store = useChecklistsStore()
    store.checklists = [{ id: 'c1', items: [] }]
    await store.addItem('c1', { title: 'Passport' })
    expect(fetch).toHaveBeenCalledWith('/api/checklists/c1/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Passport' })
    }))
    expect(store.checklists[0].items).toEqual([{ id: 'i1', title: 'Passport', done: 0 }])
  })

  it('updateItem() PUTs /api/checklist-items/:itemId and updates item incl. done toggle', async () => {
    fetch.mockImplementation(() => jsonResponse({ id: 'i1', title: 'Passport', done: 1 }))
    const store = useChecklistsStore()
    store.checklists = [{ id: 'c1', items: [{ id: 'i1', title: 'Passport', done: 0 }] }]
    await store.updateItem('i1', { done: true })
    expect(fetch).toHaveBeenCalledWith('/api/checklist-items/i1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ done: true })
    }))
    expect(store.checklists[0].items[0]).toEqual({ id: 'i1', title: 'Passport', done: 1 })
  })

  it('deleteItem() DELETEs /api/checklist-items/:itemId and removes it', async () => {
    fetch.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    const store = useChecklistsStore()
    store.checklists = [{ id: 'c1', items: [{ id: 'i1' }] }]
    await store.deleteItem('i1')
    expect(fetch).toHaveBeenCalledWith('/api/checklist-items/i1', expect.objectContaining({ method: 'DELETE' }))
    expect(store.checklists[0].items).toEqual([])
  })

  it('fromTemplate() POSTs /api/trips/:tripId/checklists/from-template and appends to checklists', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklist: { id: 'c3', name: 'Beach', items: [] } }, 201))
    const store = useChecklistsStore()
    store.lastTripId = 't1'
    await store.fromTemplate('t1', 'tpl1')
    expect(fetch).toHaveBeenCalledWith('/api/trips/t1/checklists/from-template', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ template_id: 'tpl1' })
    }))
    expect(store.checklists).toEqual([{ id: 'c3', name: 'Beach', items: [] }])
  })

  it('promoteToTemplate() POSTs /api/checklists/:id/promote-to-template and appends to templates', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklist: { id: 'tpl3', name: 'Saved', items: [] } }, 201))
    const store = useChecklistsStore()
    await store.promoteToTemplate('c1', 'Saved')
    expect(fetch).toHaveBeenCalledWith('/api/checklists/c1/promote-to-template', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Saved' })
    }))
    expect(store.templates).toEqual([{ id: 'tpl3', name: 'Saved', items: [] }])
  })

  it('aiPackingSuggest() POSTs /api/checklists/:id/ai-packing-suggest and fills packingDraft', async () => {
    fetch.mockImplementation(() => jsonResponse({ items: [{ title: 'Sunscreen' }] }))
    const store = useChecklistsStore()
    const p = store.aiPackingSuggest('c1')
    expect(store.aiBusy).toBe(true)
    await p
    expect(fetch).toHaveBeenCalledWith('/api/checklists/c1/ai-packing-suggest', expect.objectContaining({ method: 'POST' }))
    expect(store.aiBusy).toBe(false)
    expect(store.packingDraft).toEqual({ checklistId: 'c1', items: [{ title: 'Sunscreen' }] })
  })

  it('applyPackingDraft() POSTs each draft title as an item and clears the draft', async () => {
    fetch.mockImplementation((path) => {
      if (path === '/api/checklists/c1/items') return jsonResponse({ id: 'i9', title: 'Sunscreen', done: 0 }, 201)
      return jsonResponse({})
    })
    const store = useChecklistsStore()
    store.checklists = [{ id: 'c1', items: [] }]
    store.packingDraft = { checklistId: 'c1', items: [{ title: 'Sunscreen' }, { title: 'Hat' }] }
    await store.applyPackingDraft('c1')
    expect(fetch).toHaveBeenCalledWith('/api/checklists/c1/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Sunscreen' })
    }))
    expect(fetch).toHaveBeenCalledWith('/api/checklists/c1/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Hat' })
    }))
    expect(store.checklists[0].items).toHaveLength(2)
    expect(store.packingDraft).toBe(null)
  })

  it('rethrows ApiError and sets this.error on failure', async () => {
    fetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such trip' } }), { status: 404 }))
    )
    const store = useChecklistsStore()
    await expect(store.fetchForTrip('bad')).rejects.toThrow('No such trip')
    expect(store.error).toBe('No such trip')
  })
})

describe('checklists store trip tagging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('tags the lists it loaded with the trip they came from', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklists: [{ id: 'c1', items: [] }] }))
    const store = useChecklistsStore()
    await store.fetchForTrip('t1')
    expect(store.lastTripId).toBe('t1')
  })

  it('drops another trip lists before its own request goes out, but keeps templates', async () => {
    const pending = deferred()
    fetch.mockImplementation(() => pending.promise)
    const store = useChecklistsStore()
    store.$patch({
      checklists: [{ id: 'c1', items: [] }],
      templates: [{ id: 'tpl1', items: [] }],
      packingDraft: { checklistId: 'c1', items: [{ title: 'Hat' }] },
      lastTripId: 't1'
    })

    const p = store.fetchForTrip('t2')
    expect(store.checklists).toEqual([])
    expect(store.packingDraft).toBe(null)
    // tagged before the list lands, not after: the tag is what tells a create
    // whether its row belongs on the page, and the create form is usable while
    // this request is still out.
    expect(store.lastTripId).toBe('t2')
    // templates are organizer-scoped, not trip-scoped: blanking the dropdown on
    // every trip change would be a regression, not a fix.
    expect(store.templates).toEqual([{ id: 'tpl1', items: [] }])

    pending.respond({ checklists: [{ id: 'c2', items: [] }] })
    await p
    expect(store.lastTripId).toBe('t2')
  })

  it('lets the trip fetch and the template fetch run together without cancelling each other', async () => {
    // The view fires both at once; a single store-wide token would make the
    // first one to start look superseded and silently drop its list.
    const lists = deferred()
    const templates = deferred()
    fetch.mockImplementationOnce(() => lists.promise).mockImplementationOnce(() => templates.promise)
    const store = useChecklistsStore()

    const both = Promise.allSettled([store.fetchForTrip('t1'), store.fetchTemplates()])
    templates.respond({ checklists: [{ id: 'tpl1', items: [] }] })
    lists.respond({ checklists: [{ id: 'c1', items: [] }] })
    await both

    expect(store.checklists).toEqual([{ id: 'c1', items: [] }])
    expect(store.templates).toEqual([{ id: 'tpl1', items: [] }])
  })
})

describe('checklists store stale responses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('keeps trip B lists when trip A response arrives after them', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useChecklistsStore()

    const pa = store.fetchForTrip('t1')
    const pb = store.fetchForTrip('t2')
    b.respond({ checklists: [{ id: 'b1', items: [] }] })
    await pb
    a.respond({ checklists: [{ id: 'a1', items: [] }] })
    await pa

    expect(store.checklists).toEqual([{ id: 'b1', items: [] }])
    expect(store.lastTripId).toBe('t2')
  })

  it('keeps the newer template list when two template fetches answer out of order', async () => {
    const first = deferred()
    const second = deferred()
    fetch.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const store = useChecklistsStore()

    const p1 = store.fetchTemplates()
    const p2 = store.fetchTemplates()
    second.respond({ checklists: [{ id: 'new', items: [] }] })
    await p2
    first.respond({ checklists: [{ id: 'old', items: [] }] })
    await p1

    expect(store.templates).toEqual([{ id: 'new', items: [] }])
  })

  it('keeps the newer packing suggestion when an older one answers late', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useChecklistsStore()

    const pa = store.aiPackingSuggest('c1')
    const pb = store.aiPackingSuggest('c2')
    b.respond({ items: [{ title: 'Sunhat' }] })
    await pb
    a.respond({ items: [{ title: 'Umbrella' }] })
    await pa

    expect(store.packingDraft).toEqual({ checklistId: 'c2', items: [{ title: 'Sunhat' }] })
    expect(store.aiBusy).toBe(false)
  })

  it('shows a checklist created while this trip own list is still loading', async () => {
    // The create form is live from the moment the page renders, so this is the
    // ordinary case, not a race: the row belongs to the trip on screen and has
    // to appear even though the list it joins has not arrived yet.
    const list = deferred()
    const create = deferred()
    fetch.mockImplementationOnce(() => list.promise).mockImplementationOnce(() => create.promise)
    const store = useChecklistsStore()

    const pList = store.fetchForTrip('t1')
    const pCreate = store.createChecklist({ kind: 'tasks', name: 'Tasks', trip_id: 't1' })
    create.respond({ checklist: { id: 'c9', name: 'Tasks', items: [] } }, 201)
    await pCreate
    expect(store.checklists).toEqual([{ id: 'c9', name: 'Tasks', items: [] }])

    list.respond({ checklists: [{ id: 'c1', items: [] }] })
    await pList
  })

  it('keeps a checklist created for the trip the user left out of the list on screen, without pretending it failed', async () => {
    const create = deferred()
    const load = deferred()
    fetch.mockImplementationOnce(() => create.promise).mockImplementationOnce(() => load.promise)
    const store = useChecklistsStore()
    store.lastTripId = 't1'

    const pCreate = store.createChecklist({ kind: 'tasks', name: 'Tasks', trip_id: 't1' })
    const pLoad = store.fetchForTrip('t2')
    load.respond({ checklists: [{ id: 'b1', items: [] }] })
    await pLoad
    create.respond({ checklist: { id: 'a1', name: 'Tasks', items: [] } }, 201)
    const created = await pCreate

    expect(store.checklists).toEqual([{ id: 'b1', items: [] }])
    // the row was really created, so the caller is told so and no error is
    // raised — it is waiting on trip A the next time trip A is opened.
    expect(created).toEqual({ id: 'a1', name: 'Tasks', items: [] })
    expect(store.error).toBe(null)
  })

  it('keeps a from-template checklist for the trip the user left out of the list on screen', async () => {
    const create = deferred()
    const load = deferred()
    fetch.mockImplementationOnce(() => create.promise).mockImplementationOnce(() => load.promise)
    const store = useChecklistsStore()
    store.lastTripId = 't1'

    const pCreate = store.fromTemplate('t1', 'tpl1')
    const pLoad = store.fetchForTrip('t2')
    load.respond({ checklists: [{ id: 'b1', items: [] }] })
    await pLoad
    create.respond({ checklist: { id: 'a1', name: 'Beach', items: [] } }, 201)
    const created = await pCreate

    expect(store.checklists).toEqual([{ id: 'b1', items: [] }])
    expect(created).toEqual({ id: 'a1', name: 'Beach', items: [] })
    expect(store.error).toBe(null)
  })

  it('still shows a template created from this page, which belongs to no trip', async () => {
    fetch.mockImplementation(() => jsonResponse({ checklist: { id: 'tpl2', name: 'Tpl', is_template: 1, items: [] } }, 201))
    const store = useChecklistsStore()
    // no trip on screen at all: a template must not be withheld for that.
    store.lastTripId = null
    await store.createChecklist({ kind: 'packing', name: 'Tpl', is_template: true })
    expect(store.templates).toEqual([{ id: 'tpl2', name: 'Tpl', is_template: 1, items: [] }])
  })

  it('does not raise an error banner for a request the user has already left behind', async () => {
    const a = deferred()
    const b = deferred()
    fetch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const store = useChecklistsStore()

    const pa = store.fetchForTrip('t1')
    const pb = store.fetchForTrip('t2')
    b.respond({ checklists: [] })
    await pb
    a.respond({ error: { code: 'NOT_FOUND', message: 'No such trip' } }, 404)
    await expect(pa).rejects.toThrow('No such trip')

    expect(store.error).toBe(null)
  })
})
