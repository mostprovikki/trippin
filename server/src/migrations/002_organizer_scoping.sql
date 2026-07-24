-- Organizer data isolation: every trip and person belongs to one organizer.
-- Backfill existing rows to the earliest-created organizer (pre-scoping data
-- all came from a single-organizer world).
ALTER TABLE trips ADD COLUMN organizer_id TEXT REFERENCES organizers(id);
ALTER TABLE persons ADD COLUMN organizer_id TEXT REFERENCES organizers(id);

UPDATE trips SET organizer_id = (SELECT id FROM organizers ORDER BY created_at, id LIMIT 1)
WHERE organizer_id IS NULL;
UPDATE persons SET organizer_id = (SELECT id FROM organizers ORDER BY created_at, id LIMIT 1)
WHERE organizer_id IS NULL;

CREATE INDEX idx_trips_organizer ON trips(organizer_id);
CREATE INDEX idx_persons_organizer ON persons(organizer_id);
