import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from '../src/lib/linkCrypto.js'

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
