// Toggle the captured Discord user's REAL member row so one login can be tested
// as member / officer / admin — the same mutations the members-manager UI makes.
// Local DB only.
//
// Safety: snapshot() also writes e2e/.auth/role-backup.json. If a run crashes
// before afterAll restores you, run `pnpm --filter @watts/web e2e:role-restore`.

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';

loadRootEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set — the role helper needs the local Postgres.');
}
const pool = new pg.Pool({ connectionString });

// Playwright runs from the config dir (apps/ieeeucfcom).
const AUTH_FILE = join(process.cwd(), 'e2e', '.auth', 'user.json');
const BACKUP_FILE = join(process.cwd(), 'e2e', '.auth', 'role-backup.json');

export type Role = 'member' | 'officer' | 'admin';

function sessionToken(): string {
	let state: { cookies: { name: string; value: string }[] };
	try {
		state = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
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
	const { rows: mRows } = await pool.query<{ id: string }>('select id from members where user_id = $1', [
		sRows[0].user_id,
	]);
	if (!mRows[0]) {
		throw new Error('the captured user has no members row — register on the site first.');
	}
	cachedMemberId = mRows[0].id;
	return cachedMemberId;
}

export interface RoleSnapshot {
	memberId: string;
	administrator: boolean;
	officerStatus: boolean;
	officerRole: string | null;
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
	const { rows: m } = await pool.query<{
		administrator: boolean;
		officer_status: boolean;
		officer_role: string | null;
	}>('select administrator, officer_status, officer_role from members where id = $1', [id]);
	const { rows: perms } = await pool.query(
		'select permission, context_type, context_id, active, expires_at from member_permissions where member_id = $1',
		[id],
	);
	const snap: RoleSnapshot = {
		memberId: id,
		administrator: m[0].administrator,
		officerStatus: m[0].officer_status,
		officerRole: m[0].officer_role,
		permissions: perms.map((p) => ({
			permission: p.permission,
			contextType: p.context_type,
			contextId: p.context_id,
			active: p.active,
			expiresAt: p.expires_at,
		})),
	};
	writeFileSync(BACKUP_FILE, JSON.stringify(snap, null, 2));
	return snap;
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
	await pool.query(
		'update members set administrator = $1, officer_status = $2, officer_role = $3 where id = $4',
		[snap.administrator, snap.officerStatus, snap.officerRole, snap.memberId],
	);
	await pool.query('delete from member_permissions where member_id = $1', [snap.memberId]);
	for (const p of snap.permissions) {
		await pool.query(
			'insert into member_permissions (member_id, permission, active, context_type, context_id, expires_at) values ($1, $2, $3, $4, $5, $6)',
			[snap.memberId, p.permission, p.active, p.contextType, p.contextId, p.expiresAt],
		);
	}
	if (existsSync(BACKUP_FILE)) rmSync(BACKUP_FILE);
}

export async function closeDb(): Promise<void> {
	await pool.end();
}
