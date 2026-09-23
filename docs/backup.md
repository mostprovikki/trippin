# Backup & Restore

The app has no bundled database or file store — both live in whatever
Postgres and object storage `.env` points at. What "backup" means depends on
which environment you're in.

## Dev / test — nothing to back up

Local Postgres (`npm run db:up`, via `scripts/pg-dev.mjs`) is a throwaway
cluster in `.pgdata/` (git-ignored) on `127.0.0.1:43105`. It's recreated from
scratch on demand and tests create/drop their own schemas — there is nothing
in it worth preserving. Uploaded documents in dev land on local disk under
`UPLOADS_DIR` (default `./data/uploads`, `server/src/storage/local.js`); if
you want to keep local test uploads, just copy that directory, but it isn't
part of any backup process.

## Production — database (Neon Postgres)

Production's `DATABASE_URL` points at Neon. Backup/restore there is Neon's
job, not ours:

- Neon keeps continuous point-in-time restore (PITR) automatically — see
  [Neon's backup & restore docs](https://neon.tech/docs/manage/backups) for
  the current retention window and how to restore to a point in time from the
  console.
- For an out-of-band snapshot (e.g. before a risky migration), a plain
  `pg_dump "$DATABASE_URL" > backup.sql` against the Neon connection string
  works like any other Postgres — this repo has no wrapper script for it and
  the procedure is untested here; treat it as a starting point, not a
  verified runbook.

## Production — uploaded documents (Zoho Stratus)

When `STORAGE_DRIVER=stratus` (see `server/src/storage/stratus.js`), uploaded
files go straight to a Zoho Catalyst Stratus bucket (`STRATUS_BUCKET`, default
`tripper`) — the app never keeps a local copy, so the bucket *is* the source
of truth. Backing it up means whatever Stratus/Catalyst offers for bucket
export or versioning; this repo doesn't script anything for it and that
hasn't been investigated — check Catalyst's own docs before relying on
anything here.

## What this doesn't cover

There is no combined "one command backs up everything" story across Neon +
Stratus — they're backed up (or not) independently, on their own schedules,
by their own tooling. If you need a coordinated snapshot of both, you'd have
to script `pg_dump` + a Stratus export yourself and keep them at the same
point in time; nothing in this repo does that today.
