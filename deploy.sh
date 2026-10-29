#!/usr/bin/env bash
# deploy.sh — CLI deploy tool for the WATTS Discord bot ("Fritz").
#
# Lives at the WATTS repo root. It MUST live there (not in apps/dbot, not in
# infra/docker/bot) because the bot's Docker build has to run with the repo
# root as build context so the pnpm workspace (@watts/* packages) resolves —
# see apps/dbot/README.md, "Deploying to the VPS (Docker)".
#
# Usage:
#   ./deploy.sh                          # normal deploy: git pull + build + run + health check
#   ./deploy.sh --skip-git               # skip git pull (for local testing on code already on disk)
#   ./deploy.sh --env-file path/to/.env  # override env file (default: ./.env at repo root)
#   ./deploy.sh --branch some-branch     # deploy a branch other than main
#   ./deploy.sh -h                       # show this help
#
# Disk: before building, it checks free space on Docker's data disk. Below
# DEPLOY_MIN_FREE_GB (default 3) it prunes the build cache; if that still
# isn't enough it aborts, leaving the running bot untouched. After a healthy
# deploy it prunes dangling images and build cache older than 7 days.

set -euo pipefail

# ---- The script finds its own location, so it works from any checkout on any machine ----
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_ROOT/.env"
COMPOSE_FILE="$REPO_ROOT/infra/docker/bot/compose.yml"
BRANCH="main"
LOG_FILE="$REPO_ROOT/deploy.log"
SKIP_GIT=false
MIN_FREE_GB="${DEPLOY_MIN_FREE_GB:-3}"

# ---- Parse CLI flags ----
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-git) SKIP_GIT=true; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    -h|--help)
      # Print only the header comment block (stops at the first non-comment line)
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

COMPOSE="docker compose -f $COMPOSE_FILE"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG_FILE"
}

# Free space (KB) on the filesystem holding Docker's data — images, build
# cache and container layers all live there. Falls back to / if docker info
# can't say (on the VPS they're the same disk anyway).
DOCKER_ROOT=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /)
[ -d "$DOCKER_ROOT" ] || DOCKER_ROOT=/
free_kb() {
  df -Pk "$DOCKER_ROOT" | awk 'NR==2{print $4}'
}
fmt_gb() {
  awk -v kb="$1" 'BEGIN{printf "%.1f GB", kb/1048576}'
}

cd "$REPO_ROOT"
log "==== Deploy started (repo root: $REPO_ROOT, skip-git: $SKIP_GIT) ===="

# 1. Sanity checks — fail fast and clearly instead of building something broken
if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: env file not found at $ENV_FILE — aborting deploy"
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  log "ERROR: compose file not found at $COMPOSE_FILE"
  log "       (expected infra/docker/bot/compose.yml relative to repo root)"
  exit 1
fi

# Disk pre-flight. A full disk doesn't just fail the build — it can let the
# build squeak through and then crash-loop the new container (ENOSPC on its
# first write, e.g. corepack's cache). Docker's build cache is the usual
# culprit (17 GB once), so clear it first; only abort if that isn't enough.
# Runs before git/build, so aborting leaves the current bot running as-is.
MIN_FREE_KB=$((MIN_FREE_GB * 1024 * 1024))
FREE_KB=$(free_kb)
log "Disk: $(fmt_gb "$FREE_KB") free on $DOCKER_ROOT (need ${MIN_FREE_GB} GB)"
if [ "$FREE_KB" -lt "$MIN_FREE_KB" ]; then
  log "WARNING: low disk space — pruning all Docker build cache and dangling images"
  docker builder prune -af >> "$LOG_FILE" 2>&1 || log "WARNING: docker builder prune failed"
  docker image prune -f >> "$LOG_FILE" 2>&1 || log "WARNING: docker image prune failed"
  FREE_KB=$(free_kb)
  log "Disk after prune: $(fmt_gb "$FREE_KB") free"
  if [ "$FREE_KB" -lt "$MIN_FREE_KB" ]; then
    log "ERROR: still under ${MIN_FREE_GB} GB free on $DOCKER_ROOT — aborting deploy (bot left as-is)"
    log "       Investigate with: df -h; docker system df; du -sh /var/log/* | sort -h"
    log "       Common fixes: journalctl --vacuum-size=500M; docker image prune -a (see DEPLOY_PIPELINE.md)"
    exit 1
  fi
fi

# 2. Sync to latest commit on the target branch (skip this for local iteration)
PREV_SHA=""
if [ "$SKIP_GIT" = false ]; then
  log "Fetching origin/$BRANCH"
  git fetch origin "$BRANCH"
  PREV_SHA=$(git rev-parse HEAD)
  git reset --hard "origin/$BRANCH"
  NEW_SHA=$(git rev-parse HEAD)
  log "Updated $PREV_SHA -> $NEW_SHA"
else
  log "Skipping git pull (--skip-git set) — building whatever is on disk right now"
fi

# 3. Build and launch — must run with repo root as build context (see header note)
log "Building bot image"
$COMPOSE --env-file "$ENV_FILE" build

log "Starting bot container"
$COMPOSE --env-file "$ENV_FILE" up -d --remove-orphans

# 4. Health check — give the bot a few seconds to connect to Discord, then
#    confirm the container is actually still running (not crash-looped).
#    Grabs whatever container this compose file defines rather than assuming
#    a service name, so it doesn't break if that name ever changes.
log "Waiting for container to stabilize..."
sleep 10
CID=$($COMPOSE --env-file "$ENV_FILE" ps -q | head -n1)
STATUS=$([ -n "$CID" ] && docker inspect -f '{{.State.Status}}' "$CID" 2>/dev/null || echo "missing")

if [ "$STATUS" != "running" ]; then
  log "Deploy FAILED — container status: $STATUS"
  if [ "$SKIP_GIT" = false ] && [ -n "$PREV_SHA" ]; then
    log "Rolling back to $PREV_SHA"
    git reset --hard "$PREV_SHA"
    $COMPOSE --env-file "$ENV_FILE" build
    $COMPOSE --env-file "$ENV_FILE" up -d --remove-orphans
    log "Rollback complete. Bot should be back on previous version."
  else
    log "No rollback available (either --skip-git was used, or nothing to roll back to)."
  fi
  exit 1
fi

log "Container is running. Last 20 log lines:"
docker logs --tail 20 "$CID" | tee -a "$LOG_FILE"

# 5. Housekeeping — only after a healthy deploy, so a rollback rebuild still
#    has recent cache. Failures here are logged, not fatal: the bot is up.
#    `-a` matters for the build cache: without it only "dangling" records go,
#    and old deploys' layers pile up regardless (105 entries / 17 GB once).
log "Pruning unused Docker images"
docker image prune -f >> "$LOG_FILE" 2>&1 || log "WARNING: docker image prune failed"

log "Pruning Docker build cache older than 7 days"
docker builder prune -af --filter "until=168h" >> "$LOG_FILE" 2>&1 \
  || log "WARNING: docker builder prune failed"

log "Disk: $(fmt_gb "$(free_kb)") free on $DOCKER_ROOT"

log "==== Deploy finished successfully ===="
