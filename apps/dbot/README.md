# IEEE @ UCF Discord Bot (f.k.a. Larry)

`@watts/bot` — the discord.js bot, part of the WATTS monorepo. It shares the
website's database via `@watts/db` (schema is authoritative on the website side)
and reads the repo-root `./.env` via `@watts/config`.

<img src="images/larry.gif" alt="Larry" style="width: 200px; height: 200px; object-fit: cover;" />

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support or questions, contact the IEEE @ UCF Software Committee or open an issue on GitHub.
