import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeDb, compileSql } from '../src/db.js'

const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'

describe('compileSql', () => {
  it('numbers ? placeholders', () => {
    expect(compileSql('SELECT * FROM t WHERE a = ? AND b = ?')).toBe('SELECT * FROM t WHERE a = $1 AND b = $2')
  })
  it('ignores ? inside string literals', () => {
    expect(compileSql("SELECT 'a?b' AS x WHERE y = ?")).toBe("SELECT 'a?b' AS x WHERE y = $1")
  })
})

describe('makeDb (pg driver)', () => {
  let db
  beforeAll(async () => {
    db = await makeDb({ url: TEST_URL, driver: 'pg', searchPath: `dbtest_${process.pid}` })
    await db.exec(`CREATE SCHEMA IF NOT EXISTS dbtest_${process.pid}`)
    await db.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v INTEGER)')
    await db.run('DELETE FROM kv')
  })
  afterAll(async () => { await db.exec(`DROP SCHEMA dbtest_${process.pid} CASCADE`); await db.close() })

  it('get/all/run round-trip with ? params', async () => {
    const r = await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['a', 1])
    expect(r.changes).toBe(1)
    expect((await db.get('SELECT v FROM kv WHERE k = ?', ['a'])).v).toBe(1)
    expect(await db.all('SELECT k FROM kv')).toHaveLength(1)
  })

  it('tx commits, and a thrown error rolls back', async () => {
    await db.tx(async () => { await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['c1', 1]) })
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['c1'])).toBeTruthy()
    await expect(db.tx(async () => {
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['r1', 1])
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['r1'])).toBeUndefined()
  })

  it('nested tx = savepoint: inner rollback keeps outer work (the spike scenario)', async () => {
    await db.tx(async () => {
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['outer', 1])
      await expect(db.tx(async () => {
        await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['inner', 2])
        throw new Error('inner-fail')
      })).rejects.toThrow('inner-fail')
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['after', 3])
    })
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['outer'])).toBeTruthy()
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['inner'])).toBeUndefined()
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['after'])).toBeTruthy()
  })

  // A serial test suite cannot tell correct AsyncLocalStorage client pinning apart from
  // one connection handed to two requests — both look fine when nothing overlaps. Under
  // real Fastify concurrency the second failure mode is cross-transaction corruption:
  // one request's ROLLBACK would discard the other's committed work. So overlap them.
  it('overlapping db.tx() calls get different clients (commit and rollback do not bleed)', async () => {
    let releaseCommitter
    const committerReachedBarrier = new Promise((r) => { releaseCommitter = r })
    let releaseRoller
    const rollerReachedBarrier = new Promise((r) => { releaseRoller = r })

    // Both transactions are open at the same time, each having already written, before
    // either finishes — so they must be holding two distinct clients.
    const committing = db.tx(async () => {
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['tx_commit', 1])
      releaseRoller()
      await committerReachedBarrier
    })
    const rollingBack = db.tx(async () => {
      await db.run('INSERT INTO kv (k, v) VALUES (?, ?)', ['tx_rollback', 2])
      releaseCommitter()
      await rollerReachedBarrier
      throw new Error('roll me back')
    }).catch((e) => e)

    await committing
    expect((await rollingBack).message).toBe('roll me back')

    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['tx_commit'])).toBeTruthy()
    expect(await db.get('SELECT * FROM kv WHERE k = ?', ['tx_rollback'])).toBeUndefined()
  })

  it('statements inside tx share one connection (temp table visible)', async () => {
    await db.tx(async () => {
      await db.exec('CREATE TEMP TABLE tmp_tx (i INT) ON COMMIT DROP')
      await db.run('INSERT INTO tmp_tx VALUES (?)', [1])
      expect((await db.get('SELECT count(*)::int AS n FROM tmp_tx')).n).toBe(1)
    })
  })
})
