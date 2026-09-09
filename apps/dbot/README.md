# Fritz — IEEE @ UCF Discord Bot

`@watts/bot` (the client class is `Fritz`, f.k.a. Larry) — the discord.js bot,
part of the WATTS monorepo. It shares the website's database via `@watts/db`
(schema is authoritative on the website side), resolves permissions through
`@watts/core` + `@watts/permissions/tier`, and reads the repo-root `./.env` via
`@watts/config`.

<img src="images/larry.gif" alt="Fritz" style="width: 200px; height: 200px; object-fit: cover;" />

## Reference

- **[COMMANDS.md](docs/COMMANDS.md)** — every slash command: what it does, the
  minimum permission level, options, and what it connects to (DB / calendar /
  voice).
- **[SCHEDULED_JOBS.md](docs/SCHEDULED_JOBS.md)** — the recurring / timed work
  (weekly board, reminders, sweeps, voice idle timer) and where the scheduler
  is headed.

Scripts: `pnpm --filter @watts/bot check:whois` validates the shared `/whois`
lookup + prose formatter against the seeded DB (run `pnpm db:reset` first).

## Local development (runs on the host)

From the **repo root**:

1. `pnpm bootstrap` — installs, brings up Postgres/MinIO, migrates, seeds. (One time.)
2. Fill the **DISCORD BOT** section of `./.env` (see `./.env.example`):
   - `DISCORD_TOKEN` — your **own** Discord application's bot token. One token = one
     live gateway connection, so every developer needs a separate app + token.
   - `MAIN_SERVER_ID` — a **private test guild** you own (commands register there
     instantly).
   - `OWNER_ID` — your Discord user id → treated as `ADMINISTRATOR` by the bot.
   - `DEV_ADMIN_DISCORD_ID` — your Discord user id → written onto the seeded dev
     admin so `/whois`, `/info` and the permission ladder resolve *you*. Re-run
     `pnpm db:seed` after setting it.
3. `pnpm dev:bot` (or `pnpm --filter @watts/bot dev`) — `tsx watch`, reloads on save.

Postgres must be up (`pnpm infra:up`); the bot needs no MinIO. `/events` still
runs off the public Google-Calendar ICS feed (`CALENDAR_ICAL_URL`), not the DB.

## Deploying to the VPS (Docker)

Not deployed yet — this is the intended path. The image runs the bot's TypeScript
directly through `tsx` (no compile step) and **must be built from the repo root** so
the pnpm workspace resolves:

```bash
# from the repo root
docker build -f apps/dbot/Dockerfile -t watts-bot .
docker run --rm --env-file .env watts-bot
```

or, on the VPS, via `infra/docker/bot/compose.yml`:

```bash
cd infra/docker/bot
docker compose build
docker compose up -d
docker compose logs -f
```

- **Env** comes from the repo-root `./.env` (same file `@watts/config` reads locally).
  Keep it beside the checkout on the VPS; it is gitignored. Fill the `DISCORD BOT`
  section with the **production** app's `DISCORD_TOKEN` / `MAIN_SERVER_ID` / `OWNER_ID`.
- **`restart: unless-stopped`** + json-file log rotation (10 MB × 5) are set in the
  compose file.
- **Slash-command registration** — the bot currently registers commands to
  `MAIN_SERVER_ID` (a single guild, instant propagation). For a public deployment
  decide between keeping a fixed production guild id or switching to global command
  registration (up to ~1 h propagation, no guild pin). Not changed here.
- The old single-package Dockerfile (context `apps/dbot/`) could not resolve the
  `@watts/*` workspace deps — that is why the build context is now the repo root.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support or questions, contact the IEEE @ UCF Software Committee or open an issue on GitHub.
