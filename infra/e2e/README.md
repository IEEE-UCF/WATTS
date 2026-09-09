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
| `tests/authed.spec.ts` | `authenticated` | The gated pages render (no redirect to sign-in) and get screenshotted. `/settings` + `/admin/members` are `test.fixme` (500 under `next dev` — `useSession` + static optimization; fix is `export const dynamic` on those pages). |
| `tests/role-matrix.spec.ts` | `authenticated` | Per-role access — see [What role-matrix does to your account](#what-role-matrix-does-to-your-account). |

The `authenticated` project **only exists** when `infra/e2e/.auth/user.json` is
present **and** `E2E_BASE_URL` is set — so plain `pnpm e2e` and CI never run the
authed specs.

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
pnpm e2e                                      # = the `e2e` job — anonymous browser suite
```

`pnpm e2e` (→ `pnpm --filter @watts/e2e test`) builds `@watts/web`, serves it on
`http://localhost:3000`, and runs the `chromium` project. **Expect: 18 passed.**

Against a deployment instead (anonymous specs only — no captured session for that
origin):

```powershell
$env:E2E_BASE_URL = "https://<deploy>"; pnpm --filter @watts/e2e test; $env:E2E_BASE_URL = $null
```

### 2. The authenticated suite (local only — real Discord, never CI)

No fabricated sessions. You sign in through Discord for real, once; the cookies are
saved and reused until they expire (~10 days).

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
pnpm --filter @watts/e2e exec playwright install chromium   # if "browser not found"
```

### 4. Teardown

```bash
pnpm infra:down    # stop containers, keep data  (infra:reset wipes the volumes)
```

---

## What role-matrix does to your account

**Yes — `role-matrix.spec.ts` temporarily changes the permission level of the
captured Discord user, then puts it back.** Specifically:

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

- Runs **only locally** (needs `.auth/user.json` + `E2E_BASE_URL`) — **never in
  CI**, which has no captured session.
- Targets your **local** Postgres (`DATABASE_URL` → `:3051`), never a deployed DB.
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

The `e2e` job in `.github/workflows/ci.yml` runs the **`chromium` project only**
(no captured session) on every PR / push to main, with a throwaway `postgres:15`.
It builds `@watts/web`, migrates + seeds, `pnpm --filter @watts/e2e test`, and
uploads `infra/e2e/playwright-report/` + `infra/e2e/screenshots/` as the
`e2e-report` artifact.

## Gotchas

| Symptom | Fix |
| --- | --- |
| `'playwright' is not recognized` | `node_modules` pruned by a branch switch — `pnpm install` (or `rm -rf infra/e2e/node_modules && pnpm install`) |
| `TS6053: .next/types/… not found` on `@watts/web typecheck` | stale `.next` — `rm -rf apps/ieeeucfcom/.next` |
| PowerShell `VAR=value cmd` errors | `$env:VAR = "value"` on its own line (or `;` before the command); clear with `$env:VAR = $null` |
| `browser not found` | `pnpm --filter @watts/e2e exec playwright install chromium` |
| `captured session not in the DB` | it expired, or you ran `db:reset` — re-run `pnpm --filter @watts/e2e auth` |

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
