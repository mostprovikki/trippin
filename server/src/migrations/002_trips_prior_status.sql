-- Unarchive restores the trip's lifecycle stage instead of hardcoding 'active'
-- (trip-planner-8uw). prior_status records the status a trip had immediately
-- before it was archived, so unarchive can put it back. NULL means either the
-- trip has never been archived, or it was archived before this column existed
-- (the fallback in archive.routes.js unarchive handler treats NULL as 'planning').
ALTER TABLE trips ADD COLUMN prior_status TEXT NULL;
