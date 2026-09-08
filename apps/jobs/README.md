# @watts/jobs

Scheduled / out-of-band work that isn't part of any website. Runs as cron on the VPS
(alongside the Discord bot), **never on Vercel**.

Today this is a holding spot for the one existing job. The node-cron runner + a proper
`@watts/jobs` logic package come with the bot/jobs phase.

## Jobs

### `archive-to-onedrive.mjs`

Nightly: copy new event photos (and optionally résumés) from the live store
(local S3/MinIO or Vercel Blob) into the org OneDrive via `rclone`, write the archive
path back onto each DB row, and drop a per-event `_manifest.json`.

```bash
pnpm --filter @watts/jobs archive
```

**Env** (from the repo-root `./.env` locally; from the cron environment in prod):

| Var | Source | Notes |
| --- | --- | --- |
| `DATABASE_URL` | SHARED | |
| `STORAGE_PROVIDER`, `S3_*` / `BLOB_RW_TOKEN_*` | SHARED / WEBSITE | which live store to read |
| `RCLONE_REMOTE` | CRON JOBS | rclone remote name, default `onedrive` |
| `ARCHIVE_ROOT` | CRON JOBS | path prefix in the remote, default `IEEE-Website` |
| `ARCHIVE_INCLUDE_RESUMES` | CRON JOBS | `"true"` to also archive résumés (PII), default off |

`rclone` must be on `PATH` and configured (`RCLONE_CONFIG` / a secret in CI). Without a
configured remote the job still runs but has nothing to push (`done: 0 photo(s) archived`
against an empty DB). The `event_photos` / `members` archive columns it writes back are
already in migrations `0000–0003`.
