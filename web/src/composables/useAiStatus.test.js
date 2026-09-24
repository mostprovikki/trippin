import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Module-level cache means the fetch only ever fires once per import, so each
// case needs a fresh module instance to control what that one fetch sees —
// same shape as useThemeMode.test.js's freshImport().
async function freshImport() {
  vi.resetModules()
  return import('./useAiStatus.js')
}

beforeEach(() => { global.fetch = vi.fn() })
afterEach(() => { delete global.fetch })

describe('useAiStatus', () => {
  it('reports enabled/provider/isMock from a real provider', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ enabled: true, provider: 'anthropic' }), { status: 200 }))
    const { useAiStatus } = await freshImport()
    const status = useAiStatus()
    await vi.waitFor(() => expect(status.enabled).toBe(true))
    expect(status.provider).toBe('anthropic')
    expect(status.isMock).toBe(false)
  })

  it('flags isMock when the server reports the dev mock provider', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ enabled: true, provider: 'mock' }), { status: 200 }))
    const { useAiStatus } = await freshImport()
    const status = useAiStatus()
    await vi.waitFor(() => expect(status.isMock).toBe(true))
    expect(status.enabled).toBe(true)
  })

  it('defaults to disabled when the request fails', async () => {
    fetch.mockRejectedValue(new TypeError('network down'))
    const { useAiStatus } = await freshImport()
    const status = useAiStatus()
    await new Promise((r) => setTimeout(r, 0))
    expect(status.enabled).toBe(false)
    expect(status.provider).toBe('none')
    expect(status.isMock).toBe(false)
  })

  it('fetches only once across repeated calls (module cache)', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ enabled: true, provider: 'anthropic' }), { status: 200 }))
    const { useAiStatus } = await freshImport()
    useAiStatus()
    useAiStatus()
    const status = useAiStatus()
    await vi.waitFor(() => expect(status.enabled).toBe(true))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
