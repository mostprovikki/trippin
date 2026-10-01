-- Quick reference + booking refs for the during-trip Overview (tripper.md §2,
-- §9 data gaps; owner decision D4, 2026-10-01): a `stay` item category, a
-- booking ref and a phone per item, and the trip's local emergency numbers.
ALTER TABLE itinerary_items ADD COLUMN booking_ref TEXT NULL;
ALTER TABLE itinerary_items ADD COLUMN phone TEXT NULL;
ALTER TABLE itinerary_items DROP CONSTRAINT IF EXISTS itinerary_items_category_check;
ALTER TABLE itinerary_items ADD CONSTRAINT itinerary_items_category_check
  CHECK (category IN ('travel','food','activity','rest','logistics','stay'));
ALTER TABLE trips ADD COLUMN emergency_info TEXT NULL;
