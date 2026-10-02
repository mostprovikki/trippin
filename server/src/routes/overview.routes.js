import { httpError } from '../lib/errors.js'

// the feed lists this many; the rest are counted ("and N more")
const FEED_LIMIT = 20

export default async function routes(app) {
  // Records this organizer's visit and returns what participants changed since
  // the previous one. POST because it moves the last-seen mark. The mark only
  // advances (prev_seen_at ← last_seen_at) when the last visit is more than an
  // hour old, so reopening the Overview the same sitting shows the same feed.
  // A first visit seeds the previous mark to the trip's creation (at most 7
  // days back), so changes participants made before it still show.
  app.post('/trips/:id/seen', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const trip = await app.ownedTrip(req, req.params.id)
    if (!trip) return httpError(reply, 404, 'NOT_FOUND', 'No such trip')
    const row = await app.db.get(
      `INSERT INTO organizer_trip_views (organizer_id, trip_id, last_seen_at, prev_seen_at)
       VALUES (?, ?, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
         (SELECT greatest(created_at, to_char((now() AT TIME ZONE 'UTC') - INTERVAL '7 days', 'YYYY-MM-DD HH24:MI:SS'))
          FROM trips WHERE id = ?))
       ON CONFLICT (organizer_id, trip_id) DO UPDATE SET
         prev_seen_at = CASE WHEN organizer_trip_views.last_seen_at
             < to_char((now() AT TIME ZONE 'UTC') - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS')
           THEN organizer_trip_views.last_seen_at ELSE organizer_trip_views.prev_seen_at END,
         last_seen_at = EXCLUDED.last_seen_at
       RETURNING prev_seen_at`,
      [req.organizer.id, trip.id, trip.id]
    )
    const since = row?.prev_seen_at ?? null
    if (!since) return { since, events: [], more: 0 }
    const events = await app.db.all(
      `SELECT id, summary, target, created_at FROM trip_events
       WHERE trip_id = ? AND created_at > ? ORDER BY created_at DESC, id LIMIT ${FEED_LIMIT}`,
      [trip.id, since])
    const { n } = await app.db.get(
      'SELECT COUNT(*)::int AS n FROM trip_events WHERE trip_id = ? AND created_at > ?', [trip.id, since])
    return { since, events, more: Math.max(0, n - events.length) }
  })
}
