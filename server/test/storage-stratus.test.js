import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

// This is the only test file that mocks the Zoho SDK — real bucket calls need live
// Catalyst credentials this environment doesn't have (see storage/stratus.js's header
// comment). Verifies wiring only: contentType reaching putObject, and the ?/?|/?&-style
// 404 translation is left to the driver's inline comment (UNVERIFIED against a live
// bucket — see batch1-report.md).
const putObject = vi.fn(async () => true)
const generatePreSignedUrl = vi.fn(async () => ({ signature: 'https://signed.example/x' }))
const deleteObject = vi.fn(async () => {})
const bucket = vi.fn(() => ({ putObject, generatePreSignedUrl, deleteObject }))
const stratusNs = vi.fn(() => ({ bucket }))
const fakeApp = { stratus: stratusNs }

vi.mock('zcatalyst-sdk-node', () => ({
  default: {
    app: () => fakeApp,
    initializeApp: () => fakeApp,
    initialize: () => fakeApp,
  },
}))

const { makeStratusStorage } = await import('../src/storage/stratus.js')
const { StorageNotFoundError } = await import('../src/storage/errors.js')

describe('stratus storage driver', () => {
  beforeEach(() => { putObject.mockClear(); generatePreSignedUrl.mockClear() })
  const cfg = { storage: { stratusBucket: 'b1' } }

  it('put() passes contentType through to putObject', async () => {
    const storage = makeStratusStorage(cfg)
    await storage.put(null, 'p1/d1', Readable.from(Buffer.from('hello')), { mime: 'application/pdf' })
    expect(putObject).toHaveBeenCalledTimes(1)
    const [key, body, opts] = putObject.mock.calls[0]
    expect(key).toBe('p1/d1')
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(opts).toEqual({ contentType: 'application/pdf' })
  })

  it('put() with no mime given still calls putObject (no contentType option)', async () => {
    const storage = makeStratusStorage(cfg)
    await storage.put(null, 'p1/d2', Readable.from(Buffer.from('hi')))
    const [, , opts] = putObject.mock.calls[0]
    expect(opts).toBeUndefined()
  })

  it('getDownload translates a 404 from the SDK into StorageNotFoundError', async () => {
    generatePreSignedUrl.mockRejectedValueOnce({ statusCode: 404, code: 'stratus/object_not_found', message: 'not found' })
    const storage = makeStratusStorage(cfg)
    await expect(storage.getDownload(null, { key: 'missing/key' })).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  it('getDownload rethrows non-404 errors untranslated', async () => {
    const err = { statusCode: 500, message: 'boom' }
    generatePreSignedUrl.mockRejectedValueOnce(err)
    const storage = makeStratusStorage(cfg)
    await expect(storage.getDownload(null, { key: 'k' })).rejects.toBe(err)
  })
})
