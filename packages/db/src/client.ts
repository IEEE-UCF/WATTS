import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type Driver = 'neon-http' | 'postgres-js';

export interface CreateDbOptions {
	/** Postgres connection string. */
	url: string;
	/**
	 * Which Drizzle driver to use:
	 *  - `neon-http`   — Neon serverless HTTP (Vercel / edge).
	 *  - `postgres-js` — plain Postgres over a TCP socket (local Docker, VPS).
	 */
	driver: Driver;
}

/**
 * Build a Drizzle client for the given connection + driver.
 *
 * Framework-neutral: no env reads, no singletons, no import-time throw — the caller
 * supplies `url`. The website maps `DB_PROVIDER=neon → 'neon-http'`, `local → 'postgres-js'`.
 *
 * NOTE: both drivers are statically imported here, faithful to the pre-extraction
 * `client.ts`. Lazy per-driver `import()` (so a Neon bundle never pulls `postgres`) is
 * a later refinement — see the extraction plan, Part II §2.1.
 */
export function createDb(opts: CreateDbOptions) {
	if (opts.driver === 'postgres-js') {
		return drizzlePostgres(postgres(opts.url), { schema });
	}
	return drizzleNeon(neon(opts.url), { schema });
}

export type WattsDb = ReturnType<typeof createDb>;
