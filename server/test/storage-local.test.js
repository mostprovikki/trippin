import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { makeLocalStorage } from '../src/storage/local.js'
import { StorageNotFoundError } from '../src/storage/errors.js'

describe('local storage driver', () => {
  const storage = makeLocalStorage({ uploadsDir: mkdtempSync(join(tmpdir(), 'tp-store-')) })
  it('put → getDownload(stream) → remove round-trip', async () => {
    const { size } = await storage.put(null, 'p1/d1', Readable.from(Buffer.from('hello')))
    expect(size).toBe(5)
    const dl = await storage.getDownload(null, { key: 'p1/d1', filename: 'x.txt', mime: 'text/plain' })
    expect(dl.url).toBeUndefined()
    let body = ''
    for await (const chunk of dl.stream) body += chunk
    expect(body).toBe('hello')
    await storage.remove(null, 'p1/d1')
    await expect(storage.getDownload(null, { key: 'p1/d1', filename: 'x', mime: 't' })).rejects.toThrow()
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
