# Deploying `@watts/web` to Vercel

The website is the only workspace that deploys to Vercel. The Discord bot
(`apps/dbot`) and cron jobs (`apps/jobs`) run on a VPS and are covered elsewhere.

There is **no Vercel project for this repo yet** — this is the from-scratch setup.

---

## 1. Create the project

Vercel dashboard → **Add New… → Project → Import Git Repository** → `IEEE-UCF/WATTS`.

## 2. Point it at the monorepo

| Setting | Value | Why |
| --- | --- | --- |
| **Root Directory** | `apps/ieeeucfcom` | The app lives in a subdirectory now. Vercel still clones the whole repo, so `workspace:*` deps and the root `pnpm-lock.yaml` resolve. |
| **Framework Preset** | Next.js | Auto-detected. |
| **Node.js Version** | 22.x | Read from `.nvmrc`; set explicitly if the dashboard doesn't pick it up. |
| **Install Command** | *(default)* | `pnpm install` runs at the repo root — Vercel detects the pnpm workspace from `pnpm-workspace.yaml`. |
| **Build Command** | `pnpm exec turbo run build --filter=@watts/web` | Turbo builds `@watts/web` plus the workspace packages it imports, with caching. Leaving the Next preset (`next build`) also works — it just skips the shared cache. |
| **Output Directory** | *(default)* | `.next` — Vercel handles this. |
| **Ignored Build Step** | `npx turbo-ignore @watts/web` | Skips a build when the commit changed nothing that affects the web app or its deps. Replaces the `ignoreCommand` in `vercel.json` — keep one, not both. |

## 3. Production environment variables

`apps/ieeeucfcom/next.config.ts` calls `getServerEnv()` at load, so the **build
fails loudly** if the server schema (`packages/config/src/env.ts`) isn't satisfied.
Set these in **Settings → Environment Variables** (Production, and Preview if you
want preview deploys to be functional):

| Var | Example / value | Notes |
| --- | --- | --- |
| `APP_ENV` | `production` | Anything other than `local` makes the auth secrets below **required**. |
| `DB_PROVIDER` | `neon` | Selects the Neon serverless driver in `@watts/db`. |
| `DATABASE_URL` | `postgres://…neon.tech/…?sslmode=require` | Neon **pooled** connection string. Required in every environment (schema: `.min(1)`). |
| `NEXTAUTH_URL` | `https://ieeeucf.com` | The deployed origin. Must match the Discord redirect URI below. |
| `NEXTAUTH_SECRET` | *(32+ random bytes)* | `openssl rand -base64 32`. |
| `DISCORD_CLIENT_ID` | `1427029801339846686` | The **website's** OAuth app (distinct from the bot's application id). |
| `DISCORD_CLIENT_SECRET` | *(from the Discord app)* | |
| `STORAGE_PROVIDER` | `vercel` | Selects the `@vercel/blob` adapter in `@watts/storage`. |
| `NEXT_PUBLIC_STORAGE_PROVIDER` | `vercel` | Client-side mirror; used by the browser upload code. |
| `BLOB_READ_WRITE_TOKEN` | *(from Vercel Blob)* | Create a Blob store first (Storage tab); Vercel can inject this automatically once the store is linked. |
| `RESUME_UPLOAD_AUDIENCE` | `admins` \| `officers` \| `members` | Who may upload a résumé. Defaults to `admins`. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | *(raw JSON, base64, or a file path)* | Service-account key for Google Calendar sync. **Optional** — unset ⇒ events save with `sync_status = 'skipped'` and nothing hits Google. Also read by `apps/jobs`. |
| `GOOGLE_CALENDAR_ID` | `ieee.ucf@gmail.com` | Target calendar; must be shared with the service-account email with "Make changes to events". Optional (pairs with the key above). |

Optional S3 vars (`S3_*`) are only for `STORAGE_PROVIDER=local` / self-hosted MinIO —
leave unset on Vercel.

The Discord bot (`apps/dbot`, deployed separately — not Vercel) additionally reads
`DISCORD_EVENT_SYNC_ENABLED` (`true` to mirror "global" events to the guild's
scheduled events) and `DISCORD_EVENT_SYNC_INTERVAL_MINS` (default `15`). Bot-only —
not part of the web build, so not in `turbo.json`.

> **Turborepo strict env mode.** The build runs through `turbo run build`, and
> Turborepo 2.x only forwards environment variables **declared in `turbo.json`**.
> Every var above is listed there (`globalPassThroughEnv` for the secrets,
> `build.env` for the build-shaping ones). If you add a new env var the app reads at
> build time, add it to `turbo.json` too — otherwise `next build` won't see it and
> `getServerEnv()` throws `ZodError`. Vercel's build log prints the full list of vars
> it stripped when this happens.

## 4. Discord OAuth redirect URI

In the **website's** Discord application → OAuth2 → Redirects, add:

```
https://<NEXTAUTH_URL origin>/api/auth/callback/discord
```

e.g. `https://ieeeucf.com/api/auth/callback/discord`. Add the preview/localhost
variants too if you use them (`https://localhost:3050/api/auth/callback/discord`).
Without an exact match, login fails with *"invalid oauth redirect uri"*.

## 5. Database migrations

Vercel does **not** run migrations. They're automated in
**`.github/workflows/deploy.yml`** — on every push to `main`, a `migrate` job runs
`pnpm --filter @watts/db db:migrate`, but it is **held for manual approval** via the
`production` GitHub Environment before it touches the database (Actions run →
"Review deployments").

One-time setup:

1. **Settings → Environments → New environment `production`** → add yourself under
   **Required reviewers**; limit **Deployment branches** to `main`.
2. On that environment, add the secret **`PROD_DATABASE_URL_UNPOOLED`** =
   `DATABASE_URL_UNPOOLED` from this project's Production env vars (the Neon
   integration set it — use the *unpooled* one; pgbouncer can break multi-statement
   migrations).

Vercel's build for the same push runs immediately and does **not** wait for the
approval, so keep migrations expand/contract-safe. For a breaking change, run
`pnpm --filter @watts/db db:migrate` against prod manually **before** merging the
code that needs it, then approve the (now no-op) job.

## 6. First deploy

1. Open the CI PR — Vercel builds a **preview** automatically once the project is
   linked.
2. Check the preview renders `/` and `/auth/signin`, and that a Discord sign-in
   round-trips (needs the preview origin registered per step 4).
3. Merge → the `main` push triggers the production build. Run migrations (step 5)
   against the production database as part of that.

## Reference

- Env schema: `packages/config/src/env.ts`
- Build-time env guard: `apps/ieeeucfcom/next.config.ts` (`getServerEnv()`)
- Security headers: same file (`securityHeaders`)
- Current ignore rule: `apps/ieeeucfcom/vercel.json`
