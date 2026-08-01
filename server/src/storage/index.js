import { config } from '../config.js'
import { makeLocalStorage } from './local.js'
export async function makeStorage(cfg = config) {
  if (cfg.storage.driver === 'stratus') {
    const { makeStratusStorage } = await import('./stratus.js') // lazy: SDK only loads on AppSail
    return makeStratusStorage(cfg)
  }
  return makeLocalStorage(cfg)
}
