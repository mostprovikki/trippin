// server/src/storage/stratus.js — the ONLY file in the app that imports a Zoho SDK.
import catalyst from 'zcatalyst-sdk-node'

export function makeStratusStorage(cfg) {
  const bucket = (req) => catalyst.initialize(req).stratus().bucket(cfg.storage.stratusBucket)
  return {
    async put(req, key, readable) {
      const chunks = []
      for await (const c of readable) chunks.push(c) // ≤10MB (multipart limit) — buffering is fine
      const buf = Buffer.concat(chunks)
      await bucket(req).putObject(key, buf)
      return { size: buf.length }
    },
    async getDownload(req, { key }) {
      // IStratusPresignedUrlRes only ever populates `signature` (verified against
      // lib/utils/pojo/stratus.d.ts) — there is no `.url` property to fall back to.
      const signed = await bucket(req).generatePreSignedUrl(key, 'GET', { expiryIn: 300 })
      return { url: signed.signature }
    },
    async remove(req, key) {
      try { await bucket(req).deleteObject(key) } catch { /* orphan object beats a failed API delete */ }
    }
  }
}
