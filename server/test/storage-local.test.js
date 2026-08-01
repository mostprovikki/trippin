import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { makeLocalStorage } from '../src/storage/local.js'

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
})
