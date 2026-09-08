// One-command local setup. Idempotent — safe to re-run.
//   1. create ./.env from ./.env.example (if missing)
//   2. pnpm install
//   3. bring the docker stack up + create buckets (pnpm infra:up)
//   4. apply migrations
//   5. seed the dev admin (user + member + session)

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
run('pnpm db:migrate');
run('pnpm db:seed');

console.log(`
✅ Local environment ready.

   pnpm dev                       → http://127.0.0.1:3000  (sign in with Discord)

   pnpm db:reset                  → wipe + migrate + reseed
`);
