// Bring the local stack to a ready state. `pnpm infra:up` runs this.
//   1. start the long-running containers (postgres, minio, drizzle-studio)
//   2. wait for postgres
//   3. run the one-shot bucket setup (`minio-init`, profile "setup") and remove it
//
// minio-init is profiled out of the default `up`, so `docker compose ps` never
// shows a lingering "Exited (0)" container — but the setup still runs every time,
// idempotently, from the same image on the same compose network.

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = 'docker compose -f infra/docker/docker-compose.yml';
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

run(`${compose} up -d`);
run('node infra/scripts/wait-for-postgres.mjs');
run(`${compose} run --rm minio-init`);

console.log('\n• local infra ready — postgres :5432 · minio :9000/:9001 · drizzle-studio :4983\n');
