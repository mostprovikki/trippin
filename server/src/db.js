import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from './config.js'

const als = new AsyncLocalStorage()

// '?' → '$1..$n', skipping single-quoted literals. Route SQL keeps sqlite-style '?',
// so every unquoted '?' is a placeholder — EXCEPT the shapes below, which this throws
// on instead of silently misnumbering:
//   - '?' inside a double-quoted identifier (e.g. "weird?col") — identifiers can't
//     hold a parameter placeholder; a '?' there is always a mistake.
//   - jsonb operators, which collide with the placeholder convention and are
//     unambiguous once the following char(s) are inspected:
//       '?|' / '?&'      — the jsonb ?| and ?& operators (never valid placeholder syntax)
//       '?' + ws* + "'"  — the bare jsonb ? existence operator applied to a string
//                          literal (e.g. `data ? 'key'`); a real placeholder is never
//                          followed directly by a literal with nothing but whitespace
//                          between them.
//   Use jsonb_exists(col, 'key') / jsonb_exists_any / jsonb_exists_all instead — see
//   CLAUDE.md.
export function compileSql(sql) {
  let out = '', n = 0, inStr = false, inIdent = false
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (!inIdent && c === "'") { inStr = !inStr; out += c; continue }
    if (!inStr && c === '"') { inIdent = !inIdent; out += c; continue }
    if (inIdent) {
      if (c === '?') throw new Error(`compileSql: '?' inside a double-quoted identifier is not supported: ...${sql.slice(Math.max(0, i - 20), i + 5)}...`)
      out += c; continue
    }
    if (!inStr && c === '?') {
      if (sql[i + 1] === '|' || sql[i + 1] === '&') {
        throw new Error(`compileSql: jsonb '?${sql[i + 1]}' operator is forbidden (collides with '?' placeholders) — use jsonb_exists_any/jsonb_exists_all instead: ...${sql.slice(Math.max(0, i - 20), i + 5)}...`)
      }
      let j = i + 1
      while (sql[j] === ' ' || sql[j] === '\t' || sql[j] === '\n') j++
      if (sql[j] === "'") {
        throw new Error(`compileSql: bare jsonb '?' existence operator is forbidden (collides with '?' placeholders) — use jsonb_exists instead: ...${sql.slice(Math.max(0, i - 20), i + 5)}...`)
      }
      out += `$${++n}`
      continue
    }
    out += c
  }
  return out
}

// Serverless networks drop idle connections; retry exactly once, and never inside a tx.
const isConnErr = (e) => ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01'].includes(e.code)
  || /Connection terminated|socket closed|connection closed/i.test(e.message || '')

export async function makeDb({ url = config.databaseUrl, driver = config.dbDriver, searchPath } = {}) {
  let Pool
  if (driver === 'neon') {
    const neon = await import('@neondatabase/serverless')
    neon.neonConfig.webSocketConstructor = globalThis.WebSocket // node22 native — verified on AppSail
    Pool = neon.Pool
  } else {
    Pool = (await import('pg')).default.Pool
  }
  const pool = new Pool({
    connectionString: url,
    max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {})
  })
  // An idle client dying must not crash the process (pg emits 'error' on the pool).
  pool.on('error', (e) => console.error('db pool idle error (discarded):', e.message))

  // A transaction is pinned to ONE client, and a pg client cannot multiplex: a
  // `Promise.all` of db calls inside `db.tx(...)` fires overlapping queries down it.
  // pg quietly serialises them and only emits a process-level deprecation warning
  // (once per process, and gone in pg v9), so the bug is invisible in tests and stays
  // latent until it isn't. Fail loudly instead — deterministic, driver-independent
  // (the neon driver never warned at all), and it points at the fix.
  async function pinned(store, run) {
    if (store.busy) throw new Error(
      'db.tx: concurrent query on the transaction client. Statements inside db.tx(...) must be ' +
      'awaited one at a time — never Promise.all() a set of db calls inside a transaction.')
    store.busy = true
    try { return await run() } finally { store.busy = false }
  }

  async function query(sql, params = []) {
    const store = als.getStore()
    const compiled = compileSql(sql)
    if (store) return pinned(store, () => store.client.query(compiled, params))
    try { return await pool.query(compiled, params) }
    catch (e) { if (isConnErr(e)) return pool.query(compiled, params); throw e }
  }

  return {
    async all(sql, params) { return (await query(sql, params)).rows },
    async get(sql, params) { return (await query(sql, params)).rows[0] },
    async run(sql, params) { return { changes: (await query(sql, params)).rowCount ?? 0 } },
    async exec(sql) { // multi-statement text, no params (simple-query protocol)
      const store = als.getStore()
      if (store) { await pinned(store, () => store.client.query(sql)); return }
      const client = await pool.connect()
      try { await client.query(sql) } finally { client.release() }
    },
    async tx(fn) {
      const cur = als.getStore()
      if (cur) { // nested: savepoint, mirroring better-sqlite3's nesting semantics
        const name = `sp${++cur.depth}`
        await pinned(cur, () => cur.client.query(`SAVEPOINT ${name}`))
        try { const r = await fn(); await pinned(cur, () => cur.client.query(`RELEASE SAVEPOINT ${name}`)); return r }
        catch (e) { await pinned(cur, () => cur.client.query(`ROLLBACK TO SAVEPOINT ${name}`)).catch(() => {}); throw e }
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const r = await als.run({ client, depth: 0 }, fn)
        await client.query('COMMIT')
        return r
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally { client.release() }
    },
    async close() { await pool.end() }
  }
}
