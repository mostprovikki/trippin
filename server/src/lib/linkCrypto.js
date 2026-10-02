import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

// Participant-link tokens are stored encrypted (beside token_hash, which auth
// still uses) so an organizer can copy ⟨Name⟩'s link again without minting a
// new one and revoking the old (tripper.md §1, §4 one click; owner decision D1,
// 2026-10-01). The key is derived from JWT_SECRET rather than a new env var:
// production already refuses to boot with the dev JWT secret (config.js), and
// rotating it only makes old links un-copyable — Copy then falls back to
// minting a fresh one behind the existing "Replace link?" confirm.
const keyFor = (secret) => Buffer.from(hkdfSync('sha256', secret, 'tripper', 'participant-link-token', 32))
const b64 = (buf) => buf.toString('base64url')

export function encryptToken(token, secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv)
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return `${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(ct)}`
}

export function decryptToken(enc, secret) {
  const [iv, tag, ct] = String(enc).split('.').map((p) => Buffer.from(p || '', 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), iv, { authTagLength: 16 })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
