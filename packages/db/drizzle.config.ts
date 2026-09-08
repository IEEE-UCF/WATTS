import { loadRootEnv } from '@watts/config/load-env';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Next — load the repo-root ./.env explicitly.
loadRootEnv();

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set. Run `pnpm bootstrap`, or add it to ./.env (see .env.example).');
}

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
	// Fail loudly on ambiguous / destructive changes instead of silently applying them.
	strict: true,
	verbose: true,
});
