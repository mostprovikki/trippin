import { config } from '../config.js'
import { makeLocalStorage } from './local.js'

// Storage driver contract (both local.js and stratus.js implement this):
//   put(req, key, readable, { mime }?) -> { size }        — mime is optional; local ignores it
//   getDownload(req, { key, filename, mime, streamless? }) -> { stream, filename, mime } | { filename, mime } | { url }
//     throws StorageNotFoundError (./errors.js) when the object doesn't exist
//     `streamless: true` (used by the file-url JSON route, never the streaming route) is a
//     request not to open a read stream when one won't be consumed — local.js honors it and
//     returns `{ filename, mime }` with no `.stream`; stratus.js never opens a stream anyway
//     (it always returns `{ url }`) so it ignores the flag.
//   remove(req, key) -> void

export async function makeStorage(cfg = config) {
  if (cfg.storage.driver === 'stratus') {
    const { makeStratusStorage } = await import('./stratus.js') // lazy: SDK only loads on AppSail
    return makeStratusStorage(cfg)
  }
  return makeLocalStorage(cfg)
}
