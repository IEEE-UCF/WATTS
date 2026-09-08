// Config for the containerised Drizzle Studio only. Standalone on purpose — it does
// NOT import @watts/config / loadRootEnv, so it can't be broken by a stray root
// .env.local. DATABASE_URL comes from the compose `environment:` block and points at
// the `postgres` service on the compose network. Schema is bind-mounted read-only.
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL must be set (provided by docker-compose.yml).');
}

export default defineConfig({
	dialect: 'postgresql',
	schema: '/studio/schema/schema.ts',
	dbCredentials: { url: process.env.DATABASE_URL },
});
