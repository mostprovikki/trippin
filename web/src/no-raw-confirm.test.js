import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

// Wave-2 integration (resolved): U11's initial run allowlisted PersonDetailView.vue
// and TripDetailView.vue because they still had raw confirm()/prompt() before U7/U8
// finished converting them. Both are now converted to PrimeVue useConfirm, so the
// allowlist is empty and the guard covers the whole tree.
const ALLOWLIST = []

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue') || (p.endsWith('.js') && !p.endsWith('.test.js'))) out.push(p)
  }
  return out
}

describe('no raw browser dialogs', () => {
  it('no confirm()/alert()/prompt() outside PrimeVue services', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      if (ALLOWLIST.includes(file)) continue
      const text = readFileSync(file, 'utf8')
      // match bare calls: start-of-expression confirm( / alert( / prompt(
      if (/(?<![.\w])(confirm|alert|prompt)\(/.test(text.replace(/confirm\.require\(/g, ''))) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
