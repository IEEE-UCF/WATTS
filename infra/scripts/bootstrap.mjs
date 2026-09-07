// One-command local setup. Idempotent — safe to re-run.
//   1. create ./.env from ./.env.example (if missing)
//   2. pnpm install
//   3. start the docker stack (postgres + minio)
//   4. wait for postgres
//   5. apply migrations
//   6. seed the dev admin (user + member + session)

import { existsSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

const envPath = join(root, '.env');
if (existsSync(envPath)) {
	console.log('• ./.env already exists — leaving it as-is');
} else {
	copyFileSync(join(root, '.env.example'), envPath);
	console.log('• created ./.env from .env.example');
}

run('pnpm install');
run('pnpm infra:up');
run('node infra/scripts/wait-for-postgres.mjs');
run('pnpm db:migrate');
run('pnpm db:seed');

console.log(`
✅ Local environment ready.

   pnpm dev                       → http://127.0.0.1:3000
   http://127.0.0.1:3000/api/dev/login   → sign in as the seeded admin (no Discord)

   pnpm db:reset                  → wipe + migrate + reseed
`);
