# @watts/seed

Local database seeding. Driven from the repo root — `pnpm db:seed` (and `pnpm db:reset`
runs it as the last step). The Postgres / MinIO containers live in `infra/docker/`.

## What it does

`src/seed.ts` upserts a **working admin** so you can sign in locally with no Discord and
no manual SQL:

| Table | Row |
| --- | --- |
| `users` | `DEV_ADMIN_EMAIL` (default `admin@watts.local`), `discord_id = dev-admin` |
| `accounts` | a `discord` provider row linked to that user |
| `members` | linked, `administrator = true`, `officer_status = true`, `Executive Chair` |
| `sessions` | `session_token = dev-admin-session`, ~100y expiry |

Then `/api/dev/login` (enabled by `ALLOW_DEV_LOGIN=true` in `./.env`) plants that session
cookie and drops you on `/dashboard`.

## Usage

```bash
pnpm db:seed                       # upsert the dev admin (idempotent)
pnpm db:seed -- --wipe             # DROP every table in public, then re-run pnpm db:migrate
pnpm db:seed -- postgres://…/db    # target a specific database
```

`DATABASE_URL` comes from the repo-root `./.env` (via `@watts/config`) unless a URL is
passed as an argument.

## Fixtures — `fixtures/*.json`

Historical domain fixtures (committees, events, projects, sponsorships, …). **They are
stale and not currently loaded** by `seed.ts` — kept as reference. `members.json` still
has an `email` column, `events.json` uses `host_type`, etc. De-staling them and wiring a
`--fixtures` mode back in is part of the `@watts/db` extraction.

## Notes

- Schema is imported from the website via its `@watts/web/schema` export. When the schema
  moves to `@watts/db`, switch the import in `src/seed.ts` and drop the export.
- Browse the result: `pnpm db:studio`, or the always-on studio at
  `https://local.drizzle.studio/?host=127.0.0.1&port=4983`.
