# `@watts/mirror` — production backup + local mirror

For whoever holds production access. It has three jobs:
1. Back up production to your machine: every table, every Blob file, and an inventory report.
2. Restore any backup into a local **mirror** database.
3. Toggle the local app between your dev data and the mirror.

Production is only ever **read**:
- The database is copied inside a `READ ONLY` transaction.
- Storage is only listed and downloaded.

The restore only ever writes to your **local** Postgres and MinIO, and refuses anything else.

## One-time setup

Create `~/.watts/production.env` (on Windows, `C:\Users\<you>\.watts\production.env`). It lives outside the repo, so it can't be committed, and nothing loads it automatically. Copy the values from Vercel → Settings → Environment Variables (Production):

```dotenv
# Neon *unpooled* connection string (DATABASE_URL_UNPOOLED)
DATABASE_URL=postgres://…
STORAGE_PROVIDER=vercel
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_…
# only if production uses a second (public) Blob store:
# BLOB_RW_TOKEN_PUBLIC=vercel_blob_rw_…
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm prod:backup` | Snapshot production into `~/Desktop/WATTS production backup`. Only new or changed files are downloaded. |
| `pnpm mirror:restore` | Build the local database `watts_mirror` from the latest snapshot and copy its files into MinIO. |
| `pnpm mirror:use` | Point the app at the mirror (edits a marked block in `.env.local`). Restart `pnpm dev`. |
| `pnpm mirror:use -- --dev` | Back to your normal dev database. |
| `pnpm mirror:use -- --status` | Which database is active. |
| `pnpm mirror:report` | Re-write the inventory report for the latest snapshot. |

Useful options:
- **`prod:backup`:**
  - `--skip-files`: database only
  - `--skip-private`: leave out résumés and private photos
  - `--dest=…`: back up somewhere else
  - `--source-env=…`: use a different env file
- **`mirror:restore`:**
  - `--from=<snapshot folder>`: an older snapshot, for an "outdated" mirror
  - `--db=<name>`: keep several mirrors side by side
  - `--scrub`: anonymise emails, birthdays, phone numbers and IEEE numbers, and leave résumés out
  - `--skip-files`

## What's in a backup

```
WATTS production backup/
  files/<public|private>/<key>   current copy of every storage object
  files/index.json
  snapshots/<date-time>/
    manifest.json                tables, columns, row counts, migrations, file list
    db/<table>.copy              table data (Postgres COPY text format)
    REPORT.md                    inventory: files by folder, where the DB references them,
                                 missing files, unreferenced files, external links
```

What isn't in it:
- the `sessions` table (live logins)
- the OAuth tokens in `accounts`, which are blanked

Everything else is a faithful copy, **including members' personal data and résumés**, so keep the folder private. It is not a replacement for Neon's point-in-time restore, which remains the disaster-recovery path.

## How the mirror is built

1. It drops and recreates the mirror database, then applies **the current branch's** migrations.
2. It loads each table: rows are staged as text, then inserted with casts. Any row the branch's schema rejects is reported and that table is skipped, rather than half-loaded.
   - Columns production has but the branch doesn't are dropped.
   - Columns the branch adds get their defaults.
   - So restoring on a feature branch shows how production data looks after that branch's migrations.
3. It copies files into local MinIO, and rewrites production Blob URLs to local MinIO URLs.

Sessions aren't copied, so sign in again with Discord. Your Discord account maps to your production user.
