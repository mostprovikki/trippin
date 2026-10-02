-- Booked vs estimated per budget line (tripper.md §2 Budget card, trip-planner-ztt).
-- A flag, not an amount: a booked line's estimate is what was paid. Same 0/1
-- INTEGER convention as checklist_items.done and trip_participants.profile_confirmed.
ALTER TABLE budget_lines ADD COLUMN booked INTEGER NOT NULL DEFAULT 0 CHECK (booked IN (0, 1));
