import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError, participantApi } from './client.js'

describe('api client', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  it('returns parsed json on 200', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    expect(await api.get('/api/health')).toEqual({ ok: 1 })
  })
  it('throws ApiError with code from error envelope', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'nope' } }), { status: 404 }))
    await expect(api.get('/api/people/x')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
  it('participantApi sends bearer header', async () => {
    fetch.mockResolvedValue(new Response('{}', { status: 200 }))
    await participantApi('tok123').get('/api/participant/me')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok123')
  })
  it('dispatches tripper:unauthorized with current path on 401', async () => {
    const handler = vi.fn()
    window.addEventListener('tripper:unauthorized', handler)
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'no' } }), { status: 401 }))
    await expect(api.get('/api/me')).rejects.toThrow('no')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.path).toBe(location.pathname + location.search)
    window.removeEventListener('tripper:unauthorized', handler)
  })
})
