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
