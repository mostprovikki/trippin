import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSecureConfig, DEV_JWT_SECRET } from '../src/config.js'

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const shaped = (over = {}) => ({
  jwtSecret: DEV_JWT_SECRET,
  storage: { driver: 'local' },
  ...over,
})

describe('assertSecureConfig', () => {
  // A bad DATABASE_URL fails loudly on first use; a missing JWT_SECRET silently falls
  // back to a secret committed to this repo, and anyone who reads it can forge an
  // organizer session. Both arms, because a guard that always throws and a guard that
  // never throws look identical from one test.
  it('throws when the dev default secret meets a production-shaped config', () => {
    expect(() => assertSecureConfig(shaped({ storage: { driver: 'stratus' } })))
      .toThrow(/JWT_SECRET is still the built-in development default/)
    expect(() => assertSecureConfig(shaped(), { NODE_ENV: 'production' }))
      .toThrow(/JWT_SECRET is still the built-in development default/)
  })

  it('stays quiet for local dev, for tests, and for prod with a real secret', () => {
    expect(() => assertSecureConfig(shaped(), { NODE_ENV: undefined })).not.toThrow()
    expect(() => assertSecureConfig(shaped(), { NODE_ENV: 'test' })).not.toThrow()
    expect(() => assertSecureConfig(
      shaped({ jwtSecret: 'a-real-secret', storage: { driver: 'stratus' } }),
      { NODE_ENV: 'production' },
    )).not.toThrow()
  })

  // ...and it is actually wired to module load, not just exported. Importing config.js
  // in a prod-shaped environment must fail the process, so a bad deploy dies at boot
  // rather than serving forgeable sessions.
  const loadConfig = (env) => spawnSync(
    process.execPath,
    ['-e', "import('./src/config.js').then(() => process.exit(0), (e) => { console.error(e.message); process.exit(3) })"],
    { cwd: serverDir, encoding: 'utf8', env: { ...process.env, JWT_SECRET: '', ...env } },
  )

  it('refuses to load config.js at all when STORAGE_DRIVER=stratus without a JWT_SECRET', () => {
    const res = loadConfig({ STORAGE_DRIVER: 'stratus' })
    expect(res.status).toBe(3)
    expect(res.stderr).toMatch(/JWT_SECRET is still the built-in development default/)
  })

  it('loads fine in the dev-shaped environment', () => {
    const res = loadConfig({ STORAGE_DRIVER: 'local', NODE_ENV: 'test' })
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })
})
