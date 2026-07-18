import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDraft } from './useDraft.js'

const factory = () => ({ step: 1, name: '', tags: '' })

function fakeRouterRoute(query = {}) {
  const route = { query: { ...query } }
  const router = { replace: vi.fn(({ query: q }) => { route.query = q }) }
  return { router, route }
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useDraft', () => {
  it('hydrates factory < localStorage < URL (URL wins for urlFields)', () => {
    localStorage.setItem('tripper:draft:t', JSON.stringify({ name: 'stored', tags: 'a' }))
    const { router, route } = fakeRouterRoute({ step: '3' })
    const d = useDraft('t', factory, { urlFields: ['step'], router, route })
    expect(d.draft.name).toBe('stored')
    expect(d.draft.tags).toBe('a')
    expect(d.draft.step).toBe(3) // coerced number
    d.teardown()
  })

  it('a restored stored draft counts as dirty', () => {
    localStorage.setItem('tripper:draft:t', JSON.stringify({ name: 'stored', tags: '' }))
    const d = useDraft('t', factory)
    expect(d.isDirty.value).toBe(true)
    d.teardown()
  })

  it('debounce-writes bulk fields, mirrors urlFields to query', async () => {
    const { router, route } = fakeRouterRoute()
    const d = useDraft('t', factory, { urlFields: ['step'], router, route })
    d.draft.name = 'hello'
    d.draft.step = 2
    await vi.advanceTimersByTimeAsync(500)
    const stored = JSON.parse(localStorage.getItem('tripper:draft:t'))
    expect(stored.name).toBe('hello')
    expect(stored.step).toBeUndefined() // urlFields never go to storage
    expect(route.query.step).toBe('2')
    expect(router.replace).toHaveBeenCalled()
    d.teardown()
  })

  it('keys are id-scoped — no cross-entity bleed', () => {
    localStorage.setItem('tripper:draft:trip:1:basics', JSON.stringify({ name: 'trip1' }))
    const d = useDraft('trip:2:basics', () => ({ name: '' }))
    expect(d.draft.name).toBe('')
    d.teardown()
  })

  it('isDirty transitions and clear() resets + removes key + strips query', async () => {
    const { router, route } = fakeRouterRoute({ step: '1', other: 'x' })
    const d = useDraft('t', factory, { urlFields: ['step'], router, route })
    expect(d.isDirty.value).toBe(false)
    d.draft.name = 'x'
    await vi.advanceTimersByTimeAsync(500)
    expect(d.isDirty.value).toBe(true)
    expect(localStorage.getItem('tripper:draft:t')).not.toBeNull()
    d.clear()
    expect(d.isDirty.value).toBe(false)
    expect(localStorage.getItem('tripper:draft:t')).toBeNull()
    expect(route.query.step).toBeUndefined()
    expect(route.query.other).toBe('x') // untouched
    d.teardown()
  })

  it('load(): adopts server values when clean, keeps user draft when dirty', () => {
    const d = useDraft('t', factory)
    d.load({ name: 'server' })
    expect(d.draft.name).toBe('server')
    expect(d.isDirty.value).toBe(false)

    localStorage.clear()
    const d2 = useDraft('t2', factory)
    d2.draft.name = 'mine' // dirty
    d2.load({ name: 'server' })
    expect(d2.draft.name).toBe('mine')
    expect(d2.isDirty.value).toBe(true)
    d.teardown(); d2.teardown()
  })

  it('teardown() flushes a pending debounced write (unmount within debounce window)', async () => {
    const d = useDraft('t', factory)
    d.draft.name = 'typed-then-left'
    // let Vue's deep watcher flush (microtask) and schedule the debounce timer,
    // without advancing past debounceMs — simulates immediate in-app navigation
    // before the 400ms window elapses.
    await vi.advanceTimersByTimeAsync(0)
    d.teardown()
    const stored = JSON.parse(localStorage.getItem('tripper:draft:t'))
    expect(stored.name).toBe('typed-then-left')
  })

  it('teardown() after clear() does not resurrect the draft', () => {
    const d = useDraft('t', factory)
    d.draft.name = 'x'
    d.clear()
    d.teardown()
    expect(localStorage.getItem('tripper:draft:t')).toBeNull()
  })
})
