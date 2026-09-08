import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema';
import type { WattsDb } from './client';

export interface NodePgClient {
	/** Drizzle client — assignable to WattsDb, drops straight into @watts/core fns. */
	db: WattsDb;
	/** The underlying pg Pool — health checks, `SELECT NOW()` probes, raw SQL. */
	pool: Pool;
	/** Close the pool (graceful shutdown). */
	end(): Promise<void>;
}

/**
 * node-postgres Drizzle client with the Pool kept in reach. For long-lived
 * processes that need lifecycle control — the Discord bot, cron jobs. The
 * website uses `createDb` (neon-http / postgres-js) and never imports this
 * module, so `pg` stays out of the Vercel bundle.
 */
export function createNodePgClient(opts: { url: string; poolConfig?: PoolConfig }): NodePgClient {
	const pool = new Pool({ connectionString: opts.url, ...opts.poolConfig });
	const db: WattsDb = drizzle(pool, { schema });
	return { db, pool, end: () => pool.end() };
}
