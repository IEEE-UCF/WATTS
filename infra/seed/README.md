# @watts/seed

Local database seeding. Driven from the repo root — `pnpm db:seed` (and `pnpm db:reset`
runs it as the last step). The Postgres / MinIO containers live in `infra/docker/`.

## What it does

`pnpm db:seed` = **dev admin + all domain fixtures** (idempotent). Flags:

| Command | Result |
| --- | --- |
| `pnpm db:seed` | admin + every fixture file |
| `pnpm db:seed -- --admin-only` | just the admin |
| `pnpm db:seed -- --fixtures=members,events` | admin + only those files |
| `pnpm db:seed -- --wipe` | DROP every table in `public` (then `pnpm db:migrate`) |
| `pnpm db:seed -- postgres://…/db` | target a specific database |

### Dev admin

Upserts a **working admin** so you can sign in locally with no Discord and no manual SQL:

| Table | Row |
| --- | --- |
| `users` | `DEV_ADMIN_EMAIL` (default `admin@watts.local`), `discord_id = dev-admin` |
| `accounts` | a `discord` provider row linked to that user |
| `members` | linked, `administrator = true`, `officer_status = true`, `Executive Chair` |
| `sessions` | `session_token = dev-admin-session`, ~100y expiry |

Then `/api/dev/login` (enabled by `ALLOW_DEV_LOGIN=true` in `./.env`) plants that session
cookie and drops you on `/dashboard`.

`DATABASE_URL` comes from the repo-root `./.env` (via `@watts/config`) unless a URL is
passed as an argument.

## Fixtures — `fixtures/*.json`

Nine files loaded in FK order (`members → sponsorships → projects → committees →
committee_members → project_members → events → event_attendees → member_permissions`).
Keys are the **Drizzle property names** (camelCase) and rows are inserted through the
`schema` table objects with `onConflictDoNothing`, so:

- a schema change surfaces as an insert error here, not a silent drift;
- re-running is safe (fixed `id`s, conflict = skip);
- rows cross-reference each other by those `id`s.

Current set (~small, enough to exercise every list page): 3 members (1 admin + 1 officer +
1 plain), 2 committees with 3 memberships, 2 projects with leads, 2 sponsors, 2 upcoming
events with 4 check-ins, 1 delegated `scan_attendance` grant. Validated against migrations
`0000–0003` (`drizzle-kit check` passes → `schema.ts` = migrations = DB) and against a
live `pnpm db:reset` (all pages render the data, 0 errors).

Long term (with `@watts/db`): generate fixtures from the schema (a factory / seeded faker)
instead of hand-maintaining JSON.

## Notes

- Schema is imported from the website via its `@watts/web/schema` export. When the schema
  moves to `@watts/db`, switch the import in `src/seed.ts` and drop the export.
- Browse the result: `pnpm db:studio`, or the always-on studio at
  `https://local.drizzle.studio/?host=127.0.0.1&port=4983`.
