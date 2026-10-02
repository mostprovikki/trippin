import { describe, it, expect, vi } from 'vitest'
import * as crypto from 'node:crypto'
import { encryptToken, decryptToken } from '../src/lib/linkCrypto.js'

vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, createDecipheriv: vi.fn(real.createDecipheriv) }
})

describe('linkCrypto', () => {
  it('round-trips without the token appearing in the ciphertext', () => {
    const enc = encryptToken('abc-token', 'secret-1')
    expect(enc).not.toContain('abc-token')
    expect(decryptToken(enc, 'secret-1')).toBe('abc-token')
  })
  it('two encryptions of one token differ (random IV)', () => {
    expect(encryptToken('abc', 's')).not.toBe(encryptToken('abc', 's'))
  })
  it('rejects tampering and a different secret', () => {
    const enc = encryptToken('abc-token', 'secret-1')
    const [iv, tag, ct] = enc.split('.')
    const flipped = `${iv}.${tag}.${ct.slice(0, -1)}${ct.endsWith('A') ? 'B' : 'A'}`
    expect(() => decryptToken(flipped, 'secret-1')).toThrow()
    expect(() => decryptToken(enc, 'secret-2')).toThrow()
  })
})

// trip-planner-0yh (4): GCM accepts a truncated tag unless told its length,
// which makes forging far cheaper than 2^128. Node 26 refuses short tags on its
// own, Node 22 (production) only warns — so pin the option, not just the outcome.
describe('linkCrypto tag length', () => {
  it('decrypts with authTagLength 16', () => {
    decryptToken(encryptToken('abc', 's'), 's')
    expect(crypto.createDecipheriv).toHaveBeenLastCalledWith('aes-256-gcm', expect.anything(), expect.anything(), { authTagLength: 16 })
  })
  it('rejects a truncated auth tag', () => {
    const enc = encryptToken('abc-token', 'secret-1')
    const [iv, tag, ct] = enc.split('.')
    const short = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url')
    expect(() => decryptToken(`${iv}.${short}.${ct}`, 'secret-1')).toThrow()
  })
})
