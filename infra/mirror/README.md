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

## Handing off to the next site admin

Production access belongs to whoever runs the website this year. When that changes, work through this list with the outgoing and incoming admin **together**. Never send tokens or connection strings over Discord, email or chat. The new admin copies them straight from the dashboards below once they have access.

### 1. Give the new admin access

| System | What to grant | What it's for |
| --- | --- | --- |
| **Vercel** (website project) | Team member with access to the project | Deploys, env vars, Blob stores. The Neon `DATABASE_URL_UNPOOLED` and both Blob tokens are read from here. |
| **Neon** (through the Vercel integration) | Access to the project/branch | Point-in-time restore, and resetting the database password |
| **GitHub** (`IEEE-UCF/WATTS`) | Repo admin, **and** a Required reviewer on the `production` environment | Merging, and approving the gated `migrate` job ([DEPLOY.md §5](../../apps/ieeeucfcom/DEPLOY.md)) |
| **Discord developer portal** | Team member on the *website's* OAuth app (and the bot's app, if they run the bot) | Sign-in redirect URIs and client secret |
| **Google Cloud** (only if calendar sync is on) | Access to the service account's project | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| **The website itself** | `administrator` in `/admin/members` | Every admin page, including `/admin/site-content` |

### 2. The new admin sets up backups

1. Create `~/.watts/production.env` (see [One-time setup](#one-time-setup)), copying values from Vercel → Settings → Environment Variables (Production):
   - `DATABASE_URL` = `DATABASE_URL_UNPOOLED` (the host has no `-pooler`)
   - `BLOB_READ_WRITE_TOKEN` = the **private** store's token
   - `BLOB_RW_TOKEN_PUBLIC` (or `PUBLIC_READ_WRITE_TOKEN`) = the **public** store's token
   - `STORAGE_PROVIDER=vercel`
2. Run `pnpm prod:backup`, check that `REPORT.md` looks sane, then run `pnpm mirror:restore` and `pnpm mirror:use`.
3. Keep backing up weekly, and before any risky migration or import.

### 3. The outgoing admin hands back

1. Delete the local backup folder (`~/Desktop/WATTS production backup`) and `~/.watts/production.env`. The backup contains members' personal data and résumés.
2. Revoke their access in each system from the table above. Remove their `administrator` flag if they are no longer an officer.
3. Rotate the secrets they held. Update each new value everywhere it's used, then redeploy.
   - **Neon database password:** update Vercel's `DATABASE_URL*` variables, and the GitHub `production` environment secret `PROD_DATABASE_URL_UNPOOLED`.
   - **Both Blob tokens,** where Vercel allows it: update the Vercel env vars.
   - **`NEXTAUTH_SECRET`:** this signs everyone out.
   - **The Discord client secret.**

### Things worth knowing (as of 2026-09)

- **Blob stores:** production has two. One is **private** (event photos, résumés); the other is **public** (event flyers, website images). Vercel names the public token `PUBLIC_READ_WRITE_TOKEN`, but the site reads `BLOB_RW_TOKEN_PUBLIC`, so keep both set to the same value.
- **Legacy table:** production has an extra `resumes` table from before this repo. It is kept on purpose; don't drop it.
- **Duplicate accounts:** some people have several accounts with the same name (test accounts). When linking officer profiles, pick the account that is actually used.
- **Migrations before merging:** when a PR adds columns to a table the site already reads, run the migration **before** merging. Vercel deploys immediately, while the `migrate` job waits for approval.
