-- Deleting a person unassigns their checklist items instead of failing the FK (trip-planner-h3i.5).
-- 010, not 009: 009_checklist_assignee_on_trip.sql comes from the h3i.4 branch.
ALTER TABLE checklist_items DROP CONSTRAINT checklist_items_assignee_person_id_fkey;
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_assignee_person_id_fkey
  FOREIGN KEY (assignee_person_id) REFERENCES persons(id) ON DELETE SET NULL;
