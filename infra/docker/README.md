# Local infrastructure

A local Postgres (in place of Neon) and MinIO (S3-compatible, in place of Vercel Blob).
Everything is driven from the **repo root** — you never `cd` in here.

All host ports live in one block, **3050–3060**. Container-internal ports stay at
image defaults — only the published (host) side is renumbered.

| Service | Address | Purpose | Credentials |
| --- | --- | --- | --- |
| web dev server | `https://localhost:3050` | `pnpm dev` (not a container) | — |
| `postgres` | `127.0.0.1:3051` | app database (`watts`) | `postgres` / `postgres` |
| `minio` (S3 API) | `127.0.0.1:3052` | media storage | `minioadmin` / `minioadmin` |
| `minio` (console) | `127.0.0.1:3053` | browse objects in a UI | `minioadmin` / `minioadmin` |
| `drizzle-studio` | `127.0.0.1:3054` | schema + data browser (always on) | — |
| `drizzle-studio` (redirect) | `127.0.0.1:3055` | one-hop link to the hosted Studio UI | — |
| `minio-init` | — | one-shot bucket setup — profile `setup`, run-and-removed by `pnpm infra:up`, never lingers | — |

`3056–3060` are reserved (bot health/metrics, `apps/jobs`, spare).

## Drizzle Studio

Up with the stack (`pnpm infra:up`) — no separate terminal. Open:

**http://127.0.0.1:3055**

That port is a tiny redirector baked into the container ([`drizzle-studio/redirect.mjs`](drizzle-studio/redirect.mjs))
— it 302s to `https://local.drizzle.studio/?host=127.0.0.1&port=3054`, the hosted UI
already pointed at this stack. (The raw URL still works if you prefer it.)

The UI is hosted by Drizzle and connects back to the local `:3054` container. First
visit, if it says "Connecting…" forever: recent Chrome blocks page → localhost calls —
click the site-info icon in the address bar and enable **Local network access** (Brave:
drop Shields; Safari: needs an mkcert cert — see Drizzle's docs). This is Drizzle
Studio's normal local behaviour, not specific to the container.

The schema comes from a read-only bind mount of `packages/db/src/` — edit `schema.ts`,
then `docker compose -f infra/docker/docker-compose.yml restart drizzle-studio` (or
`pnpm infra:up` again) to pick it up. `pnpm db:studio` runs it as a foreground process
instead, also on `:3054` — stop the container first so they don't clash.

## Commands (from the repo root)

```bash
pnpm bootstrap        # first run: .env, install, infra up, migrate, seed admin
pnpm infra:up         # start postgres + minio + drizzle-studio, wait, create buckets
pnpm infra:down       # stop, keep data
pnpm infra:reset      # stop AND wipe the volumes (docker compose down -v)
pnpm db:migrate       # apply drizzle migrations
pnpm db:seed          # (re)create the dev admin user/member/session
pnpm db:reset         # infra:reset + up + migrate + seed  — a clean slate
pnpm db:studio        # drizzle studio as a foreground process on :3054 (stop the container first)
```

`docker compose ps` shows only the three long-running services — the bucket setup
(`minio-init`) runs and is removed each `pnpm infra:up`.

## Notes

- **Use `127.0.0.1`, never `localhost`.** On Docker Desktop for Windows `localhost` can
  resolve to IPv6 `::1` while the container publishes IPv4, which hangs `postgres-js` and
  the AWS SDK until timeout. Every URL in `.env.example` already uses `127.0.0.1`, and
  `.env.example` sets `NODE_OPTIONS=--dns-result-order=ipv4first` as a second guard.
- Data is in the named volumes `watts-local_watts-postgres` / `watts-local_watts-minio`.
  `pnpm infra:reset` removes them; `pnpm infra:down` keeps them.
- Ports 3050–3055 must be free — stop anything else on that range first.
- `psql` shell: `docker compose -f infra/docker/docker-compose.yml exec postgres psql -U postgres -d watts`
