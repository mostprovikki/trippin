# Backup & Restore

All application state lives under one directory: **`data/`**.

- `data/tripplanner.db` — the SQLite database (organizers, trips, people,
  budgets, checklists, everything except file bytes).
- `data/uploads/` — uploaded document files (passports, tickets, visas, etc.),
  referenced from rows in the database.

There is nothing else to back up. No external services, no other stateful
directories.

## Backup

Pick one of these; both are safe (SQLite handles the "app still writing" case
correctly with `.backup`, and stopping the app removes any doubt).

**Option A — stop the app, copy the directory** (simplest, brief downtime):

```bash
docker compose stop            # or: kill the plain-node process
cp -r data/ /path/to/backups/data-$(date +%Y%m%d-%H%M%S)
docker compose start
```

**Option B — live backup with `sqlite3 .backup`** (no downtime):

```bash
sqlite3 data/tripplanner.db ".backup /path/to/backups/tripplanner-$(date +%Y%m%d-%H%M%S).db"
cp -r data/uploads/ /path/to/backups/uploads-$(date +%Y%m%d-%H%M%S)
```

`.backup` uses SQLite's online backup API, so it produces a consistent
snapshot even while the app is running and writing to the database.

## Restore

1. Stop the app.
2. Replace `data/tripplanner.db` with the backed-up `.db` file, and replace
   `data/uploads/` with the backed-up uploads directory.
3. Start the app back up.

```bash
docker compose stop
rm -rf data/tripplanner.db data/uploads
cp /path/to/backups/tripplanner-<timestamp>.db data/tripplanner.db
cp -r /path/to/backups/uploads-<timestamp> data/uploads
docker compose start
```

## Suggested cron line

Nightly backup at 2am, keeping the same `sqlite3 .backup` approach, writing
into a dated file so old backups aren't overwritten (prune old ones with your
own retention policy):

```cron
0 2 * * * cd /path/to/trip-planner && sqlite3 data/tripplanner.db ".backup /path/to/backups/tripplanner-$(date +\%Y\%m\%d).db" && cp -r data/uploads /path/to/backups/uploads-$(date +\%Y\%m\%d)
```
