-- Checklist templates belong to one organizer, like trips and persons (002).
-- Trip-bound checklists could always be scoped through their trip, but
-- templates have trip_id NULL and so had no owner at all — they were global.
ALTER TABLE checklists ADD COLUMN organizer_id TEXT REFERENCES organizers(id);

-- Trip-bound rows inherit the trip's organizer.
UPDATE checklists SET organizer_id = (SELECT t.organizer_id FROM trips t WHERE t.id = checklists.trip_id)
WHERE trip_id IS NOT NULL;

-- Templates predate scoping; assign them to the earliest-created organizer,
-- the same backfill rule 002 used for pre-scoping trips and persons.
UPDATE checklists SET organizer_id = (SELECT id FROM organizers ORDER BY created_at, id LIMIT 1)
WHERE organizer_id IS NULL;

CREATE INDEX idx_checklists_organizer ON checklists(organizer_id);
