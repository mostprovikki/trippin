#!/usr/bin/env node
// scripts/run-e2e.mjs — runs the e2e/*.mjs browser gates against the
// already-running dev stack. The qa-*.mjs gates and ui-walk.mjs all drive
// the same dev server + Postgres through a real browser, so they run
// sequentially (not in parallel — they'd collide over shared DB rows) and
// each gets its own timeout so one hung gate can't wedge the whole run.
//
// Usage:
//   node scripts/run-e2e.mjs gates     # all 12 qa-*.mjs gates, fail-fast off
//   node scripts/run-e2e.mjs smoke     # smoke.mjs only
//   node scripts/run-e2e.mjs ui-walk   # ui-walk.mjs only
//
// Env:
//   E2E_GATE_TIMEOUT_MS   per-gate timeout in ms (default 180000 — see the
//                         comment at its definition below for why 180s)
//
// Prerequisites (gates / ui-walk): web on 43100 + API on 43101, plus the two
// seeded QA accounts the gates log in as:
//   demo@tripper.dev / tripper1234     (QA_EMAIL / QA_PASSWORD default for
//                                        most gates)
//   demo@example.com / demo-pass-123   (qa-surface-palette.mjs default, and
//                                        the second organizer qa-template-
//                                        isolation.mjs needs)
// Start with:
//   npm run db:up && npm run dev
//   node server/scripts/seed-organizer.js --email=demo@tripper.dev --name="Demo Organizer" --password=tripper1234
//   node server/scripts/seed-organizer.js --email=demo@example.com --name="Demo Example" --password=demo-pass-123
// (see individual e2e/qa-*.mjs file headers for any gate-specific seed data;
// re-seed with e2e/seed-demo.mjs if a gate reports it can't find its trip.
// qa-format-polish.mjs and qa-dates-confirmed.mjs resolve the flagship/idea
// trip ids at runtime via GET /api/trips (status=confirmed / status=idea) —
// override with QA_TRIP_ID, or QA_CONFIRMED_TRIP_ID / QA_IDEA_TRIP_ID
// respectively, only if a DB ever has more than one of either status.)
//
// Prerequisites (smoke): local dev Postgres only (npm run db:up) — smoke.mjs
// boots its own in-process server on a random port against a throwaway
// schema, so it does NOT need `npm run dev` or the seeded accounts above.
//
// This script never boots servers itself — a wrong-env run must fail fast
// with the message above, not hang or silently start something the caller
// didn't ask for.

import { spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const E2E_DIR = join(REPO_ROOT, 'e2e')
// Measured 2026-09-23: qa-datepicker.mjs alone takes ~150s (it walks six date
// surfaces plus a second-browser timezone pass) — a 120s timeout killed it
// mid-run with a crash, not a clean FAIL, misclassifying a legitimately slow
// gate as hung. 180s default gives it margin; override with E2E_GATE_TIMEOUT_MS.
const GATE_TIMEOUT_MS = Number(process.env.E2E_GATE_TIMEOUT_MS) || 180_000
// Overridable only so the fail-fast path can be tested against a dead port
// without touching real dev servers; not meant for routine use.
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 43100
const API_PORT = Number(process.env.E2E_API_PORT) || 43101
const PG_PORT = Number(process.env.E2E_PG_PORT) || 43105

const MODES = ['gates', 'smoke', 'ui-walk']
const mode = process.argv[2]
if (!MODES.includes(mode)) {
  console.error(`Usage: node scripts/run-e2e.mjs <${MODES.join('|')}>`)
  process.exit(1)
}

function portReachable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port })
    const done = (ok) => { sock.destroy(); resolve(ok) }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(500, () => done(false))
  })
}

async function unreachablePorts(ports) {
  const results = await Promise.all(ports.map(async (p) => [p, await portReachable(p)]))
  return results.filter(([, ok]) => !ok).map(([p]) => p)
}

const DEV_STACK_MSG = [
  'start with: npm run db:up && npm run dev',
  'seed with:  node server/scripts/seed-organizer.js --email=demo@tripper.dev --name="Demo Organizer" --password=tripper1234',
  '            node server/scripts/seed-organizer.js --email=demo@example.com --name="Demo Example" --password=demo-pass-123',
  '(see e2e/*.mjs file headers for any gate-specific seed data)',
].join('\n')

if (mode === 'smoke') {
  const missing = await unreachablePorts([PG_PORT])
  if (missing.length) {
    console.error(`FAIL: local dev Postgres not reachable on port ${missing.join(', ')}.`)
    console.error('start with: npm run db:up')
    process.exit(1)
  }
} else {
  // Vite binds IPv6-only (see e2e/*.mjs headers) — probing 127.0.0.1 reads as
  // refused even with the dev server up, so the web port is checked on ::1.
  const [webOk, apiUnreachable] = await Promise.all([
    portReachable(WEB_PORT, '::1'),
    unreachablePorts([API_PORT]),
  ])
  const missing = [...(webOk ? [] : [WEB_PORT]), ...apiUnreachable]
  if (missing.length) {
    console.error(`FAIL: dev server(s) not reachable on port(s) ${missing.join(', ')}.`)
    console.error(DEV_STACK_MSG)
    process.exit(1)
  }
}

const files = mode === 'smoke'
  ? ['smoke.mjs']
  : mode === 'ui-walk'
    ? ['ui-walk.mjs']
    : readdirSync(E2E_DIR).filter((f) => /^qa-.*\.mjs$/.test(f)).sort()

if (!files.length) {
  console.error(`FAIL: no e2e/qa-*.mjs files found in ${E2E_DIR} — a passing empty run would be silently vacuous.`)
  process.exit(1)
}

console.log(`Running ${files.length} gate(s) sequentially (timeout ${GATE_TIMEOUT_MS}ms each): ${files.join(', ')}\n`)

const results = []
for (const file of files) {
  const filePath = join(E2E_DIR, file)
  console.log(`--- ${file} ---`)
  const start = Date.now()
  const res = spawnSync(process.execPath, [filePath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: GATE_TIMEOUT_MS,
    env: process.env,
  })
  const ms = Date.now() - start
  // Playwright installs its own SIGTERM handler, so a gate spawnSync kills for
  // running past the timeout exits with a CODE (measured: status=130,
  // signal=null), not a signal — the signal check alone never fires for a
  // real gate. Elapsed-time is the reliable tell; keep the signal check too
  // for the (non-Playwright) case where the child really is killed by signal.
  const timedOut = (res.status === null && res.signal !== null) || ms >= GATE_TIMEOUT_MS
  const ok = res.status === 0 && !timedOut && !res.error
  results.push({ file, ok, status: res.status, signal: res.signal, ms, timedOut, error: res.error })
  if (timedOut) console.error(`!!! ${file} TIMED OUT after ${GATE_TIMEOUT_MS}ms (status=${res.status} signal=${res.signal})`)
  if (res.error) console.error(`!!! ${file} failed to spawn: ${res.error.message}`)
  console.log()
}

console.log('=== e2e summary ===')
for (const r of results) {
  const bits = []
  if (!r.ok) {
    bits.push(`status=${r.status} signal=${r.signal}`)
    if (r.timedOut) bits.push('TIMEOUT')
    if (r.error) bits.push(`spawn error: ${r.error.message}`)
  }
  const detail = bits.length ? `  (${bits.join(' ')})` : ''
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file}  ${r.ms}ms${detail}`)
}
const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `\n${failed.length}/${results.length} gate(s) failed` : `\nall ${results.length} gate(s) passed`)
process.exit(failed.length ? 1 : 0)
