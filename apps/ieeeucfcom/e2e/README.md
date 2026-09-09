# E2E smoke suite (`@watts/web`)

Playwright. Verifies the running site renders, gates the right routes, and can
reach its backing services (Postgres, NextAuth/Discord config, the storage
adapter). Not a behaviour-test suite — see `apps/dbot/scripts/README.md` and the
testing notes for the deeper layers (shelved).

## Specs

| File | Checks |
| --- | --- |
| `pages.spec.ts` | Every public page returns < 400, renders `<body>`, no error overlay. Screenshot each → `apps/ieeeucfcom/screenshots/`. |
| `auth-gates.spec.ts` | Anonymous → `/dashboard`, `/settings`, `/admin/*`, `/staff` all redirect to `/auth/signin`. With the seeded `dev-admin-session` cookie → those pages render (local only). |
| `integrations.spec.ts` | `/api/auth/providers` lists Discord · a public tRPC query returns without a 5xx (DB) · `/api/auth/session` responds · a gated file route 401/403s for anon (storage adapter loads). |

## Run it

**Against a local build** (Postgres must be up + seeded):

```bash
pnpm infra:up && pnpm db:reset          # Postgres + schema + seed (incl. dev-admin-session)
pnpm --filter @watts/web e2e            # builds, serves :3000, runs the suite
pnpm --filter @watts/web e2e:ui         # interactive
```

**Against a deployment** (skips the local server + the admin-cookie specs):

```bash
E2E_BASE_URL=https://<deploy>.vercel.app pnpm --filter @watts/web e2e
```

## CI

The `e2e` job in `.github/workflows/ci.yml` runs this on every PR / push to main
with a throwaway `postgres:15`, and uploads `playwright-report/` + `screenshots/`
as the `e2e-report` artifact.
