import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChecklistsStore } from './checklists.js'

function jsonResponse(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
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
