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
| `tests/role-matrix.spec.ts` | `authenticated` | Per-role access — see [What role-matrix does to your account](#what-role-matrix-does-to-your-account). |

The `authenticated` project runs when **either**:

- **`infra/e2e/.auth/user.json` exists** — a real Discord login captured with
  `pnpm --filter @watts/e2e auth` (highest fidelity; see
  [step 2](#2-the-authenticated-suite-real-discord-login)); or
- **`DATABASE_URL` points at a local / CI Postgres** — then `global-setup.ts`
  mints a [synthetic session](#synthetic-session-ci--local-without-a-discord-login)
  (a DB-only test fixture, deleted in teardown). This is the CI path.

Otherwise it does not exist, and only the anonymous `chromium` specs run.

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
pnpm --filter @watts/bot check:whois         # = the `smoke` job (@watts/core /whois vs the seeded DB)
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
(anon + `authed` + `role-matrix`) against your dev server:

```powershell
$env:E2E_BASE_URL = "https://localhost:3050"; pnpm --filter @watts/e2e test; $env:E2E_BASE_URL = $null
```

**Expect: 42 passed, 2 fixme** (the two `next dev` quirks above). Your `members`
row is snapshotted before and restored after — see below.

Re-run `pnpm --filter @watts/e2e auth` after the session expires or after a
`pnpm db:reset`.

To exercise the **admin** rows of the matrix as your real self, either set
`DEV_ADMIN_DISCORD_ID` to your Discord id before seeding, or flip
`members.administrator` for your row in Drizzle Studio (`http://127.0.0.1:3055`) —
`role-matrix` will still restore whatever it snapshotted.

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
pnpm --filter @watts/e2e role-restore                  # recover your row after a killed run (see below)
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

## What role-matrix does to your account

**Yes — `role-matrix.spec.ts` temporarily changes the permission level of
whichever user the `authenticated` project is running as, then puts it back.**
That's your **captured Discord user** locally, or the **synthetic user** in CI /
when no session is captured (in which case teardown deletes it wholesale anyway).
Specifically:

1. **`beforeAll` → `snapshot()`** reads that user's current `members` row
   (`administrator`, `officer_status`, `officer_role`) and **every** row in
   `member_permissions` for them, and writes it to
   `infra/e2e/.auth/role-backup.json`.
2. **Each `describe` → `setRole('member' | 'officer' | 'admin', caps[])`** runs
   `UPDATE members SET administrator = …, officer_status = …` and rewrites
   `member_permissions` — the same writes the members-manager UI makes. One
   describe also does `setRole('member', ['scan_attendance'])` to check a lone
   capability grant, and the last test revokes `officer_status` mid-page on
   purpose.
3. **`afterAll` → `restore(original)`** writes `administrator`, `officer_status`,
   `officer_role` **and** the exact `member_permissions` rows back, then deletes
   `role-backup.json`. It's wrapped in `try/finally`; if the restore itself throws
   it prints the recovery command and re-raises.

Guardrails:

- Targets a **local / CI** Postgres only (`DATABASE_URL` host in
  `localhost` / `127.0.0.1` / `::1` / `postgres`) — the same un-bypassable
  allowlist the synthetic session uses. Never a deployed DB.
- The authenticated run is pinned to **`workers: 1`** so nothing else touches the
  DB while roles are toggled.
- If a run is **killed** before `afterAll` (Ctrl-C, crash), `role-backup.json`
  stays on disk — recover with:

  ```bash
  pnpm --filter @watts/e2e role-restore
  ```

- It mutates the **real member row of the account you captured**. If you don't
  want your own account touched, capture a throwaway Discord account instead
  (see step 2).
- Edge case seen once: `officer_role` can also be changed by the app while you're
  clicked-in during a run; `restore()` covers it, but if your `officer_role` looks
  wrong afterward, set it in Drizzle Studio.

---

## CI

The `e2e` job in `.github/workflows/ci.yml` runs on every PR / push to main in the
official Playwright container, against a throwaway `postgres:15`. It builds
`@watts/web`, migrates the schema (no seed), then `pnpm --filter @watts/e2e test`.
Because `DATABASE_URL` is the CI Postgres and there's no `.auth/user.json` (it's
gitignored), `global-setup.ts` mints a
[synthetic session](#synthetic-session-ci--local-without-a-discord-login) and
**both projects run — the full 44** (anon `chromium` + `authenticated`). It
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
- **New gated route** — add it to `auth-gates.spec.ts`'s `gatedRoutes` (anon
  redirect) and a row to `role-matrix.spec.ts`'s `MATRIX` (`R` = renders, `D` =
  redirects to `/dashboard`, per role).
- **Capability check** — a `describe` with `beforeAll(() => setRole('member', ['<cap>']))`.
  Remember `admin/layout.tsx`'s officer-or-admin floor: a bare grant only opens
  `/staff`, not `/admin/*`.
- **A flow** (e.g. résumé upload) — a new `tests/<flow>.spec.ts` in the
  `authenticated` project; drive the UI with `page`, assert the outcome + one
  security check.
- **Conventions** — `waitUntil: 'domcontentloaded'` never `'networkidle'`; assert
  on URL / a visible element, not timing; screenshots `{ fullPage: true,
  animations: 'disabled' }`.
