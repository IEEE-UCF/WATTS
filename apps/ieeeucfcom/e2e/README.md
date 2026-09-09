# E2E smoke suite (`@watts/web`)

Playwright. Verifies the running site renders, gates the right routes, and can
reach its backing services (Postgres, NextAuth/Discord config, the storage
adapter). Not a behaviour-test suite — see `apps/dbot/scripts/README.md` and the
testing notes for the deeper layers (shelved).

## Specs

| File | Project | Checks |
| --- | --- | --- |
| `pages.spec.ts` | `chromium` | Every public page returns < 400, renders `<body>`, no error overlay. Screenshot each → `apps/ieeeucfcom/screenshots/`. |
| `auth-gates.spec.ts` | `chromium` | Anonymous → `/dashboard`, `/settings`, `/admin/*`, `/staff` all redirect to `/auth/signin`. |
| `integrations.spec.ts` | `chromium` | `/api/auth/providers` lists Discord · a public tRPC query returns without a 5xx (DB) · `/api/auth/session` responds · a gated file route 401/403s for anon (storage adapter loads). |
| `authed.spec.ts` | `authenticated` | The gated pages render (no redirect) and get screenshotted. Runs **only** with a real captured session — see below. |
| `role-matrix.spec.ts` | `authenticated` | Per-role access: toggles the captured user's real `members` row (`e2e/lib/role.ts`) through member / officer / admin (+ a lone staff-capability grant) and asserts each gated route **renders or redirects to `/dashboard`** as expected. Also pins the "role revoked while idle on `/staff`" gap. Serial; snapshots + restores your row. |

> **role-matrix mutates your real member row.** It snapshots (`administrator`,
> `officer_status`, `officer_role`, permissions) to `e2e/.auth/role-backup.json`
> first and restores in `afterAll`. If a run is killed mid-flight:
> `pnpm --filter @watts/web e2e:role-restore`. The authenticated run also forces
> `workers: 1` so nothing else hits the DB while roles are being toggled.

## Run the anonymous suite

Local build (Postgres must be up + migrated + seeded):

```bash
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @watts/web e2e            # builds, serves :3000, runs chromium project
pnpm --filter @watts/web e2e:ui         # interactive
```

Against a deployment:

```bash
E2E_BASE_URL=https://<deploy>.vercel.app pnpm --filter @watts/web e2e
```

## Run the authenticated suite (`authed.spec.ts`)

No fabricated sessions — you log in through Discord for real, once, and the
resulting cookies are saved for reuse until they expire (~10 days).

```bash
pnpm dev                                        # dev server, https://localhost:3050
pnpm --filter @watts/web e2e:auth               # opens a window — finish the Discord login
E2E_BASE_URL=https://localhost:3050 pnpm --filter @watts/web e2e
```

`e2e:auth` writes `e2e/.auth/user.json` (gitignored). The `authenticated`
Playwright project exists only when that file is present **and** `E2E_BASE_URL` is
set — so plain `pnpm e2e` and CI never touch it. Re-run `e2e:auth` after the
session expires or after `pnpm db:reset`.

To land as an admin: set `DEV_ADMIN_DISCORD_ID` to your Discord id before seeding,
or register on first login and flip `members.administrator` in Drizzle Studio
(`http://127.0.0.1:3055`).

## CI

The `e2e` job in `.github/workflows/ci.yml` runs the `chromium` project only (no
captured session) on every PR / push to main with a throwaway `postgres:15`, and
uploads `playwright-report/` + `screenshots/` as the `e2e-report` artifact.
