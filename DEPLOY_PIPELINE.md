# Bot deploy pipeline

`deploy.sh` (repo root) automates what `apps/dbot/README.md`'s
"Deploying to the VPS (Docker)" section describes by hand: pull the latest
code, rebuild the bot's image, restart it, and confirm it actually came up.

## What it does

1. Checks the repo-root `.env` exists (aborts if not — refuses to deploy
   without secrets rather than launching a broken container).
2. `git fetch` + `git reset --hard origin/main`, recording the previous
   commit first.
3. `docker compose -f infra/docker/bot/compose.yml build`
4. `docker compose -f infra/docker/bot/compose.yml up -d --remove-orphans`
5. Waits, then checks the container is actually `running` — if it crashed
   (bad token, bad `DATABASE_URL`, etc.), automatically rolls back to the
   previous commit and rebuilds/restarts on that instead.
6. Prunes old images so disk doesn't fill up over deploys.

Run `./deploy.sh -h` for flags (`--skip-git` for local testing without
pulling, `--env-file`, `--branch`).

## Trigger

`.github/workflows/deploy.yml` runs `deploy.sh` on push to `main`, via a
self-hosted GitHub Actions runner installed directly on the VPS. No SSH keys
or GitHub Secrets are involved — the runner already has local Docker access,
and the script does its own `git pull` against the fixed deploy directory
rather than using `actions/checkout`, so nothing risks wiping the VPS's
untracked `.env` file.

## One-time VPS setup (not automated)

- `git clone` this repo onto the VPS at a fixed path.
- Create `.env` there manually with production secrets (`DISCORD_TOKEN`,
  `MAIN_SERVER_ID`, `DATABASE_URL`, etc. — see `.env.example`).
- Install the self-hosted Actions runner as a systemd service, pointed at
  that same repo path.
- Update the placeholder path in `deploy.yml` to match.

## Known issue (separate from this PR)

`infra/docker/docker-compose.yml` still points at `minio/minio` and
`minio/mc`, both removed from Docker Hub as of September 2026. Local dev
setup (`pnpm bootstrap` / `pnpm infra:up`) fails on a fresh clone until
those are repointed to `quay.io/minio/minio` and `quay.io/minio/mc`. Doesn't
affect the bot's own deploy path (no MinIO dependency there), but worth a
follow-up fix so it doesn't block every future contributor's first setup.
