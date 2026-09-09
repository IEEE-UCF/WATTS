# @watts/bot container image.
#
# BUILD FROM THE REPO ROOT so the pnpm workspace resolves:
#     docker build -f apps/dbot/Dockerfile -t watts-bot .
#
# The bot runs its TypeScript directly through `tsx` (no compile step — the shared
# packages ship raw .ts), so there is no build stage; the image just needs the
# workspace sources plus the installed dependency graph for `@watts/bot` and the
# four packages it imports (@watts/config, @watts/core, @watts/db, @watts/permissions).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — install only what @watts/bot needs. `@watts/bot...` (trailing dots)
# expands to the bot plus its workspace dependencies. The repo-root .dockerignore
# keeps node_modules / .next / .env / .git out of the build context.
# NOTE: this copies all sources before installing, so any source edit busts the
# install layer. Fine for an image built occasionally; split manifests into their
# own COPY layer if bot deploys get frequent.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile --filter @watts/bot...

# ---------------------------------------------------------------------------
# runtime — non-root, start via the workspace script (`tsx main.ts`).
# ---------------------------------------------------------------------------
FROM deps AS runtime
RUN addgroup -g 1001 -S bot && adduser -S bot -u 1001 -G bot && chown -R bot:bot /app
USER bot
WORKDIR /app/apps/dbot

# The bot reads the repo-root ./.env via @watts/config. In production pass the
# vars through the container environment instead (see infra/docker/bot/compose.yml).
CMD ["pnpm", "start"]
