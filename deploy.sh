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

set -euo pipefail

# ---- The script finds its own location, so it works from any checkout on any machine ----
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_ROOT/.env"
COMPOSE_FILE="$REPO_ROOT/infra/docker/bot/compose.yml"
BRANCH="main"
LOG_FILE="$REPO_ROOT/deploy.log"
SKIP_GIT=false

# ---- Parse CLI flags ----
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-git) SKIP_GIT=true; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
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

# 5. Housekeeping
log "Pruning unused Docker images"
docker image prune -f >> "$LOG_FILE" 2>&1

log "==== Deploy finished successfully ===="
