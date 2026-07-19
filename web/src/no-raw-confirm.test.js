import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

// ESCALATION (U11, see .agent-coordination/NOTES.md): these two files are outside
// U11's file ownership (web/src/components/DestinationPanel.vue, DocumentList.vue,
// ParticipantDocs.vue, GoalsEditor.vue, web/src/views/TripArchiveView.vue) but still
// contain raw confirm()/prompt() calls as of this writing. They belong to another
// wave-2 task's conversion scope. Remove entries here once that task converts them.
const ALLOWLIST = [
  join(SRC, 'views', 'PersonDetailView.vue'),
  join(SRC, 'views', 'TripDetailView.vue')
]

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
