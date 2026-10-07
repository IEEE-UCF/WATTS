// Creates / removes the permission-suite personas (lib/personas.ts) and their fixture
// rows: two committees, two projects, a pending join request on each, two short links,
// an event with a members-only photo, page-editor + chair + lead links, and grants.
//
// Same un-bypassable guard as lib/session.ts: local / CI Postgres only. Idempotent —
// createPersonas() first removes anything a crashed run left behind.

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';
import { FIX, FIX_SLUGS, PERSONAS, PERSONA_EMAIL_LIKE, personaEmail, storageStatePath, type Persona } from './personas';
import { dbHostAllowed } from './session';

loadRootEnv();

function pool(): pg.Pool {
	const url = process.env.DATABASE_URL;
	if (!url || !dbHostAllowed()) {
		throw new Error('persona fixtures: refusing to run without a local / CI DATABASE_URL (localhost / 127.0.0.1 / ::1 / postgres)');
	}
	return new pg.Pool({ connectionString: url });
}

const FIXTURE_IDS = Object.values(FIX);

/** Remove every persona + fixture row. Safe to call anytime. */
export async function deletePersonas(): Promise<void> {
	const p = pool();
	try {
		const ids = FIXTURE_IDS;
		// project_membership_requests.requested_by_member_id has no ON DELETE — clear first.
		await p.query(
			`delete from project_membership_requests
			 where id = any($1::uuid[]) or project_id = any($1::uuid[])
				or member_id in (select m.id from members m join users u on u.id = m.user_id where u.email like $2)`,
			[ids, PERSONA_EMAIL_LIKE],
		);
		await p.query('delete from content_revisions where entity_id = any($1::text[])', [ids]); // varchar column
		await p.query(
			`delete from content_revisions where author_member_id in
				(select m.id from members m join users u on u.id = m.user_id where u.email like $1)`,
			[PERSONA_EMAIL_LIKE],
		);
		await p.query('delete from page_editors where scope_id = any($1::uuid[])', [ids]);
		await p.query('delete from short_links where id = any($1::uuid[]) or slug like $2', [ids, 'e2e-perm-%']);
		await p.query('delete from events where id = any($1::uuid[])', [ids]); // cascades the photo
		await p.query('delete from projects where id = any($1::uuid[])', [ids]);
		await p.query('delete from committees where id = any($1::uuid[])', [ids]);
		// users → members / accounts / sessions cascade; member rows cascade their links.
		await p.query('delete from users where email like $1', [PERSONA_EMAIL_LIKE]);
	} finally {
		await p.end();
	}
}

export interface CreatedPersonas {
	/** persona key → member id (absent for `nonmember`) */
	memberIds: Record<string, string>;
	userIds: Record<string, string>;
}

/**
 * Create every persona (user + account + member + session) and the fixtures, and
 * write one Playwright storageState per persona to .auth/perm-<key>.json.
 */
