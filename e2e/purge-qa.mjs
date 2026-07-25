// Shared cleanup hook for the browser gates.
//
// Every gate that drives the real app creates real rows — a throwaway trip, and
// for the document gates a throwaway person with uploaded files. None of them
// used to clean up, so the dev DB compounded to 19 junk trips, 37 junk document
// rows and 210MB of upload blobs. That is not merely untidy: it degraded the
// screens the gates themselves inspect (a person-scoped Select rendered with a
// single option, which is thin enough to hide a real defect).
//
// Call purgeQaData() at the end of a gate. Failures are reported, never thrown —
// cleanup must not be able to turn a passing gate red.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')

export function purgeQaData({ quiet = true } = {}) {
  const args = ['scripts/purge-qa-data.js', '--apply']
  if (quiet) args.push('--quiet')
  const res = spawnSync(process.execPath, args, {
    cwd: serverDir,
    encoding: 'utf8'
  })
  if (res.status === 0) {
    console.log('cleanup - QA rows and orphaned uploads purged')
  } else {
    console.warn(`cleanup - purge failed (exit ${res.status}); run \`node scripts/purge-qa-data.js --apply\` from server/`)
    if (res.stderr) console.warn(res.stderr.trim().split('\n').slice(-4).join('\n'))
  }
  return res.status === 0
}
