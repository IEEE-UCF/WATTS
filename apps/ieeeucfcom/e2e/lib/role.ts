// Toggle the captured Discord user's REAL member row so one login can be tested
// as member / officer / admin — the same mutations the members-manager UI makes.
// Local DB only. Every spec that uses this MUST snapshot() in beforeAll and
// restore() in afterAll so your account is left exactly as it was.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';

loadRootEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set — the role helper needs the local Postgres.');
}
const pool = new pg.Pool({ connectionString });

export type Role = 'member' | 'officer' | 'admin';

function sessionToken(): string {
	// Playwright runs from the config dir (apps/ieeeucfcom).
	const path = join(process.cwd(), 'e2e', '.auth', 'user.json');
	let state: { cookies: { name: string; value: string }[] };
	try {
		state = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		throw new Error('e2e/.auth/user.json missing — run `pnpm --filter @watts/web e2e:auth` first.');
	}
	const cookie = state.cookies.find((c) => c.name.endsWith('next-auth.session-token'));
	if (!cookie) throw new Error('no next-auth session-token cookie in e2e/.auth/user.json');
	return cookie.value;
}

let cachedMemberId: string | undefined;
export async function testMemberId(): Promise<string> {
	if (cachedMemberId) return cachedMemberId;
	const { rows: sRows } = await pool.query<{ user_id: string }>(
		'select user_id from sessions where session_token = $1',
		[sessionToken()],
	);
	if (!sRows[0]) throw new Error('captured session not in the DB — it may have expired; re-run e2e:auth.');
	const { rows: mRows } = await pool.query<{ id: string }>(
		'select id from members where user_id = $1',
		[sRows[0].user_id],
	);
	if (!mRows[0]) {
		throw new Error('the captured user has no members row — register on the site first (or set DEV_ADMIN_DISCORD_ID + link it).');
	}
	cachedMemberId = mRows[0].id;
	return cachedMemberId;
}

export interface RoleSnapshot {
	administrator: boolean;
	officerStatus: boolean;
	permissions: {
		permission: string;
		contextType: string;
		contextId: string | null;
		active: boolean;
		expiresAt: string | null;
	}[];
}

export async function snapshot(): Promise<RoleSnapshot> {
	const id = await testMemberId();
	const { rows: m } = await pool.query<{ administrator: boolean; officer_status: boolean }>(
		'select administrator, officer_status from members where id = $1',
		[id],
	);
	const { rows: perms } = await pool.query(
		'select permission, context_type, context_id, active, expires_at from member_permissions where member_id = $1',
		[id],
	);
	return {
		administrator: m[0].administrator,
		officerStatus: m[0].officer_status,
		permissions: perms.map((p) => ({
			permission: p.permission,
			contextType: p.context_type,
			contextId: p.context_id,
			active: p.active,
			expiresAt: p.expires_at,
		})),
	};
}

export async function setRole(role: Role, caps: string[] = []): Promise<void> {
	const id = await testMemberId();
	await pool.query('update members set administrator = $1, officer_status = $2 where id = $3', [
		role === 'admin',
		role === 'officer' || role === 'admin',
		id,
	]);
	await pool.query('delete from member_permissions where member_id = $1', [id]);
	for (const cap of caps) {
		await pool.query(
			"insert into member_permissions (member_id, permission, active, context_type) values ($1, $2, true, 'global')",
			[id, cap],
		);
	}
}

export async function restore(snap: RoleSnapshot): Promise<void> {
	const id = await testMemberId();
	await pool.query('update members set administrator = $1, officer_status = $2 where id = $3', [
		snap.administrator,
		snap.officerStatus,
		id,
	]);
	await pool.query('delete from member_permissions where member_id = $1', [id]);
	for (const p of snap.permissions) {
		await pool.query(
			'insert into member_permissions (member_id, permission, active, context_type, context_id, expires_at) values ($1, $2, $3, $4, $5, $6)',
			[id, p.permission, p.active, p.contextType, p.contextId, p.expiresAt],
		);
	}
}

export async function closeDb(): Promise<void> {
	await pool.end();
}
