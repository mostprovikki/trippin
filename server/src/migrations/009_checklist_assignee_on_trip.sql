-- An assignee must be on the item's trip (trip-planner-h3i.4). The route used to
-- store any person; null the strays, template items (no trip) included, so the
-- Overview and the Checklists tab agree.
UPDATE checklist_items ci SET assignee_person_id = NULL
FROM checklists c
WHERE c.id = ci.checklist_id AND ci.assignee_person_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM trip_participants tp
                  WHERE tp.trip_id = c.trip_id AND tp.person_id = ci.assignee_person_id);
