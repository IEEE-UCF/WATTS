# Bot deploy pipeline

`deploy.sh` (repo root) automates what `apps/dbot/README.md`'s
"Deploying to the VPS (Docker)" section describes by hand: pull the latest
code, rebuild the bot's image, restart it, and confirm it actually came up.

## What it does

1. Checks the repo-root `.env` exists (aborts if not — refuses to deploy
   without secrets rather than launching a broken container).
   Then a **disk pre-flight**: if Docker's data disk has under
   `DEPLOY_MIN_FREE_GB` (default 3) free, it runs `docker builder prune -af`
   + `docker image prune -f` and re-checks; still too low → aborts with a
   clear message *before* touching git or the running container.
2. `git fetch` + `git reset --hard origin/main`, recording the previous
   commit first.
3. `docker compose -f infra/docker/bot/compose.yml build`
4. `docker compose -f infra/docker/bot/compose.yml up -d --remove-orphans`
5. Waits, then checks the container is actually `running` — if it crashed
   (bad token, bad `DATABASE_URL`, etc.), automatically rolls back to the
   previous commit and rebuilds/restarts on that instead.
6. Only after a healthy deploy: prunes dangling images and Docker build
   cache older than 7 days (`docker builder prune -af --filter until=168h`),
   then logs free space. Prune failures are logged but don't fail the deploy.

Run `./deploy.sh -h` for flags (`--skip-git` for local testing without
pulling, `--env-file`, `--branch`).

## Trigger

`.github/workflows/deploy-bot.yml` runs `deploy.sh` on push to `main`, via a
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
- Update the path in `deploy-bot.yml` to match (currently `/root/WATTS`).

## Disk space

The VPS root disk is small (42 GB) and shared by Docker and the OS. On
2026-10-29 it hit 100%: `docker system df` showed **17.5 GB of build cache**
(105 entries, none active — `deploy.sh` pruned images but never the build
cache), 6.7 GB of reclaimable images, and 2.5 GB in `/var/log`. The bot's
next container then crash-looped with
`ENOSPC: no space left on device, mkdir '/home/bot/.cache/node/corepack/v1'`.
`docker builder prune -af` freed 18.5 GB (→ 57% used). `deploy.sh` now
prunes build cache on every healthy deploy and pre-flights free space, so
this shouldn't recur from deploys alone.

What else uses space, and how it's bounded:

- **Container logs** — capped per container in `infra/docker/bot/compose.yml`
  (`json-file`, `max-size: 10m` × `max-file: 5` = 50 MB max). Nothing to do.
- **`/var/log`** — mostly the systemd journal (`/var/log/journal`), which by
  default may grow to 10% of the filesystem (~4 GB here). Check and trim:

  ```bash
  journalctl --disk-usage
  du -sh /var/log/* | sort -h
  journalctl --vacuum-size=500M
  ```

  To cap it permanently, set `SystemMaxUse=500M` in
  `/etc/systemd/journald.conf` and `systemctl restart systemd-journald`.
- **`deploy.log`** (repo root) grows by a few KB per deploy; truncate it if
  it ever matters.

Read-only health check from your machine:

```bash
ssh wattsbot 'df -h / && docker system df && du -sh /var/log'
```

If the disk is full right now: `docker builder prune -af` is safe (cache
only — the next build is just slower). `docker image prune -a` also removes
images no container uses, which is fine because rollbacks rebuild from
source. Then redeploy (re-run the workflow, or `./deploy.sh` on the VPS).

## Known issue (separate from this PR)

`infra/docker/docker-compose.yml` still points at `minio/minio` and
`minio/mc`, both removed from Docker Hub as of September 2026. Local dev
setup (`pnpm bootstrap` / `pnpm infra:up`) fails on a fresh clone until
those are repointed to `quay.io/minio/minio` and `quay.io/minio/mc`. Doesn't
affect the bot's own deploy path (no MinIO dependency there), but worth a
follow-up fix so it doesn't block every future contributor's first setup.
