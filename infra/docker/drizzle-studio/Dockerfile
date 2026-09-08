# Drizzle Studio as an always-on container. Self-contained: only the packages
# `drizzle-kit studio` needs, pinned to the workspace versions. The schema file is
# bind-mounted at runtime (see docker-compose.yml) so edits show up on restart.
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

WORKDIR /studio

# Versions mirror pnpm-workspace.yaml `overrides` + the app's drizzle-kit range.
# --allow-build=esbuild: drizzle-kit bundles esbuild, whose postinstall fetches the
# linux-x64 binary; pnpm blocks build scripts by default.
RUN pnpm add --allow-build=esbuild \
	drizzle-kit@0.31.8 \
	drizzle-orm@0.44.7 \
	pg@8.16.3

COPY drizzle-studio.config.ts redirect.mjs ./

# 3054 = drizzle-kit studio · 3055 = the friendly redirect to local.drizzle.studio
EXPOSE 3054 3055

# Run the redirect helper alongside Studio in one container. `exec` hands PID 1 to
# drizzle-kit so compose stop/restart signals reach it; the redirect helper is a
# best-effort background convenience. --host 0.0.0.0 so both published ports are
# reachable from the host browser.
CMD ["sh", "-c", "node /studio/redirect.mjs & exec pnpm exec drizzle-kit studio --config /studio/drizzle-studio.config.ts --host 0.0.0.0 --port 3054"]
