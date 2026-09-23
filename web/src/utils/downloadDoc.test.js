import { describe, it, expect, vi, beforeEach } from 'vitest'
import { downloadDocument, triggerBlobDownload } from './downloadDoc.js'

function jsonResponse(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('downloadDocument', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('direct:true — fetches the file-url with the caller headers, then the presigned URL with NO headers', async () => {
    const calls = []
    fetch.mockImplementation((path, opts) => {
      calls.push({ path, opts })
      if (path === '/api/participant/documents/d1/file-url') {
        return jsonResponse({ url: 'https://stratus.example/signed?sig=abc', direct: true })
      }
      if (path === 'https://stratus.example/signed?sig=abc') {
        return Promise.resolve(new Response(new Blob(['pdf-bytes']), { status: 200 }))
      }
      throw new Error(`unexpected fetch ${path}`)
    })

    const blob = await downloadDocument('/api/participant/documents/d1/file-url', {
      headers: { Authorization: 'Bearer tok-123' }
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(calls).toHaveLength(2)
    expect(calls[0].path).toBe('/api/participant/documents/d1/file-url')
    expect(calls[0].opts.headers.Authorization).toBe('Bearer tok-123')
    expect(calls[1].path).toBe('https://stratus.example/signed?sig=abc')
    // The presigned URL IS the auth — the bearer token must never ride along.
    expect(calls[1].opts?.headers).toBeUndefined()
  })

  it('direct:false — fetches the returned same-origin url WITH the caller headers', async () => {
    const calls = []
    fetch.mockImplementation((path, opts) => {
      calls.push({ path, opts })
      if (path === '/api/documents/d1/file-url') {
        return jsonResponse({ url: '/api/documents/d1/file', direct: false })
      }
      if (path === '/api/documents/d1/file') {
        return Promise.resolve(new Response(new Blob(['pdf-bytes']), { status: 200 }))
      }
      throw new Error(`unexpected fetch ${path}`)
    })

    const blob = await downloadDocument('/api/documents/d1/file-url')

    expect(blob).toBeInstanceOf(Blob)
    expect(calls[1].path).toBe('/api/documents/d1/file')
  })

  it('returns null when the file-url request fails, without a second fetch', async () => {
    fetch.mockImplementation(() => Promise.resolve(new Response('', { status: 404 })))
    const blob = await downloadDocument('/api/documents/missing/file-url')
    expect(blob).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when the second (presigned/streaming) fetch fails', async () => {
    fetch.mockImplementation((path) => {
      if (path.endsWith('file-url')) return jsonResponse({ url: '/api/documents/d1/file', direct: false })
      return Promise.resolve(new Response('', { status: 500 }))
    })
    const blob = await downloadDocument('/api/documents/d1/file-url')
    expect(blob).toBeNull()
  })
})

describe('triggerBlobDownload', () => {
  it('creates an anchor with the given filename, clicks it, and revokes the object URL', () => {
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
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url')

    createSpy.mockRestore(); revokeSpy.mockRestore(); createElSpy.mockRestore()
  })
})
