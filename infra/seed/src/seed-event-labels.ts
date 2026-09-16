// One-off script to seed `event_labels` in an environment that's missing them
// (e.g. production, where the local dev seed has never been run).
//
//   pnpm --filter @watts/seed run seed:event-labels
//   pnpm --filter @watts/seed run seed:event-labels -- postgres://…/db
//
// Safe to re-run: inserts are onConflictDoNothing against the unique `slug` column.
// Swap DATABASE_URL (or pass a URL arg) to the Neon prod connection string before running.

import { loadRootEnv } from '@watts/config/load-env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@watts/db/schema';
import { SEED_EVENT_LABELS } from '@watts/calendar';

loadRootEnv();

const { EventLabels } = schema;

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('postgres://') || a.startsWith('postgresql://'));
const DATABASE_URL = urlArg ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('No database URL. Set DATABASE_URL in ./.env, or pass one as an argument.');
	process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

async function main() {
	const inserted = await db
		.insert(EventLabels)
		.values([...SEED_EVENT_LABELS])
		.onConflictDoNothing()
		.returning({ slug: EventLabels.slug });

	console.log(`• event_labels: ${inserted.length}/${SEED_EVENT_LABELS.length} row(s) inserted (rest already present)`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
