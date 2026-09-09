# Running WATTS locally

Everything runs on your machine — an offline Docker stack stands in for the cloud
(Postgres for Neon, MinIO for Vercel Blob). One repo-root `./.env` feeds every app.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node | 22 (`.nvmrc`) | `nvm use` picks it up |
| pnpm | 11.x | `corepack enable` (the repo pins `pnpm@11.1.2`) |
| Docker Desktop | any current | must be running before `infra:up` |

## First-time setup

```bash
pnpm bootstrap
```

This creates `./.env` from `.env.example` (if missing), runs `pnpm install`, brings
the Docker stack up, then migrates and seeds the database. Then open `./.env` and fill
in the secrets:

- **Website Discord OAuth** — `NEXTAUTH_SECRET` (`openssl rand -base64 32`),
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` from a Discord application. Register
  `https://localhost:3050/api/auth/callback/discord` as a redirect URI on that app or
  login fails with *"invalid oauth redirect uri"*.
- **Discord bot** (`DISCORD BOT` section) — `DISCORD_TOKEN` (your **own** bot app —
  one token = one gateway connection, so every dev needs their own), `MAIN_SERVER_ID`
  (a private test guild you own — commands register there instantly),
  `DISCORD_CLIENT_ID_BOT`, `OWNER_ID` (your Discord user id), `DEV_ADMIN_DISCORD_ID`
  (your id, written onto the seeded dev admin so `/whois` / `/info` resolve you — re-run
  `pnpm db:seed` after setting it).

`DB_PROVIDER=local` and `STORAGE_PROVIDER=local` should already be set for local work.

## Day-to-day

```bash
pnpm infra:up        # start Postgres + MinIO + Drizzle Studio (once per session)

pnpm dev             # website  → https://localhost:3050   (self-signed cert — click through)
pnpm dev:bot         # Discord bot → connects to your test guild, registers slash commands
```

Run `pnpm dev` and `pnpm dev:bot` in **separate terminals**. The website needs Postgres
+ MinIO; the bot needs only Postgres.

### Ports (block 3050–3060)

| Port | Service |
| --- | --- |
| 3050 | website (`next dev`, HTTPS) |
| 3051 | Postgres |
| 3052 | MinIO S3 API |
| 3053 | MinIO web console (`minioadmin` / `minioadmin`) |
| 3054 | Drizzle Studio (drizzle-kit) |
| 3055 | Drizzle Studio redirect — **open [http://127.0.0.1:3055](http://127.0.0.1:3055)** |

Drizzle Studio runs in the Docker stack, always on — no separate `pnpm db:studio` needed.

## Database

```bash
pnpm db:migrate      # apply pending Drizzle migrations
pnpm db:seed         # dev admin + demo fixtures (re-run after changing DEV_ADMIN_DISCORD_ID)
pnpm db:generate     # generate a migration from schema changes (packages/db/src/schema.ts)
pnpm db:reset        # wipe volumes + re-migrate + re-seed  (destroys local data)
```

## Checks (what CI runs)

```bash
pnpm typecheck                       # tsc --noEmit across every workspace  (turbo, cached)
pnpm lint                            # eslint across every workspace         (turbo, cached)
pnpm build                           # next build + bot tsc                  (turbo, cached)
pnpm --filter @watts/bot check:whois # validate the /whois lookup against the seeded DB
pnpm e2e                             # Playwright smoke suite (needs infra up + seeded)
```

`pnpm e2e` builds and serves the web app on :3000 and runs
[`apps/ieeeucfcom/e2e/`](apps/ieeeucfcom/e2e/README.md) — page renders, auth-gate
redirects, and backing-service reachability. Point it at a deployment with
`E2E_BASE_URL=https://… pnpm e2e`.

To exercise the **authenticated** side, log in through Discord for real once and
save the session — no fabricated cookies:

```bash
pnpm dev                                        # https://localhost:3050
pnpm --filter @watts/web e2e:auth               # finish the Discord login in the window
E2E_BASE_URL=https://localhost:3050 pnpm --filter @watts/web e2e
```

`e2e:auth` saves `apps/ieeeucfcom/e2e/.auth/user.json` (gitignored, ~10-day
lifetime). That same captured session is also what you use to click around the
app logged-in — it's a normal browser session, so it just works in your dev
browser until it expires.

Turbo caches by content hash — a second run with nothing changed is `>>> FULL TURBO`.
`pnpm build lint typecheck` mirrors `.github/workflows/ci.yml` exactly.

## Shutting down

```bash
# Ctrl+C the pnpm dev / pnpm dev:bot terminals
pnpm infra:down      # stop containers, KEEP data volumes
pnpm infra:reset     # stop containers, DELETE data volumes (full wipe)
```

## Notes

- `pnpm dev:bot` runs `tsx watch` and expects a real terminal; don't background it
  through a wrapper or its output buffers.
- The self-signed cert on `:3050` is expected (`--experimental-https`); accept it once
  per browser.
- `./.env` and `apps/dbot/.env` are gitignored — never commit them.
- Deploying the website: see [`apps/ieeeucfcom/DEPLOY.md`](apps/ieeeucfcom/DEPLOY.md).
- Deploying the bot: see [`apps/dbot/README.md`](apps/dbot/README.md#deploying-to-the-vps-docker).

## Contributing

Branch / commit / PR conventions, and the gated production-migration flow, are in
[`CONTRIBUTING.md`](CONTRIBUTING.md).
