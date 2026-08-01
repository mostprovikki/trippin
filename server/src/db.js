import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from './config.js'

const als = new AsyncLocalStorage()

// '?' → '$1..$n', skipping single-quoted literals. Route SQL keeps sqlite-style '?'.
export function compileSql(sql) {
  let out = '', n = 0, inStr = false
  for (const c of sql) {
    if (c === "'") { inStr = !inStr; out += c; continue }
    out += (!inStr && c === '?') ? `$${++n}` : c
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

  async function query(sql, params = []) {
    const store = als.getStore()
    const compiled = compileSql(sql)
    if (store) return store.client.query(compiled, params)
    try { return await pool.query(compiled, params) }
    catch (e) { if (isConnErr(e)) return pool.query(compiled, params); throw e }
  }

  return {
    async all(sql, params) { return (await query(sql, params)).rows },
    async get(sql, params) { return (await query(sql, params)).rows[0] },
    async run(sql, params) { return { changes: (await query(sql, params)).rowCount ?? 0 } },
    async exec(sql) { // multi-statement text, no params (simple-query protocol)
      const store = als.getStore()
      if (store) { await store.client.query(sql); return }
      const client = await pool.connect()
      try { await client.query(sql) } finally { client.release() }
    },
    async tx(fn) {
      const cur = als.getStore()
      if (cur) { // nested: savepoint, mirroring better-sqlite3's nesting semantics
        const name = `sp${++cur.depth}`
        await cur.client.query(`SAVEPOINT ${name}`)
        try { const r = await fn(); await cur.client.query(`RELEASE SAVEPOINT ${name}`); return r }
        catch (e) { await cur.client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {}); throw e }
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