export async function createPersonas(baseURL: string): Promise<CreatedPersonas> {
	await deletePersonas();
	const p = pool();
	const memberIds: Record<string, string> = {};
	const userIds: Record<string, string> = {};
	const url = new URL(baseURL);
	const secure = url.protocol === 'https:';
	try {
		// 1. identities -----------------------------------------------------------
		for (const persona of PERSONAS) {
			const email = personaEmail(persona.key);
			const discordId = `e2e-perm-${persona.key}`;
			const { rows } = await p.query<{ id: string }>(
				'insert into users (name, email, discord_id) values ($1, $2, $3) returning id',
				[persona.label, email, discordId],
			);
			const userId = rows[0].id;
			userIds[persona.key] = userId;
			await p.query(
				'insert into accounts (user_id, type, provider, provider_account_id) values ($1, $2, $3, $4)',
				[userId, 'oauth', 'discord', discordId],
			);
			if (persona.member) memberIds[persona.key] = await insertMember(p, persona, userId, discordId, email);

			const token = `e2e-perm-${persona.key}-${randomUUID()}`;
			await p.query('insert into sessions (session_token, user_id, expires) values ($1, $2, $3)', [
				token,
				userId,
				new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			]);
			const file = join(process.cwd(), storageStatePath(persona.key));
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(
				file,
				JSON.stringify({
					cookies: [
						{
							name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
							value: token,
							domain: url.hostname,
							path: '/',
							httpOnly: true,
							secure,
							sameSite: 'Lax',
							expires: -1,
						},
					],
					origins: [],
				}),
			);
		}

		const mid = (key: string) => {
			const id = memberIds[key];
			if (!id) throw new Error(`persona ${key} has no member row`);
			return id;
		};
		const chairIdHolder = (c: 'A' | 'B') => PERSONAS.find((x) => x.chairIdOf.includes(c))!.key;

		// 2. committees / projects --------------------------------------------------
		for (const c of ['A', 'B'] as const) {
			await p.query(
				`insert into committees (id, title, slug, about, chair_id, active, published)
				 values ($1, $2, $3, $4, $5, true, false)`,
				[FIX[`committee${c}`], `E2E Perm Committee ${c}`, FIX_SLUGS[`committee${c}`], `Permission-suite fixture committee ${c}.`, mid(chairIdHolder(c))],
			);
			await p.query(
				`insert into projects (id, title, slug, overview, active, published)
				 values ($1, $2, $3, $4, true, false)`,
				[FIX[`project${c}`], `E2E Perm Project ${c}`, FIX_SLUGS[`project${c}`], `Permission-suite fixture project ${c}.`],
			);
		}

		// 3. per-persona links + grants ---------------------------------------------
		const committeeId = (c: 'A' | 'B') => FIX[`committee${c}`];
		const projectId = (c: 'A' | 'B') => FIX[`project${c}`];
		for (const persona of PERSONAS.filter((x) => x.member)) {
			const id = mid(persona.key);
			for (const c of persona.chairOf)
				await p.query('insert into committee_members (committee_id, member_id, is_chair) values ($1, $2, true)', [committeeId(c), id]);
			for (const c of persona.leadOf)
				await p.query('insert into project_members (project_id, member_id, is_lead) values ($1, $2, true)', [projectId(c), id]);
			for (const scope of persona.pageEditorOf) {
				const [type, c] = scope.split(':') as ['committee' | 'project', 'A' | 'B'];
				await p.query('insert into page_editors (scope_type, scope_id, member_id) values ($1, $2, $3)', [
					type,
					type === 'committee' ? committeeId(c) : projectId(c),
					id,
				]);
			}
			for (const g of persona.grants) {
				await p.query(
					`insert into member_permissions (member_id, permission, active, context_type, context_id, expires_at)
					 values ($1, $2, $3, $4, $5, $6)`,
					[id, g.cap, g.active ?? true, g.contextType ?? 'global', g.contextId ?? null, g.expiresAt ?? null],
				);
			}
		}

		// 4. pending join requests (one per project, from the plain member) ----------
		for (const c of ['A', 'B'] as const) {
			await p.query(
				`insert into project_membership_requests (id, project_id, member_id, requested_by_member_id, status, message)
				 values ($1, $2, $3, $3, 'pending', 'e2e permission fixture')`,
				[FIX[`request${c}`], projectId(c), mid('member')],
			);
		}

		// 5. short links: one by the manage_links grant holder, one by an officer -----
		await p.query(
			`insert into short_links (id, slug, target_url, title, created_by_member_id) values
				($1, $2, 'https://example.com/own', 'E2E own link', $3),
				($4, $5, 'https://example.com/other', 'E2E other link', $6)`,
			[FIX.linkOwn, FIX_SLUGS.linkOwn, mid('member_manage_links'), FIX.linkOther, FIX_SLUGS.linkOther, mid('officer')],
		);

		// 6. an event with a members-only, unapproved photo (non-public → gated) -----
		await p.query(
			`insert into events (id, title, slug, location, description, start_time, active)
			 values ($1, 'E2E Perm Event', $2, 'Nowhere', 'Permission-suite fixture event.', now() + interval '30 days', true)`,
			[FIX.event, FIX_SLUGS.event],
		);
		await p.query(
			`insert into event_photos (id, event_id, web_key, web_url, content_type, size_bytes, visibility, approved)
			 values ($1, $2, 'e2e-perm/missing.jpg', '/e2e-perm/missing.jpg', 'image/jpeg', 1, 'members', false)`,
			[FIX.privatePhoto, FIX.event],
		);

		return { memberIds, userIds };
	} finally {
		await p.end();
	}
}

async function insertMember(p: pg.Pool, persona: Persona, userId: string, discordId: string, email: string): Promise<string> {
	const { rows } = await p.query<{ id: string }>(
		`insert into members
			(user_id, discord_id, first_name, last_name, administrator, officer_status, officer_role,
			 date_of_birth, personal_email, ucf_email, major, gender, graduation_year, resume_key, resume_file_name)
		 values ($1, $2, 'E2E', $3, $4, $5, $6, '2000-01-01', $7, $8, 'Computer Science (BS)', 'PNTS', 2027, $9, $10)
		 returning id`,
		[
			userId,
			discordId,
			persona.key,
			persona.administrator,
			persona.officerStatus,
			persona.officerRole,
			email,
			email.replace('@watts.local', '@ucf.edu'),
			persona.resume ? `resumes/e2e-perm/${persona.key}.pdf` : null,
			persona.resume ? 'e2e-perm.pdf' : null,
		],
	);
	return rows[0].id;
}

/** Shared DB handle for specs that need to read/mutate persona fixtures. */
export function personaPool(): pg.Pool {
	return pool();
}
