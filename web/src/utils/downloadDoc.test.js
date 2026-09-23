import { describe, it, expect, vi } from 'vitest'
import { fetchDocumentBlob, triggerBlobDownload, DownloadError } from './downloadDoc.js'

describe('fetchDocumentBlob', () => {
  it('direct:true — fetches the presigned url with NO headers, even when the caller passed some', async () => {
    const calls = []
    global.fetch = vi.fn((url, opts) => {
      calls.push({ url, opts })
      return Promise.resolve(new Response(new Blob(['pdf-bytes']), { status: 200 }))
    })

    const blob = await fetchDocumentBlob(
      { url: 'https://stratus.example/signed?sig=abc', direct: true },
      { headers: { Authorization: 'Bearer tok-123' } }
    )

    expect(blob).toBeInstanceOf(Blob)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://stratus.example/signed?sig=abc')
    // The presigned URL IS the auth — the bearer token must never ride along.
    expect(calls[0].opts?.headers).toBeUndefined()
  })

  it('direct:false — fetches the same-origin url WITH the caller headers', async () => {
    const calls = []
    global.fetch = vi.fn((url, opts) => {
      calls.push({ url, opts })
      return Promise.resolve(new Response(new Blob(['pdf-bytes']), { status: 200 }))
    })

    const blob = await fetchDocumentBlob(
      { url: '/api/documents/d1/file', direct: false },
      { headers: { Authorization: 'Bearer tok-123' } }
    )

    expect(blob).toBeInstanceOf(Blob)
    expect(calls[0].url).toBe('/api/documents/d1/file')
    expect(calls[0].opts.headers.Authorization).toBe('Bearer tok-123')
    expect(calls[0].opts.credentials).toBe('same-origin')
  })

  it('direct:true failure throws DownloadError("url_expired")', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response('', { status: 403 })))
    await expect(fetchDocumentBlob({ url: 'https://stratus.example/signed', direct: true }))
      .rejects.toMatchObject({ reason: 'url_expired' })
  })

  it('direct:false 401 throws DownloadError("auth")', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response('', { status: 401 })))
    await expect(fetchDocumentBlob({ url: '/api/documents/d1/file', direct: false }))
      .rejects.toMatchObject({ reason: 'auth' })
  })

  it('direct:false 404 throws DownloadError("not_found")', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response('', { status: 404 })))
    await expect(fetchDocumentBlob({ url: '/api/documents/d1/file', direct: false }))
      .rejects.toMatchObject({ reason: 'not_found' })
  })

  it('direct:false 500 throws DownloadError("server")', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response('', { status: 500 })))
    await expect(fetchDocumentBlob({ url: '/api/documents/d1/file', direct: false }))
      .rejects.toMatchObject({ reason: 'server' })
  })

  it('a thrown fetch (network/CORS failure) becomes DownloadError("network"), not an unhandled rejection', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(fetchDocumentBlob({ url: 'https://stratus.example/signed', direct: true }))
      .rejects.toBeInstanceOf(DownloadError)
    await expect(fetchDocumentBlob({ url: 'https://stratus.example/signed', direct: true }))
      .rejects.toMatchObject({ reason: 'network' })
  })
})

describe('triggerBlobDownload', () => {
  it('creates an anchor with the given filename, clicks it, and revokes the object URL (async, not before the click returns)', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.fn()
    const realCreateElement = document.createElement.bind(document)
    const createElSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    triggerBlobDownload(new Blob(['x']), 'passport.pdf')

    expect(createSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    // Not revoked synchronously — WebKit can abort the download if the object URL
    // is torn down before it has finished handing off to the OS/save dialog.
    expect(revokeSpy).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 0))
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url')

    createSpy.mockRestore(); revokeSpy.mockRestore(); createElSpy.mockRestore()
  })
})
