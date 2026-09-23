import { createWriteStream, createReadStream, statSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join, dirname } from 'node:path'
import { config } from '../config.js'
import { StorageNotFoundError } from './errors.js'

export function makeLocalStorage({ uploadsDir = config.uploadsDir } = {}) {
  const abs = (key) => join(uploadsDir, key)
  return {
    async put(_req, key, readable, _opts) { // _opts: { mime } — filesystem has no content-type to set
      await mkdir(dirname(abs(key)), { recursive: true })
      await pipeline(readable, createWriteStream(abs(key)))
      return { size: statSync(abs(key)).size }
    },
    async getDownload(_req, { key, filename, mime, streamless }) {
      try { statSync(abs(key)) }
      catch (e) { if (e.code === 'ENOENT') throw new StorageNotFoundError(key); throw e }
      // `streamless: true` is the file-url (JSON) route's existence check — it only
      // ever reports {url, direct:false} back to the client and never touches the
      // stream itself. Opening one anyway (fs.createReadStream opens a real fd in
      // its constructor, autoClose or not) leaked a file descriptor on every hit
      // before this, since nothing was ever reading or destroying it.
      if (streamless) return { filename, mime }
      return { stream: createReadStream(abs(key)), filename, mime }
    },
    async remove(_req, key) {
      try { await unlink(abs(key)) }
      catch (e) { if (e.code !== 'ENOENT') throw e /* else: already gone */ }
    }
  }
}
