import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { StorageNotFoundError } from '../src/storage/errors.js'

// Wraps the real createReadStream in a spy (not a fake) so every other test in this
// file keeps doing real file I/O, while the streamless test below can assert it was
// never called — that's the only way to actually prove no fd was opened, rather than
// just asserting on the returned shape.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) }
})
const fs = await import('node:fs')
const { makeLocalStorage } = await import('../src/storage/local.js')

describe('local storage driver', () => {
  const storage = makeLocalStorage({ uploadsDir: mkdtempSync(join(tmpdir(), 'tp-store-')) })
  beforeEach(() => { fs.createReadStream.mockClear() })

  it('put → getDownload(stream) → remove round-trip', async () => {
    const { size } = await storage.put(null, 'p1/d1', Readable.from(Buffer.from('hello')))
    expect(size).toBe(5)
    const dl = await storage.getDownload(null, { key: 'p1/d1', filename: 'x.txt', mime: 'text/plain' })
    expect(dl.url).toBeUndefined()
    let body = ''
    for await (const chunk of dl.stream) body += chunk
    expect(body).toBe('hello')
    expect(fs.createReadStream).toHaveBeenCalledTimes(1)
    await storage.remove(null, 'p1/d1')
    await expect(storage.getDownload(null, { key: 'p1/d1', filename: 'x', mime: 't' })).rejects.toThrow()
  })

  // documents.routes.js's file-url (JSON) route calls getDownload with streamless:true
  // on the local driver purely to reuse its existence check — it never reads a
  // stream, so opening one was a straight fd leak (measured on every /file-url hit).
  it('getDownload({ streamless: true }) checks existence but never opens a read stream', async () => {
    await storage.put(null, 'p3/d1', Readable.from(Buffer.from('hello')))
    const dl = await storage.getDownload(null, { key: 'p3/d1', filename: 'x.txt', mime: 'text/plain', streamless: true })
    expect(dl).toEqual({ filename: 'x.txt', mime: 'text/plain' })
    expect(dl.stream).toBeUndefined()
    expect(fs.createReadStream).not.toHaveBeenCalled()
  })

  it('getDownload({ streamless: true }) on a missing key still throws StorageNotFoundError', async () => {
    await expect(storage.getDownload(null, { key: 'never/existed', filename: 'x', mime: 't', streamless: true }))
      .rejects.toBeInstanceOf(StorageNotFoundError)
    expect(fs.createReadStream).not.toHaveBeenCalled()
  })

  it('getDownload on a missing key throws StorageNotFoundError (not a generic statSync error)', async () => {
    await expect(storage.getDownload(null, { key: 'never/existed', filename: 'x', mime: 't' }))
      .rejects.toBeInstanceOf(StorageNotFoundError)
  })

  it('remove() on an already-gone key resolves without throwing (ENOENT is swallowed)', async () => {
    await expect(storage.remove(null, 'never/existed')).resolves.toBeUndefined()
  })

  it('remove() rethrows non-ENOENT errors instead of swallowing them', async () => {
    // unlink() on a directory is EISDIR/EPERM, never ENOENT — a real non-ENOENT
    // failure without needing to mock node:fs.
    const dir = mkdtempSync(join(tmpdir(), 'tp-store-dir-'))
    const dirStorage = makeLocalStorage({ uploadsDir: dir })
    mkdirSync(join(dir, 'a-directory'), { recursive: true })
    await expect(dirStorage.remove(null, 'a-directory')).rejects.toThrow()
  })
})
