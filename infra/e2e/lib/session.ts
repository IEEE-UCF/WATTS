// Synthetic NextAuth session for the authenticated suite — a test fixture, not a
// real login and not seed data. It creates a dedicated synthetic user
// (users + accounts + members + sessions), returns a Playwright storageState,
// and is removed in global-teardown.
//
// It does NOT validate Discord OAuth — the callback, the drizzle adapter's row
// creation, cookie issuance, the "logged in but not a member -> /auth/register"
// branch. Those need a real login (`pnpm --filter @watts/e2e auth`) or, later, a
// dedicated approach. TODO: validate the OAuth path in CI (dummy Discord account
// or a mock OIDC provider) — tracked in infra/e2e/README.md.
//
// HARD GUARD: refuses to run unless DATABASE_URL points at a local / CI Postgres
// (localhost / 127.0.0.1 / ::1 / postgres). There is no override. It cannot touch
// a remote database.

import { randomUUID } from 'node:crypto';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';

loadRootEnv();

const SAFE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

/** True only for a local / CI-service Postgres — the un-bypassable guard. */
export function dbHostAllowed(): boolean {
	const url = process.env.DATABASE_URL;
	if (!url) return false;
	try {
		return SAFE_HOSTS.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

function pool(): pg.Pool {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set.');
	if (!dbHostAllowed()) {
		throw new Error(
			`refusing to touch a non-local database (${new URL(url).hostname}). ` +
				'The synthetic session only runs against localhost / 127.0.0.1 / ::1 / postgres.',
		);
	}
	return new pg.Pool({ connectionString: url });
}

// Fixed identity keys so a crashed run is recoverable and re-runs are idempotent.
export const SYNTH = {
	name: 'E2E Synthetic',
	email: 'e2e-synthetic@watts.local',
	discordId: 'e2e-synthetic',
	ucfEmail: 'e2e-synthetic@ucf.edu',
} as const;

export interface SyntheticSession {
	userId: string;
	sessionToken: string;
	/** Playwright storageState for the given baseURL. */
	storageState: { cookies: Record<string, unknown>[]; origins: [] };
}

/** Remove any leftover synthetic identity. Idempotent; safe to call anytime. */
export async function deleteSyntheticSession(): Promise<void> {
	const p = pool();
	try {
		const { rows } = await p.query<{ id: string }>('select id from users where email = $1', [
			SYNTH.email,
		]);
		const user = rows[0];
		if (!user) return;
		const members = await p.query<{ id: string }>('select id from members where user_id = $1', [
			user.id,
		]);
		for (const m of members.rows) {
			await p.query('delete from member_permissions where member_id = $1', [m.id]);
		}
		await p.query('delete from sessions where user_id = $1', [user.id]);
		await p.query('delete from members where user_id = $1', [user.id]);
		await p.query('delete from accounts where user_id = $1', [user.id]);
		await p.query('delete from users where id = $1', [user.id]);
	} finally {
		await p.end();
	}
}

/**
 * Create the synthetic user + an admin/officer member row + a fresh session.
 * Returns a storageState with the session cookie named/secured for `baseURL`.
 */
export async function createSyntheticSession(baseURL: string): Promise<SyntheticSession> {
	await deleteSyntheticSession(); // self-heal after a prior crash

	const p = pool();
	try {
		const user = await p.query<{ id: string }>(
			'insert into users (name, email, discord_id) values ($1, $2, $3) returning id',
			[SYNTH.name, SYNTH.email, SYNTH.discordId],
		);
		const userId = user.rows[0].id;

		await p.query(
			'insert into accounts (user_id, type, provider, provider_account_id) values ($1, $2, $3, $4)',
			[userId, 'oauth', 'discord', SYNTH.discordId],
		);

		await p.query(
			`insert into members
				(user_id, discord_id, first_name, last_name, administrator, officer_status, officer_role,
				 date_of_birth, personal_email, ucf_email, major, gender, graduation_year)
			 values ($1, $2, $3, $4, true, true, 'Executive Chair',
				 '2000-01-01', $5, $6, 'Computer Science (BS)', 'PNTS', 2027)`,
			[userId, SYNTH.discordId, 'E2E', 'Synthetic', SYNTH.email, SYNTH.ucfEmail],
		);

		const sessionToken = `e2e-synthetic-${randomUUID()}`;
		await p.query('insert into sessions (session_token, user_id, expires) values ($1, $2, $3)', [
			sessionToken,
			userId,
			new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		]);

		const url = new URL(baseURL);
		const secure = url.protocol === 'https:';
		return {
			userId,
			sessionToken,
			storageState: {
				cookies: [
					{
						name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
						value: sessionToken,
						domain: url.hostname,
						path: '/',
						httpOnly: true,
						secure,
						sameSite: 'Lax',
						expires: -1,
					},
				],
				origins: [],
			},
		};
	} finally {
		await p.end();
	}
}
