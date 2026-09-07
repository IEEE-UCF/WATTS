// Plain-JS root .env loader. Kept framework-free and dependency-light so it can run
// from next.config.ts, drizzle.config.ts, the seed, and bootstrap scripts alike.
//
// Resolution: walk up from cwd to the directory that holds pnpm-workspace.yaml (the
// repo root), then load ./.env, then ./.env.local as an override. Existing process.env
// values always win — so on Vercel / CI (no .env file, vars already in the environment)
// this is a safe no-op.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

/** @returns {string | null} absolute path to the repo root, or null if not found */
export function findRepoRoot(start = process.cwd()) {
	let dir = resolve(start);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

let done = false;

/** Load the repo-root .env (+ .env.local override) into process.env exactly once. */
export function loadRootEnv() {
	if (done) return;
	done = true;
	const root = findRepoRoot();
	if (!root) return;
	dotenvConfig({ path: join(root, '.env') });
	dotenvConfig({ path: join(root, '.env.local'), override: true });
}

export default loadRootEnv;
