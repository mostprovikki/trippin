import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTES = join(dirname(fileURLToPath(import.meta.url)), '../src/routes')

// A disjoint `type: [...]` union in a route schema makes Ajv's strict mode complain
// ("use allowUnionTypes to allow union type keyword") once per compile — a single
// `is_template: ['boolean','integer']` produced 103 stderr lines per server test run,
// which is enough noise to bury a real warning. Nullable unions (`['string','null']`)
// are fine and Ajv permits them, so only genuinely disjoint ones are flagged here.
//
// Fixing the schema is the right move rather than setting allowUnionTypes: Fastify's
// ajv runs coerceTypes:'array', so these unions constrain far less than they appear to
// (an integer body value satisfies `type:'array'` by being wrapped) — the union was
// decoration, not validation.
const UNION = /type:\s*\[([^\]]*)\]/g

describe('no disjoint type unions in route schemas', () => {
  it('every type: [...] union is nullable, not disjoint', () => {
    const offenders = []
    for (const name of readdirSync(ROUTES)) {
      if (!name.endsWith('.js')) continue
      const file = join(ROUTES, name)
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(UNION)) {
        const types = m[1].split(',').map((t) => t.trim().replace(/['"]/g, '')).filter(Boolean)
        const concrete = types.filter((t) => t !== 'null')
        if (concrete.length > 1) offenders.push(`${name}: type: [${types.join(', ')}]`)
      }
    }
    expect(offenders).toEqual([])
  })
})
