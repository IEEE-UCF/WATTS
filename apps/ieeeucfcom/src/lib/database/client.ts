import { createDb } from '@watts/db';

// The repo-root ./.env is loaded by loadRootEnv() at the top of next.config.ts (and by
// @watts/config for non-Next consumers), so DATABASE_URL is populated by the time this runs.
if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL must be set');
}

// DB_PROVIDER: 'neon' (default — serverless HTTP, Vercel) | 'local' (plain Postgres — Docker / VPS)
export const db = createDb({
	url: process.env.DATABASE_URL,
	driver: process.env.DB_PROVIDER === 'local' ? 'postgres-js' : 'neon-http',
});
