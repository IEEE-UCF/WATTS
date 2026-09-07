# Local infrastructure

A local Postgres (in place of Neon) and MinIO (S3-compatible, in place of Vercel Blob).
Everything is driven from the **repo root** — you never `cd` in here.

| Service | Address | Purpose | Credentials |
| --- | --- | --- | --- |
| `postgres` | `127.0.0.1:5432` | app database (`watts`) | `postgres` / `postgres` |
| `minio` (S3 API) | `127.0.0.1:9000` | media storage | `minioadmin` / `minioadmin` |
| `minio` (console) | `127.0.0.1:9001` | browse objects in a UI | `minioadmin` / `minioadmin` |
| `minio-init` | — | one-shot: creates `media-public` (public) + `resumes-private` | — |

## Commands (from the repo root)

```bash
pnpm bootstrap        # first run: .env, install, infra up, migrate, seed admin
pnpm infra:up         # start postgres + minio
pnpm infra:down       # stop, keep data
pnpm infra:reset      # stop AND wipe the volumes (docker compose down -v)
pnpm db:migrate       # apply drizzle migrations
pnpm db:seed          # (re)create the dev admin user/member/session
pnpm db:reset         # infra:reset + up + migrate + seed  — a clean slate
pnpm db:studio        # drizzle studio on 127.0.0.1:4983
```

## Notes

- **Use `127.0.0.1`, never `localhost`.** On Docker Desktop for Windows `localhost` can
  resolve to IPv6 `::1` while the container publishes IPv4, which hangs `postgres-js` and
  the AWS SDK until timeout. Every URL in `.env.example` already uses `127.0.0.1`, and
  `.env.example` sets `NODE_OPTIONS=--dns-result-order=ipv4first` as a second guard.
- Data is in the named volumes `watts-local_watts-postgres` / `watts-local_watts-minio`.
  `pnpm infra:reset` removes them; `pnpm infra:down` keeps them.
- Ports 5432 / 9000 / 9001 must be free — stop any other local Postgres/MinIO first.
- `psql` shell: `docker compose -f infra/docker/docker-compose.yml exec postgres psql -U postgres -d watts`
