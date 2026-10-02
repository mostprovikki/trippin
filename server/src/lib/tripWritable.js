import { httpError } from './errors.js'

// D11 (tripper.md §2 Archived): an archived trip is read-only. Every trip-scoped
// write route calls this after authorizing and before writing. Exempt, in
// archive.routes.js: the archive's notes/photo links, actuals, Unarchive.
// `trip` is a trips row or a trip id; null (a template has no trip) is writable.
// Returns true once it has sent the 409: `if (await assertTripWritable(...)) return reply`.
// A boolean, not the reply: Fastify's reply is thenable, so awaiting a returned
// reply resolves to undefined and the caller would go on to write.
export async function assertTripWritable(app, trip, reply) {
  if (trip == null) return false
  const row = typeof trip === 'object' ? trip : await app.db.get('SELECT status FROM trips WHERE id = ?', [trip])
  if (row?.status !== 'archived') return false
  httpError(reply, 409, 'TRIP_ARCHIVED', 'This trip is archived — unarchive it to make changes')
  return true
}
