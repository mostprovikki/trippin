-- Documents every participant on this trip must have uploaded (tripper.md §6
-- "Missing … doc absent"; owner decision D3, 2026-10-01). JSON array of
-- documents.doc_type values, edited in Details ▾ Settings. Per-destination rules
-- are parked (§9).
ALTER TABLE trips ADD COLUMN required_doc_types TEXT NOT NULL DEFAULT '[]';
