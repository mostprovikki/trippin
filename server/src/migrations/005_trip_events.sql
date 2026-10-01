-- "Since you last looked" on the Trip overview (tripper.md §2, §3; owner
-- decision D6, 2026-10-01). trip_events holds participant-originated changes
-- only; organizer_trip_views the per-organizer last visit, where prev_seen_at
-- moves only when a visit comes more than an hour after the last one, so a
-- refresh doesn't empty the feed.
CREATE TABLE trip_events (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('profile_saved','doc_uploaded','checklist_ticked')),
  summary TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('people','checklists')),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX trip_events_trip_created ON trip_events (trip_id, created_at);
CREATE TABLE organizer_trip_views (
  organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL,
  prev_seen_at TEXT NULL,
  PRIMARY KEY (organizer_id, trip_id)
);
