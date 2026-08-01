import { createWriteStream, createReadStream, statSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join, dirname } from 'node:path'
import { config } from '../config.js'

export function makeLocalStorage({ uploadsDir = config.uploadsDir } = {}) {
  const abs = (key) => join(uploadsDir, key)
  return {
    async put(_req, key, readable) {
      await mkdir(dirname(abs(key)), { recursive: true })
      await pipeline(readable, createWriteStream(abs(key)))
      return { size: statSync(abs(key)).size }
    },
    async getDownload(_req, { key, filename, mime }) {
      statSync(abs(key)) // throws if missing → route 404s upstream of this in practice
      return { stream: createReadStream(abs(key)), filename, mime }
    },
    async remove(_req, key) { try { await unlink(abs(key)) } catch { /* already gone */ } }
  }
}
