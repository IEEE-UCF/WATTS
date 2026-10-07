# `@watts/e2e` — Playwright smoke suite for the WATTS website

Dev/validation tooling, not shipped. Verifies the running site **renders**, **gates
the right routes**, and **can reach its backing services** (Postgres, NextAuth /
Discord config, the storage adapter). It is a *smoke* suite — "does it render /
redirect / connect", not deep behaviour. Logic-level tests are a separate (shelved)
Vitest effort.

Lives in `infra/e2e/` beside `infra/seed` because it supports development, not the
product.

## Specs

| File | Playwright project | Checks |
| --- | --- | --- |
| `tests/pages.spec.ts` | `chromium` | Every public page returns `< 400`, renders `<body>`, no error overlay. Screenshots each → `infra/e2e/screenshots/`. |
| `tests/auth-gates.spec.ts` | `chromium` | Anonymous → `/dashboard`, `/settings`, `/admin/*`, `/staff` all redirect to `/auth/signin`. |
| `tests/integrations.spec.ts` | `chromium` | `/api/auth/providers` lists Discord · a public tRPC query returns without a 5xx (DB reachable) · `/api/auth/session` responds · a gated file route 401/403s for anon (storage adapter loads). |
| `tests/authed.spec.ts` | `authenticated` | The gated pages render (no redirect to sign-in) and get screenshotted. `/settings` + `/admin/members` are skipped (`test.fixme`) **only against a `next dev` target** (`E2E_BASE_URL=…:3050`), where `useSession` + static optimization 500s; they run against `next start` (CI + the default local run). Fix is `export const dynamic` on those pages. |
| `tests/perm-pages.spec.ts` | `permissions` | Every gated page × every [persona](#the-permission-suite) → renders / 404 / `/dashboard` / sign-in, exactly as `lib/access-matrix.ts` says. |
| `tests/perm-trpc.spec.ts` | `permissions` | Every tRPC procedure × every persona → allowed / 403 / 401 (side-effect free probe). |
| `tests/perm-routes.spec.ts` | `permissions` | The file + upload routes × every persona. |
| `tests/perm-scoped.spec.ts` | `permissions` | Per-record rules: chair / lead / page editor scope, cross-project join requests, own short links, officer delegation, revocation. |

The `authenticated` project runs when **either**:

- **`infra/e2e/.auth/user.json` exists** — a real Discord login captured with
  `pnpm --filter @watts/e2e auth` (highest fidelity; see
  [step 2](#2-the-authenticated-suite-real-discord-login)); or
- **`DATABASE_URL` points at a local / CI Postgres** — then `global-setup.ts`
  mints a [synthetic session](#synthetic-session-ci--local-without-a-discord-login)
  (a DB-only test fixture, deleted in teardown). This is the CI path.

Otherwise it does not exist, and only the anonymous `chromium` specs run.

The `permissions` project runs whenever `DATABASE_URL` points at a local / CI
Postgres (it brings its own synthetic personas — see
[The permission suite](#the-permission-suite)).

---

## Local validation walkthrough

### 0. Prereqs (once per work session)

```bash
pnpm infra:up      # Postgres :3051 · MinIO :3052/:3053 · Drizzle Studio -> http://127.0.0.1:3055
pnpm db:migrate
pnpm db:seed        # idempotent
```

> Do **not** `pnpm db:reset` if you want to keep a captured Discord login — it
> drops the `sessions` row. Use `db:migrate && db:seed`.

### 1. The three checks CI runs

```bash
pnpm exec turbo run typecheck lint build     # = the `verify` job
```

```bash
pnpm --filter @watts/e2e matrix:check        # = `verify`: every procedure/page/route classified, docs/PERMISSIONS.md current
```

```bash
pnpm --filter @watts/bot check:whois         # = the `smoke` job (@watts/core /whois vs the seeded DB)
```

```bash
pnpm --filter @watts/bot check:tier          # = `smoke`: bot permission tiers + the command/button gate
```

```bash
pnpm e2e                                      # = the `e2e` job
```

`pnpm e2e` (→ `pnpm --filter @watts/e2e test`) builds `@watts/web`, serves it on
`http://localhost:3000`, and runs Playwright. With **infra up** (step 0) it runs
the full suite — the `chromium` anon specs **and** the `authenticated` project
against a [synthetic session](#synthetic-session-ci--local-without-a-discord-login),
exactly as CI does. **Expect: 44 passed.** With no local DB reachable it runs the
anon specs only (**18 passed**).

Against a deployment instead (anonymous specs only — no session for that origin):

```powershell
$env:E2E_BASE_URL = "https://<deploy>"; pnpm --filter @watts/e2e test; $env:E2E_BASE_URL = $null
```

### 2. The authenticated suite (real Discord login)

The synthetic session (step 1) covers routing and the role matrix, but it does
**not** exercise Discord OAuth. To validate the real login end-to-end, sign in
through Discord once; the cookies are saved and reused until they expire (~10
days). A captured `.auth/user.json` takes precedence over the synthetic session.

**Terminal 1** — the dev server:

```bash
pnpm dev           # https://localhost:3050 (self-signed cert — accept it)
```

**Terminal 2** — capture the login (a browser window opens; finish the Discord
sign-in and it closes itself):

```bash
pnpm --filter @watts/e2e auth
```

That writes `infra/e2e/.auth/user.json` (gitignored). Then run the full suite
(anon + `authed` + `permissions`) against your dev server:

```powershell
$env:E2E_BASE_URL = "https://localhost:3050"; pnpm --filter @watts/e2e test; $env:E2E_BASE_URL = $null
```

Expect everything green except the two `next dev` `fixme`s above. Nothing in the
suite changes your own `members` row.

Re-run `pnpm --filter @watts/e2e auth` after the session expires or after a
`pnpm db:reset`.

### Synthetic session (CI / local without a Discord login)

When there is no captured `.auth/user.json` but `DATABASE_URL` points at a local /
CI Postgres, `global-setup.ts` mints a **synthetic session** so the `authenticated`
project can run. This is what lets CI report the full 44-test result on every PR
without a real Discord account.

What it is (`lib/session.ts`):

- One dedicated user — `e2e-synthetic@watts.local`, `discord_id` `e2e-synthetic` —
  with `users` + `accounts` (`provider = discord`) + an admin/officer `members`
  row + a `sessions` row (random token, 7-day expiry).
- `global-setup.ts` writes that session cookie to `.auth/user.json` and drops a
  `.auth/.synthetic` marker. `global-teardown.ts` sees the marker and **deletes
  the whole synthetic identity** + both files. A captured real session (no marker)
  is never touched.
- It is **not** seed data and **not** a login bypass in the app — nothing reads
  these rows except NextAuth resolving the cookie, exactly as it would a real one.

Hard guards:

- **Host allowlist, no override.** `dbHostAllowed()` only returns true for
  `localhost` / `127.0.0.1` / `::1` / `postgres`. Against any other `DATABASE_URL`
  host, `global-setup` skips (authed specs don't run) and `lib/session.ts` throws
  if called anyway. It cannot reach a remote / production database.
- Idempotent: every mint deletes a prior synthetic identity first, so a crashed
  run self-heals on the next start.
- If a run is killed between setup and teardown, clean it up with:

  ```bash
  pnpm --filter @watts/e2e session-clean
  ```

**Deferred — validate the Discord OAuth path in CI.** The synthetic session skips
the OAuth callback, the drizzle-adapter row creation, cookie issuance, and the
"logged in but not a member → `/auth/register`" branch. Closing that gap needs a
dummy Discord account (with bot-login protections handled) or a mock OIDC provider
wired into the CI run. Tracked here until then; locally, step 2 covers it.

### 3. Utility

```bash
pnpm --filter @watts/e2e test:ui                       # interactive runner
```

```bash
pnpm --filter @watts/e2e exec playwright show-report   # open the last HTML report
```

```bash
pnpm --filter @watts/e2e session-clean                 # remove a leftover synthetic session after a killed run
```

```bash
pnpm --filter @watts/e2e exec playwright install chromium   # if "browser not found"
```

### 4. Teardown

```bash
pnpm infra:down    # stop containers, keep data  (infra:reset wipes the volumes)
```

---

## The permission suite

`lib/access-matrix.ts` is **the** permission matrix: every tRPC procedure, page and
HTTP route with its gate, written as a spec of who *should* get in. The
`permissions` project proves the running app agrees, and `scripts/matrix.mts`
renders it to [`docs/PERMISSIONS.md`](../../docs/PERMISSIONS.md).

**Personas** (`lib/personas.ts`) — one dedicated synthetic identity per kind of
access: anonymous, signed-in-but-unregistered, plain member, a member holding each
capability (plus expired / inactive / committee-scoped grants), committee chair (via
`is_chair` and via `chair_id`), project lead, page editor, officer, officer chairing
a committee, exec officer, admin. `global-setup.ts` creates them all
(`lib/persona-db.ts`: `e2e-perm-<key>@watts.local`, each with its own session
cookie in `.auth/perm-<key>.json`) plus fixtures — committees A/B, projects A/B, a
pending join request on each, two short links, an event with a members-only photo.
Teardown deletes all of it. Same local / CI-only host allowlist as the synthetic
session; nothing touches a real member row.

**How the probes stay side-effect free:**

- **tRPC** — each procedure that takes input is sent a bare string no schema
  accepts. Gates run before input parsing, so a denied persona gets 401/403 and an
  allowed one gets 400 — the procedure body never runs. Queries without input are
  just reads; mutations without input are only probed where a denial is expected.
- **Pages** — plain HTTP GETs with redirects not followed, so the test sees exactly
  what middleware or the server guard decided.
- **Routes** — inputs chosen so an allowed caller stops at validation or a missing
  file (e.g. résumé export `?gy=1900` → 404, uploads with an unsupported type → 400).

`perm-scoped.spec.ts` is the exception: it makes real calls on the fixtures to
prove per-record rules (only its own `grant_target` / `revoke_officer` personas
change mid-run).

**Coverage guard.** `pnpm --filter @watts/e2e matrix:check` (CI `verify`) fails if a
procedure, `page.tsx` or `route.ts` exists that the matrix doesn't classify, if the
persona capability lists drift from `@watts/permissions`, or if
`docs/PERMISSIONS.md` is stale (`matrix:doc` rewrites it).

**Who has what in real data** is a separate, read-only tool: `pnpm perm:audit`
(run it against the prod mirror — see `docs/PERMISSIONS.md`).

---

## CI

The `e2e` job in `.github/workflows/ci.yml` runs on every PR / push to main in the
official Playwright container, against a throwaway `postgres:15`. It builds
`@watts/web`, migrates the schema (no seed), then `pnpm --filter @watts/e2e test`.
Because `DATABASE_URL` is the CI Postgres and there's no `.auth/user.json` (it's
gitignored), `global-setup.ts` mints a
[synthetic session](#synthetic-session-ci--local-without-a-discord-login) plus the
permission personas, and **all three projects run** (anon `chromium`,
`authenticated`, `permissions`). It
uploads `infra/e2e/playwright-report/` + `infra/e2e/screenshots/` as the
`e2e-report` artifact.

It does **not** validate the Discord OAuth login — see the deferred note above.

## Gotchas

| Symptom | Fix |
| --- | --- |
| `'playwright' is not recognized` | `node_modules` pruned by a branch switch — `pnpm install` (or `rm -rf infra/e2e/node_modules && pnpm install`) |
| `TS6053: .next/types/… not found` on `@watts/web typecheck` | stale `.next` — `rm -rf apps/ieeeucfcom/.next` |
| PowerShell `VAR=value cmd` errors | `$env:VAR = "value"` on its own line (or `;` before the command); clear with `$env:VAR = $null` |
| `browser not found` | `pnpm --filter @watts/e2e exec playwright install chromium` |
| `captured session not in the DB` | your `.auth/user.json` is stale (expired, or `db:reset` since capture). Re-run `pnpm --filter @watts/e2e auth`, **or** delete `.auth/user.json` to fall back to a fresh synthetic session |
| authed specs skipped / "DATABASE_URL is not local" | infra isn't up, or `DATABASE_URL` points off-box — `pnpm infra:up && pnpm db:migrate` |
| leftover synthetic user after a killed run | `pnpm --filter @watts/e2e session-clean` |

## Extending the suite

- **New public page** — one entry in `tests/pages.spec.ts`'s `publicPages`.
- **New gated page, route or tRPC procedure** — classify it in
  `lib/access-matrix.ts` (CI's `matrix:check` fails until you do), then
  `pnpm --filter @watts/e2e matrix:doc`. The `permissions` project picks it up for
  every persona automatically. Add the anon redirect to `auth-gates.spec.ts` too if
  it's a page.
- **New kind of access** (a new capability, role or per-record rule) — add a
  persona to `lib/personas.ts` (and its rows in `lib/persona-db.ts` if it needs
  links), update the policy functions in `lib/access-matrix.ts`, and add a
  `perm-scoped.spec.ts` case for any per-record rule.
- **A flow** (e.g. résumé upload) — a new `tests/<flow>.spec.ts` in the
  `authenticated` project; drive the UI with `page`, assert the outcome + one
  security check.
- **Conventions** — `waitUntil: 'domcontentloaded'` never `'networkidle'`; assert
  on URL / a visible element, not timing; screenshots `{ fullPage: true,
  animations: 'disabled' }`.
