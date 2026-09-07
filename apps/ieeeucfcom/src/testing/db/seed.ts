// Local dev seed. Default action: (re)create a working admin you can log in as via
// /api/dev/login — no Discord, no manual SQL.
//
//   pnpm db:seed            # upsert the dev admin (user + account + member + session)
//   pnpm db:seed --wipe     # drop every table in `public` (then run `pnpm db:migrate`)
//   pnpm db:seed postgres://…/db   # target a specific database
//
// NOTE: schema is imported by relative path for now. When the schema moves to
// @watts/db this file moves to infra/seed and imports the package.

import { loadRootEnv } from '@watts/config/load-env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../../lib/database/schema';

loadRootEnv();

const { Users, Accounts, Members, Sessions } = schema;

const DEV_ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? 'admin@watts.local';
const DEV_SESSION_TOKEN = 'dev-admin-session';

const urlArg = process.argv.find((a) => a.startsWith('postgres://') || a.startsWith('postgresql://'));
const DATABASE_URL = urlArg ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('No database URL. Run `pnpm bootstrap`, set DATABASE_URL in ./.env, or pass one as an argument.');
	process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

async function wipe() {
	const rows = await sql<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public'
	`;
	for (const { tablename } of rows) {
		await sql.unsafe(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
	}
	console.log(`• dropped ${rows.length} tables in public — run \`pnpm db:migrate\` next`);
}

async function seedAdmin() {
	const [existingUser] = await db
		.select()
		.from(Users)
		.where(eq(Users.email, DEV_ADMIN_EMAIL))
		.limit(1);

	let userId: string;
	if (existingUser) {
		userId = existingUser.id;
		console.log(`• dev admin user already present (${DEV_ADMIN_EMAIL})`);
	} else {
		const [created] = await db
			.insert(Users)
			.values({ name: 'Dev Admin', email: DEV_ADMIN_EMAIL, discordId: 'dev-admin' })
			.returning();
		userId = created.id;
		console.log(`• created dev admin user (${DEV_ADMIN_EMAIL})`);
	}

	const [account] = await db
		.select()
		.from(Accounts)
		.where(eq(Accounts.userId, userId))
		.limit(1);
	if (!account) {
		await db.insert(Accounts).values({
			userId,
			type: 'oauth',
			provider: 'discord',
			providerAccountId: 'dev-admin',
		});
		console.log('• linked a discord account row');
	}

	const [member] = await db
		.select()
		.from(Members)
		.where(eq(Members.userId, userId))
		.limit(1);
	if (!member) {
		await db.insert(Members).values({
			userId,
			firstName: 'Dev',
			lastName: 'Admin',
			administrator: true,
			officerStatus: true,
			officerRole: 'Executive Chair',
			dateOfBirth: '2000-01-01',
			personalEmail: DEV_ADMIN_EMAIL,
			ucfEmail: 'dev.admin@ucf.edu',
			major: 'Computer Science (BS)',
			gender: 'PNTS',
			graduationYear: 2027,
		});
		console.log('• created member profile (administrator + officer)');
	} else if (!member.administrator || !member.officerStatus) {
		await db
			.update(Members)
			.set({ administrator: true, officerStatus: true })
			.where(eq(Members.id, member.id));
		console.log('• promoted existing member to administrator + officer');
	} else {
		console.log('• member profile already an administrator + officer');
	}

	const [session] = await db
		.select()
		.from(Sessions)
		.where(eq(Sessions.sessionToken, DEV_SESSION_TOKEN))
		.limit(1);
	if (!session) {
		await db.insert(Sessions).values({
			sessionToken: DEV_SESSION_TOKEN,
			userId,
			expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100),
		});
		console.log('• created a long-lived dev session');
	}
}

async function main() {
	if (process.argv.includes('--wipe')) {
		await wipe();
		return;
	}
	await seedAdmin();
	console.log('\n✅ seed complete — log in at http://127.0.0.1:3000/api/dev/login');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
