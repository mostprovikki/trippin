import { describe, it, expect, vi, beforeEach } from 'vitest'

const require_ = vi.fn()
const success = vi.fn()
const error = vi.fn()
const get = vi.fn()
const post = vi.fn()
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: require_ }) }))
vi.mock('./useNotify.js', () => ({ useNotify: () => ({ success, error }) }))
vi.mock('../api/client.js', async (orig) => ({ ...(await orig()), api: { get: (...a) => get(...a), post: (...a) => post(...a) } }))

const { useCopyLink, replaceLinkConfirm } = await import('./useCopyLink.js')
const { ApiError } = await import('../api/client.js')

const writeText = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  writeText.mockResolvedValue()
  // navigator.clipboard is getter-only in happy-dom: defineProperty, not assign
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('useCopyLink', () => {
  it('copies the existing link in one call, never minting', async () => {
    get.mockResolvedValue({ url: '/p/abc' })
    await useCopyLink().copy('t1', 'p1', 'Meena', { hasActiveLink: true })
    expect(get).toHaveBeenCalledWith('/api/trips/t1/participants/p1/link')
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/p/abc`)
    expect(post).not.toHaveBeenCalled()
    expect(require_).not.toHaveBeenCalled()
    expect(success).toHaveBeenCalledWith("Meena's link copied")
  })
  it('no link at all: mints one and copies it, no confirm (nothing to revoke)', async () => {
    get.mockRejectedValue(new ApiError(404, 'NO_RECOVERABLE_LINK', 'x'))
    post.mockResolvedValue({ token: 'new', url: '/p/new' })
    await useCopyLink().copy('t1', 'p1', 'Meena', { hasActiveLink: false })
    expect(require_).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledWith('/api/trips/t1/participants/p1/link')
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/p/new`)
  })
  it('active link that cannot be re-read: asks before replacing, mints only on accept', async () => {
    get.mockRejectedValue(new ApiError(404, 'NO_RECOVERABLE_LINK', 'x'))
    post.mockResolvedValue({ token: 'new', url: '/p/new' })
    // copy() waits on the dialog, so it can't be awaited before accept
    const pending = useCopyLink().copy('t1', 'p1', 'Meena', { hasActiveLink: true })
    await vi.waitFor(() => expect(require_).toHaveBeenCalledTimes(1))
    expect(post).not.toHaveBeenCalled()
    const opts = require_.mock.calls[0][0]
    expect(opts.header).toBe("Replace Meena's link?")
    opts.accept()
    opts.onHide?.()
    await pending
    expect(post).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/p/new`)
  })
  it('other errors surface, no clipboard write', async () => {
    get.mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'))
    await useCopyLink().copy('t1', 'p1', 'Meena', { hasActiveLink: true })
    expect(error).toHaveBeenCalledWith('boom')
    expect(writeText).not.toHaveBeenCalled()
  })
  it('clipboard refusal says so', async () => {
    get.mockResolvedValue({ url: '/p/abc' })
    writeText.mockRejectedValue(new Error('denied'))
    await useCopyLink().copy('t1', 'p1', 'Meena', { hasActiveLink: true })
    expect(error).toHaveBeenCalledWith('Could not access clipboard — copy the link manually')
  })
  it('replace: skips the re-read, asks, mints, copies the new link', async () => {
    post.mockResolvedValue({ token: 'n', url: '/p/NEW' })
    require_.mockImplementation((o) => { o.accept(); o.onHide?.() })
    const url = await useCopyLink().copy('t1', 'p1', 'Asha', { hasActiveLink: true, replace: true })
    expect(get).not.toHaveBeenCalled()
    expect(require_).toHaveBeenCalledTimes(1)
    expect(url).toBe(`${location.origin}/p/NEW`)
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/p/NEW`)
  })
  it('replace cancelled by closing the dialog: resolves null, mints and copies nothing', async () => {
    require_.mockImplementation((o) => o.onHide())
    const url = await useCopyLink().copy('t1', 'p1', 'Asha', { hasActiveLink: true, replace: true })
    expect(url).toBeNull()
    expect(post).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })
  it('replace cancelled with Cancel: resolves null', async () => {
    require_.mockImplementation((o) => { o.reject(); o.onHide?.() })
    expect(await useCopyLink().copy('t1', 'p1', 'Asha', { hasActiveLink: true, replace: true })).toBeNull()
    expect(post).not.toHaveBeenCalled()
  })
  it('compose: copies the composed text and says message', async () => {
    get.mockResolvedValue({ url: '/p/OLD' })
    await useCopyLink().copy('t1', 'p1', 'Asha', { hasActiveLink: true, compose: (u) => `Hi! ${u}` })
    expect(writeText).toHaveBeenCalledWith(`Hi! ${location.origin}/p/OLD`)
    expect(success).toHaveBeenCalledWith("Asha's message copied")
  })
  it('resolve: re-reads without touching the clipboard', async () => {
    get.mockResolvedValue({ url: '/p/OLD' })
    expect(await useCopyLink().resolve('t1', 'p1', 'Asha', { hasActiveLink: true })).toBe(`${location.origin}/p/OLD`)
    expect(writeText).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
  it('replaceLinkConfirm keeps the People copy', () => {
    const o = replaceLinkConfirm('Asha', () => {})
    expect(o.message).toBe("Asha's current link stops working immediately — anyone using it loses access. A new link will be created.")
    expect(o.acceptLabel).toBe('Replace')
  })
})
