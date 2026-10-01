-- Confirmed means complete (tripper.md §6/§9 D2, trip-planner-4hi). The old
-- /p Save confirmed on any save, blanks included; un-confirm those rows so the
-- participant page and the Overview agree. Same blank rule as lib/missing.js.
UPDATE trip_participants tp SET profile_confirmed = 0
FROM persons p
WHERE p.id = tp.person_id AND tp.profile_confirmed = 1
  AND (COALESCE(TRIM(p.phone), '') = '' OR COALESCE(TRIM(p.emergency_contact), '') = '' OR COALESCE(TRIM(p.dietary), '') = '');
