import { config } from '../config.js'
import { makeLocalStorage } from './local.js'

// Storage driver contract (both local.js and stratus.js implement this):
//   put(req, key, readable, { mime }?) -> { size }        — mime is optional; local ignores it
//   getDownload(req, { key, filename, mime }) -> { stream, filename, mime } | { url }
//     throws StorageNotFoundError (./errors.js) when the object doesn't exist
//   remove(req, key) -> void

export async function makeStorage(cfg = config) {
  if (cfg.storage.driver === 'stratus') {
    const { makeStratusStorage } = await import('./stratus.js') // lazy: SDK only loads on AppSail
    return makeStratusStorage(cfg)
  }
  return makeLocalStorage(cfg)
}
