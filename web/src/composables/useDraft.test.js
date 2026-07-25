import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
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

  it('load() adoption of server data does not persist a pristine snapshot', async () => {
    const d = useDraft('t', factory)
    d.load({ name: 'server' })
    await vi.advanceTimersByTimeAsync(500)
    expect(localStorage.getItem('tripper:draft:t')).toBeNull()
    d.teardown()
  })

  it('returning to baseline removes the stored key', async () => {
    const d = useDraft('t', factory)
    d.draft.name = 'x'
    await vi.advanceTimersByTimeAsync(500)
    expect(localStorage.getItem('tripper:draft:t')).not.toBeNull()
    d.draft.name = ''
    await vi.advanceTimersByTimeAsync(500)
    expect(localStorage.getItem('tripper:draft:t')).toBeNull()
    d.teardown()
  })
})

// Views under TripLayout are reused across :id changes, so useDraft has to
// re-resolve a getter/ref key instead of freezing it at setup.
describe('useDraft with a reactive key', () => {
  it('accepts a ref as well as a getter', async () => {
    localStorage.setItem('tripper:draft:trip:2:basics', JSON.stringify({ name: 'two' }))
    const id = ref('1')
    const d = useDraft(ref('trip:1:basics'), () => ({ name: '' }))
    expect(d.draft.name).toBe('')
    d.teardown()

    const g = useDraft(() => `trip:${id.value}:basics`, () => ({ name: '' }))
    id.value = '2'
    await vi.advanceTimersByTimeAsync(0)
    expect(g.draft.name).toBe('two')
    g.teardown()
  })

  it('loads the new key\'s stored draft when the key changes', async () => {
    localStorage.setItem('tripper:draft:trip:2:basics', JSON.stringify({ name: 'trip2-draft', tags: 'b' }))
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:basics`, factory)
    expect(d.draft.name).toBe('')
    expect(d.isDirty.value).toBe(false)

    id.value = '2'
    await vi.advanceTimersByTimeAsync(0)
    expect(d.draft.name).toBe('trip2-draft')
    expect(d.draft.tags).toBe('b')
    expect(d.isDirty.value).toBe(true) // a restored draft is dirty, as on first mount
    d.teardown()
  })

  it('does not leak the previous key\'s values or dirty state', async () => {
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:basics`, factory)
    d.draft.name = 'typed-into-trip-1'
    await vi.advanceTimersByTimeAsync(500)
    expect(d.isDirty.value).toBe(true)

    id.value = '2'
    await vi.advanceTimersByTimeAsync(500)
    expect(d.draft.name).toBe('') // back to the factory, trip 2 has nothing stored
    expect(d.isDirty.value).toBe(false)
    expect(localStorage.getItem('tripper:draft:trip:2:basics')).toBeNull()
    d.teardown()
  })

  it('flushes a pending write to the old key, never into the new one', async () => {
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:budget`, factory)
    d.draft.name = 'half-typed'
    // let the deep watcher schedule the debounce timer but do not let it fire,
    // then re-key inside the window — the risky interleaving in the real app
    await vi.advanceTimersByTimeAsync(0)
    id.value = '2'
    await vi.advanceTimersByTimeAsync(500)

    expect(JSON.parse(localStorage.getItem('tripper:draft:trip:1:budget')).name).toBe('half-typed')
    expect(localStorage.getItem('tripper:draft:trip:2:budget')).toBeNull()
    expect(d.draft.name).toBe('')
    d.teardown()
  })

  it('a write scheduled in the same tick as the key change still lands on the old key', async () => {
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:budget`, factory)
    // mutate and re-key without an intervening flush, so neither watcher has run
    d.draft.name = 'same-tick'
    id.value = '2'
    await vi.advanceTimersByTimeAsync(500)

    expect(JSON.parse(localStorage.getItem('tripper:draft:trip:1:budget')).name).toBe('same-tick')
    expect(localStorage.getItem('tripper:draft:trip:2:budget')).toBeNull()
    d.teardown()
  })

  it('edits after a re-key are saved and cleared under the new key only', async () => {
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:basics`, factory)
    id.value = '2'
    await vi.advanceTimersByTimeAsync(0)
    d.draft.name = 'trip2'
    await vi.advanceTimersByTimeAsync(500)
    expect(JSON.parse(localStorage.getItem('tripper:draft:trip:2:basics')).name).toBe('trip2')
    expect(localStorage.getItem('tripper:draft:trip:1:basics')).toBeNull()

    d.clear()
    expect(localStorage.getItem('tripper:draft:trip:2:basics')).toBeNull()
    d.teardown()
  })

  it('teardown() after a re-key flushes to the current key and stops re-keying', async () => {
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:basics`, factory)
    id.value = '2'
    await vi.advanceTimersByTimeAsync(0)
    d.draft.name = 'late'
    await vi.advanceTimersByTimeAsync(0)
    d.teardown()
    expect(JSON.parse(localStorage.getItem('tripper:draft:trip:2:basics')).name).toBe('late')

    // a torn-down draft must not keep following the key
    localStorage.setItem('tripper:draft:trip:3:basics', JSON.stringify({ name: 'three' }))
    id.value = '3'
    await vi.advanceTimersByTimeAsync(500)
    expect(d.draft.name).toBe('late')
  })

  it('keeps the same reactive draft object across a re-key (v-model bindings survive)', async () => {
    const id = ref('1')
    const d = useDraft(() => `trip:${id.value}:basics`, factory)
    const alias = d.draft
    id.value = '2'
    await vi.advanceTimersByTimeAsync(0)
    expect(d.draft).toBe(alias)
    d.teardown()
  })
})
