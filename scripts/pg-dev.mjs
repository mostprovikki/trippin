// scripts/pg-dev.mjs — local Postgres 18 for dev/test, via Homebrew's keg-only
// postgresql@18 + pg_ctl (no Docker on this machine). Throwaway cluster in
// .pgdata/ (git-ignored) — tests create schemas per run, so deleting it is
// always safe.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'

const PG_BIN = '/opt/homebrew/opt/postgresql@18/bin'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PGDATA = join(REPO_ROOT, '.pgdata')
const LOG = join(PGDATA, 'log')
const HOST = '127.0.0.1'
const PORT = 43105
const USER = 'tripper'
const DB = 'tripper_test'

function bin(name) {
  const p = join(PG_BIN, name)
  if (!existsSync(p)) {
    console.error(`pg-dev: expected Homebrew postgresql@18 binary at ${p} — is postgresql@18 installed? (brew install postgresql@18)`)
    process.exit(1)
  }
  return p
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' })
}

function isClusterRunning() {
  return run(bin('pg_ctl'), ['-D', PGDATA, 'status']).status === 0
}

function portReachable() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: HOST, port: PORT })
    const done = (ok) => { sock.destroy(); resolve(ok) }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(500, () => done(false))
  })
}

async function up() {
  if (!existsSync(PG_BIN)) {
    console.error(`pg-dev: Homebrew postgresql@18 not found at ${PG_BIN} — brew install postgresql@18`)
    process.exit(1)
  }

  if (!existsSync(PGDATA)) {
    console.log('pg-dev: initializing cluster in .pgdata ...')
    const res = run(bin('initdb'), ['-D', PGDATA, '-U', USER, '--auth=trust', '-E', 'UTF-8'])
    if (res.status !== 0) {
      process.stderr.write(res.stdout || '')
      process.stderr.write(res.stderr || '')
      console.error('pg-dev: initdb failed')
      process.exit(1)
    }
  }

  if (isClusterRunning()) {
    console.log('pg-dev: already up')
    return
  }

  if (await portReachable()) {
    console.error(`pg-dev: port ${PORT} on ${HOST} is already in use by something other than this cluster — refusing to start (never auto-increment, never kill). Free the port and retry.`)
    process.exit(1)
  }

  console.log(`pg-dev: starting Postgres on ${HOST}:${PORT} ...`)
  const start = run(bin('pg_ctl'), ['-D', PGDATA, '-o', `-p ${PORT} -c listen_addresses=${HOST}`, '-l', LOG, 'start', '-w'])
  if (start.status !== 0) {
    process.stderr.write(start.stdout || '')
    process.stderr.write(start.stderr || '')
    console.error('pg-dev: pg_ctl start failed')
    process.exit(1)
  }

  const create = run(bin('createdb'), ['-h', HOST, '-p', String(PORT), '-U', USER, DB])
  if (create.status !== 0 && !/already exists/.test(create.stderr || '')) {
    process.stderr.write(create.stderr || '')
    console.error('pg-dev: createdb failed')
    process.exit(1)
  }

  console.log('pg-dev: up')
}

function down() {
  if (!existsSync(PGDATA) || !isClusterRunning()) {
    console.log('pg-dev: already down')
    return
  }
  const res = run(bin('pg_ctl'), ['-D', PGDATA, 'stop', '-m', 'fast'])
  if (res.status !== 0) {
    process.stderr.write(res.stdout || '')
    process.stderr.write(res.stderr || '')
    console.error('pg-dev: pg_ctl stop failed')
    process.exit(1)
  }
  console.log('pg-dev: down')
}

const cmd = process.argv[2]
if (cmd === 'up') await up()
else if (cmd === 'down') down()
else {
  console.error('usage: node scripts/pg-dev.mjs <up|down>')
  process.exit(1)
}
