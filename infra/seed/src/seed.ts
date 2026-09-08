// Local dev seed.
//
//   pnpm db:seed                     # dev admin + all domain fixtures (idempotent)
//   pnpm db:seed -- --admin-only     # just the dev admin, no fixtures
//   pnpm db:seed -- --fixtures=members,events   # admin + only those fixture files
//   pnpm db:seed -- --wipe           # DROP every table in public, then run pnpm db:migrate
//   pnpm db:seed -- postgres://…/db  # target a specific database
//
// Fixtures are inserted through the Drizzle `schema` table objects (keys are the
// TS property names, camelCase), so a schema change surfaces as a type/insert
// error here instead of silently drifting. Rows carry fixed ids and reference
// each other by them; `onConflictDoNothing` makes re-runs safe.
//
// The schema comes from `@watts/db/schema` — the same table objects the website and
// (later) the bot use, so column drift is a compile error here.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '@watts/config/load-env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@watts/db/schema';

loadRootEnv();

const {
	Users,
	Accounts,
	Members,
	Sessions,
	Sponsorships,
	Projects,
	Committees,
	CommitteeMembers,
	ProjectMembers,
	Events,
	EventAttendees,
	MemberPermissions,
} = schema;

const DEV_ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? 'admin@watts.local';
// Set DEV_ADMIN_DISCORD_ID to your real Discord user id so the bot (Larry, /whois,
// the permission ladder) resolves you in a test guild. Falls back to a placeholder.
const DEV_ADMIN_DISCORD_ID = process.env.DEV_ADMIN_DISCORD_ID || 'dev-admin';
const DEV_SESSION_TOKEN = 'dev-admin-session';
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

// Load order respects foreign keys.
const FIXTURE_ORDER: readonly [name: string, table: PgTable][] = [
	['members', Members],
	['sponsorships', Sponsorships],
	['projects', Projects],
	['committees', Committees],
	['committee_members', CommitteeMembers],
	['project_members', ProjectMembers],
	['events', Events],
	['event_attendees', EventAttendees],
	['member_permissions', MemberPermissions],
];

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('postgres://') || a.startsWith('postgresql://'));
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
	const [existingUser] = await db.select().from(Users).where(eq(Users.email, DEV_ADMIN_EMAIL)).limit(1);

	let userId: string;
	if (existingUser) {
		userId = existingUser.id;
		if (existingUser.discordId !== DEV_ADMIN_DISCORD_ID) {
			await db.update(Users).set({ discordId: DEV_ADMIN_DISCORD_ID }).where(eq(Users.id, userId));
		}
		console.log(`• dev admin user already present (${DEV_ADMIN_EMAIL})`);
	} else {
		const [created] = await db
			.insert(Users)
			.values({ name: 'Dev Admin', email: DEV_ADMIN_EMAIL, discordId: DEV_ADMIN_DISCORD_ID })
			.returning();
		userId = created.id;
		console.log(`• created dev admin user (${DEV_ADMIN_EMAIL})`);
	}

	const [account] = await db.select().from(Accounts).where(eq(Accounts.userId, userId)).limit(1);
	if (!account) {
		await db
			.insert(Accounts)
			.values({ userId, type: 'oauth', provider: 'discord', providerAccountId: DEV_ADMIN_DISCORD_ID });
		console.log('• linked a discord account row');
	}

	const [member] = await db.select().from(Members).where(eq(Members.userId, userId)).limit(1);
	if (!member) {
		await db.insert(Members).values({
			userId,
			discordId: DEV_ADMIN_DISCORD_ID,
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
	} else if (!member.administrator || !member.officerStatus || member.discordId !== DEV_ADMIN_DISCORD_ID) {
		await db
			.update(Members)
			.set({ administrator: true, officerStatus: true, discordId: DEV_ADMIN_DISCORD_ID })
			.where(eq(Members.id, member.id));
		console.log('• synced existing member (administrator + officer + discordId)');
	} else {
		console.log('• member profile already an administrator + officer');
	}

	const [session] = await db.select().from(Sessions).where(eq(Sessions.sessionToken, DEV_SESSION_TOKEN)).limit(1);
	if (!session) {
		await db.insert(Sessions).values({
			sessionToken: DEV_SESSION_TOKEN,
			userId,
			expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100),
		});
		console.log('• created a long-lived dev session');
	}
}

async function loadFixtures(only?: string[]) {
	for (const [name, table] of FIXTURE_ORDER) {
		if (only && !only.includes(name)) continue;

		let rows: Record<string, unknown>[];
		try {
			rows = JSON.parse(await readFile(join(FIXTURES_DIR, `${name}.json`), 'utf8'));
		} catch {
			console.log(`• ${name}: no fixture file, skipped`);
			continue;
		}
		if (!Array.isArray(rows) || rows.length === 0) {
			console.log(`• ${name}: empty, skipped`);
			continue;
		}

		await db.insert(table).values(rows).onConflictDoNothing();
		console.log(`• ${name}: ${rows.length} row(s)`);
	}
}

async function main() {
	if (argv.includes('--wipe')) {
		await wipe();
		return;
	}

	await seedAdmin();

	if (!argv.includes('--admin-only')) {
		const flag = argv.find((a) => a === '--fixtures' || a.startsWith('--fixtures='));
		const only = flag?.includes('=')
			? flag.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean)
			: undefined;
		console.log(only ? `• loading fixtures: ${only.join(', ')}` : '• loading all fixtures');
		await loadFixtures(only);
	}

	console.log('\n✅ seed complete — start the app (`pnpm dev`) and sign in with Discord at https://localhost:3050');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
