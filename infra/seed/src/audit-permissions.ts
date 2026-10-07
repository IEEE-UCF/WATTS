// Read-only "who has what" permission audit. Lists every admin, officer, capability
// grant, committee chair, project lead, page editor and officer-profile link, shows
// each privileged person's EFFECTIVE website capabilities + Discord-bot tier (computed
// by the same @watts/permissions functions the apps use), and flags anomalies.
//
//   pnpm perm:audit                                  # print to the console
//   pnpm perm:audit -- --md report.md                # also write infra/seed/.audit/report.md
//   pnpm perm:audit -- --json report.json            # also write infra/seed/.audit/report.json
//   pnpm perm:audit -- --allow-remote                # required for a non-local DATABASE_URL
//
// Intended target: the local prod mirror (`pnpm prod:backup && pnpm mirror:restore &&
// pnpm mirror:use`). Pointing it at prod directly needs --allow-remote.
//
// Safe by construction: everything runs inside a READ ONLY transaction, so the database
// rejects any write. The report contains member NAMES (no emails, no secrets) — which is
// why .audit/ is gitignored. See docs/PERMISSIONS.md for what each role means.

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '@watts/config/load-env';
import {
	CAPABILITY_KEYS,
	OFFICER_DELEGABLE_CAPABILITIES,
	hasCapability,
	isCapability,
	type Capability,
} from '@watts/permissions';
import { computeRoleTier, EXECUTIVE_OFFICER_ROLES, PermissionLevelNames } from '@watts/permissions/tier';
import postgres from 'postgres';

loadRootEnv();

const args = process.argv.slice(2);
const argValue = (flag: string) => {
	const i = args.indexOf(flag);
	return i >= 0 ? (args[i + 1] ?? null) : null;
};
const MD_OUT = argValue('--md');
const JSON_OUT = argValue('--json');
const ALLOW_REMOTE = args.includes('--allow-remote');

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
if (!LOCAL_HOSTS.has(url.hostname) && !ALLOW_REMOTE) {
	console.error(
		`Refusing to audit a non-local database (${url.hostname}) without --allow-remote.\n` +
			'The usual target is the local mirror: pnpm prod:backup && pnpm mirror:restore && pnpm mirror:use',
	);
	process.exit(1);
}

const AUDIT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.audit');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberRow {
	id: string;
	first_name: string;
	last_name: string;
	discord_id: string | null;
	administrator: boolean;
	officer_status: boolean;
	officer_role: string | null;
	active: boolean;
	ucf_email: string | null;
	personal_email: string | null;
	user_id: string | null;
}
interface GrantRow {
	member_id: string;
	granted_by_id: string | null;
	context_type: string;
	context_id: string | null;
	permission: string;
	active: boolean;
	expires_at: Date | null;
	created_at: Date;
}
interface CommitteeRow {
	id: string;
	title: string;
	slug: string | null;
	chair_id: string;
	active: boolean;
}
interface LinkRow {
	scope_id: string;
	member_id: string;
	flag: boolean;
}
interface PageEditorRow {
	scope_type: string;
	scope_id: string;
	member_id: string;
	granted_by_member_id: string | null;
	expires_at: Date | null;
}
interface OfficerProfileRow {
	id: string;
	member_id: string | null;
	display_name: string;
	role_title: string | null;
	active: boolean;
}

type Severity = 'action' | 'warn' | 'info';
interface Finding {
	severity: Severity;
	code: string;
	message: string;
}

// ---------------------------------------------------------------------------
// Query (read-only)
// ---------------------------------------------------------------------------

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function load() {
	return sql.begin('read only', async (txn) => {
		// postgres-js types a transaction as non-callable; at runtime it is the same tagged template.
		const tx = txn as unknown as postgres.Sql;
		const has = async (table: string) =>
			Boolean((await tx`select to_regclass(${'public.' + table}) is not null as ok`)[0].ok);

		const members = await tx<MemberRow[]>`
			select id, first_name, last_name, discord_id, administrator, officer_status, officer_role,
				active, ucf_email, personal_email, user_id
			from members order by last_name, first_name`;
		const grants = await tx<GrantRow[]>`
			select member_id, granted_by_id, context_type, context_id, permission, active, expires_at, created_at
			from member_permissions order by created_at`;
		const committees = await tx<CommitteeRow[]>`select id, title, slug, chair_id, active from committees order by title`;
		const committeeLinks = await tx<LinkRow[]>`
			select committee_id as scope_id, member_id, is_chair as flag from committee_members`;
		const projects = await tx<{ id: string; title: string; active: boolean }[]>`
			select id, title, active from projects order by title`;
		const projectLinks = await tx<LinkRow[]>`
			select project_id as scope_id, member_id, is_lead as flag from project_members`;
		const pageEditors = (await has('page_editors'))
			? await tx<PageEditorRow[]>`
				select scope_type, scope_id, member_id, granted_by_member_id, expires_at from page_editors`
			: [];
		const officerProfiles = (await has('officer_profiles'))
			? await tx<OfficerProfileRow[]>`
				select id, member_id, display_name, role_title, active from officer_profiles order by sort_order`
			: [];
		const [setting] = await tx<{ value: unknown }[]>`
			select value from app_settings where key = 'officer_grantable_capabilities'`;
		const dupUsers = await tx<{ discord_id: string; n: number }[]>`
			select discord_id, count(*)::int as n from users where discord_id is not null
			group by discord_id having count(*) > 1`;
		return { members, grants, committees, committeeLinks, projects, projectLinks, pageEditors, officerProfiles, setting, dupUsers };
	});
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const isExecRole = (role: string | null) => !!role && (EXECUTIVE_OFFICER_ROLES as readonly string[]).includes(role);

/** "Software Chair" → the Software committee, by title word match. A suggestion only. */
function suggestCommittee(role: string | null, committees: CommitteeRow[]): CommitteeRow | null {
	if (!role) return null;
	const base = role.replace(/\s*chair$/i, '').trim().toLowerCase();
	if (!base) return null;
	return (
		committees.find((c) => c.title.toLowerCase().replace(/\s*committee$/, '') === base) ??
		committees.find((c) => c.title.toLowerCase().includes(base)) ??
		committees.find((c) => base.includes(c.title.toLowerCase().split(/\s+/)[0])) ??
		null
	);
}

function analyze(data: Awaited<ReturnType<typeof load>>) {
	const now = new Date();
	const byId = new Map(data.members.map((m) => [m.id, m]));
	const fullName = (m: MemberRow) => `${m.first_name} ${m.last_name}`.trim();
	const nameCount = new Map<string, number>();
	for (const m of data.members) nameCount.set(fullName(m), (nameCount.get(fullName(m)) ?? 0) + 1);
	// Names shared by several member rows (duplicate accounts) get a short id suffix.
	const nameOf = (id: string | null | undefined) => {
		if (!id) return '—';
		const m = byId.get(id);
		if (!m) return `(missing member ${id.slice(0, 8)})`;
		return (nameCount.get(fullName(m)) ?? 0) > 1 ? `${fullName(m)} #${m.id.slice(0, 6)}` : fullName(m);
	};
	const committeeTitle = new Map(data.committees.map((c) => [c.id, c.title]));
	const projectTitle = new Map(data.projects.map((p) => [p.id, p.title]));
	const scopeTitle = (type: string, id: string) =>
		(type === 'committee' ? committeeTitle.get(id) : type === 'project' ? projectTitle.get(id) : null) ??
		`${type}:${id.slice(0, 8)}`;

	const liveGrant = (g: GrantRow) => g.active && (!g.expires_at || g.expires_at > now);
	const grantsBy = new Map<string, GrantRow[]>();
	for (const g of data.grants) grantsBy.set(g.member_id, [...(grantsBy.get(g.member_id) ?? []), g]);

	// Website chair = committees.chair_id OR committee_members.is_chair (site-content.ts isCommitteeChair).
	// Bot chair = committee_members.is_chair only (core/members.ts resolveMemberTier).
	const siteChairOf = new Map<string, Set<string>>();
	const botChairOf = new Map<string, Set<string>>();
	const add = (map: Map<string, Set<string>>, member: string, scope: string) =>
		map.set(member, (map.get(member) ?? new Set()).add(scope));
	for (const c of data.committees) add(siteChairOf, c.chair_id, c.id);
	for (const l of data.committeeLinks) {
		if (l.flag) {
			add(siteChairOf, l.member_id, l.scope_id);
			add(botChairOf, l.member_id, l.scope_id);
		}
	}
	const committeeMemberOf = new Set(data.committeeLinks.map((l) => l.member_id));
	const leadOf = new Map<string, Set<string>>();
	for (const l of data.projectLinks) if (l.flag) add(leadOf, l.member_id, l.scope_id);
	const livePageEditors = data.pageEditors.filter((e) => !e.expires_at || e.expires_at > now);
	const editorOf = new Map<string, string[]>();
	for (const e of livePageEditors)
		editorOf.set(e.member_id, [...(editorOf.get(e.member_id) ?? []), scopeTitle(e.scope_type, e.scope_id)]);
	const profileOf = new Map(data.officerProfiles.filter((p) => p.member_id).map((p) => [p.member_id!, p]));

	// Everyone with any privilege beyond a plain member.
	const privileged = data.members.filter(
		(m) =>
			m.administrator ||
			m.officer_status ||
			(grantsBy.get(m.id) ?? []).some(liveGrant) ||
			siteChairOf.has(m.id) ||
			leadOf.has(m.id) ||
			editorOf.has(m.id) ||
			profileOf.has(m.id),
	);

	const people = privileged.map((m) => {
		const permissions = (grantsBy.get(m.id) ?? []).filter(liveGrant).map((g) => g.permission);
		const subject = {
			administrator: m.administrator,
			officerStatus: m.officer_status,
			officerRole: m.officer_role,
			permissions,
		};
		const effective = CAPABILITY_KEYS.filter((cap) => hasCapability(subject, cap));
		const tier = computeRoleTier({
			administrator: m.administrator,
			officerStatus: m.officer_status,
			officerRole: m.officer_role,
			isCommitteeChair: botChairOf.has(m.id),
			isProjectLead: leadOf.has(m.id),
			isCommitteeMember: committeeMemberOf.has(m.id),
		});
		const role = m.administrator
			? m.officer_status
				? `Admin + officer (${m.officer_role ?? 'no role'})`
				: 'Admin'
			: m.officer_status
				? `${isExecRole(m.officer_role) ? 'Exec officer' : 'Officer'} (${m.officer_role ?? 'no role'})`
				: 'Member';
		return {
			memberId: m.id,
			name: nameOf(m.id),
			role,
			discordLinked: Boolean(m.discord_id),
			grants: permissions,
			effective,
			chairs: [...(siteChairOf.get(m.id) ?? [])].map((id) => committeeTitle.get(id) ?? id),
			leads: [...(leadOf.get(m.id) ?? [])].map((id) => projectTitle.get(id) ?? id),
			pageEditor: editorOf.get(m.id) ?? [],
			officerProfile: profileOf.get(m.id)?.display_name ?? null,
			botTier: PermissionLevelNames[tier],
		};
	});

	// ---- findings ------------------------------------------------------------
	const findings: Finding[] = [];
	const f = (severity: Severity, code: string, message: string) => findings.push({ severity, code, message });

	for (const m of data.members.filter((x) => x.officer_status && !x.administrator && !isExecRole(x.officer_role))) {
		if (!siteChairOf.has(m.id)) {
			const s = suggestCommittee(m.officer_role, data.committees);
			f(
				'action',
				'officer-unlinked',
				`${nameOf(m.id)} (${m.officer_role ?? 'no role'}) is a non-exec officer who chairs no committee — ` +
					`under committee scoping they can't edit or manage ANY committee.` +
					(s ? ` Suggested: set as chair of "${s.title}".` : ''),
			);
		}
	}
	for (const m of data.members.filter((x) => x.officer_status && !x.officer_role))
		f('warn', 'officer-no-role', `${nameOf(m.id)} has officer_status but no officer_role.`);
	for (const m of privileged.filter((x) => (x.administrator || x.officer_status) && !x.discord_id))
		f('warn', 'no-discord', `${nameOf(m.id)} is ${m.administrator ? 'an admin' : 'an officer'} with no discord_id — the bot treats them as GUEST.`);
	for (const m of privileged.filter((x) => !x.active))
		f('warn', 'inactive-privileged', `${nameOf(m.id)} is marked inactive but still holds privileges.`);
	for (const m of data.members.filter((x) => x.administrator && !x.officer_status))
		f('info', 'admin-not-officer', `${nameOf(m.id)} is an admin but not an officer (fine if intended — admin implies everything).`);

	for (const g of data.grants) {
		const who = nameOf(g.member_id);
		if (!isCapability(g.permission))
			f('warn', 'unknown-capability', `${who} holds "${g.permission}", which no code checks (legacy key).`);
		if (g.context_type !== 'global')
			f(
				'warn',
				'scoped-grant',
				`${who}'s ${g.permission} is scoped to ${scopeTitle(g.context_type, g.context_id ?? '')}, but scoped grants act site-wide and the members UI can't revoke them (D4).`,
			);
		if (g.active && g.expires_at && g.expires_at <= now)
			f('info', 'expired-active', `${who}'s ${g.permission} expired ${g.expires_at.toISOString().slice(0, 10)} but is still active=true (ignored by the app; shown in /admin/members — D5).`);
		if (liveGrant(g) && g.granted_by_id) {
			const by = byId.get(g.granted_by_id);
			if (by && !by.administrator && !by.officer_status)
				f('info', 'granted-by-former', `${who}'s ${g.permission} was granted by ${nameOf(by.id)}, who is no longer an officer/admin.`);
		}
		const target = byId.get(g.member_id);
		// Redundant = their role already implies it (without any grants).
		const roleOnly = target && { administrator: target.administrator, officerStatus: target.officer_status, officerRole: target.officer_role, permissions: [] };
		if (liveGrant(g) && roleOnly && isCapability(g.permission) && hasCapability(roleOnly, g.permission))
			f('info', 'redundant-grant', `${who}'s ${g.permission} grant is redundant — their role already includes it.`);
	}

	for (const c of data.committees) {
		const chair = byId.get(c.chair_id);
		const isChairRow = data.committeeLinks.some((l) => l.scope_id === c.id && l.member_id === c.chair_id && l.flag);
		if (!isChairRow)
			f('warn', 'chair-id-only', `${c.title}: chair ${nameOf(c.chair_id)} is set via committees.chair_id but not committee_members.is_chair — the bot won't see them as chair (D7).`);
		if (chair && !chair.officer_status && !chair.administrator)
			f('info', 'chair-not-officer', `${c.title}: chair ${nameOf(chair.id)} is not an officer.`);
	}
	for (const e of data.pageEditors.filter((x) => x.expires_at && x.expires_at <= now))
		f('info', 'expired-page-editor', `${nameOf(e.member_id)}'s page-editor access to ${scopeTitle(e.scope_type, e.scope_id)} has expired.`);
	for (const p of data.officerProfiles.filter((x) => x.active && !x.member_id))
		f('info', 'profile-unlinked', `Officer profile "${p.display_name}" isn't linked to a member — nobody can self-edit it.`);
	for (const p of data.officerProfiles.filter((x) => x.active && x.member_id)) {
		const m = byId.get(p.member_id!);
		if (m && !m.officer_status && !m.administrator)
			f('info', 'profile-non-officer', `Officer profile "${p.display_name}" is linked to ${nameOf(m.id)}, who isn't an officer.`);
	}

	// Duplicate identities (no emails printed — just which field matched).
	const dupBy = (label: string, keyOf: (m: MemberRow) => string | null) => {
		const groups = new Map<string, MemberRow[]>();
		for (const m of data.members) {
			const k = keyOf(m);
			if (k) groups.set(k, [...(groups.get(k) ?? []), m]);
		}
		for (const g of groups.values())
			if (g.length > 1 && g.some((m) => privileged.includes(m)))
				f('warn', 'duplicate-member', `${g.map((m) => nameOf(m.id)).join(' / ')} — ${g.length} member rows share the same ${label}.`);
	};
	dupBy('name', (m) => `${m.first_name} ${m.last_name}`.trim().toLowerCase() || null);
	dupBy('UCF email', (m) => m.ucf_email?.toLowerCase() ?? null);
	for (const d of data.dupUsers) f('warn', 'duplicate-user', `${d.n} login accounts share one Discord id.`);

	// Delegation setting.
	const raw = Array.isArray(data.setting?.value) ? (data.setting.value as string[]) : [];
	const delegable = raw.filter((c) => (OFFICER_DELEGABLE_CAPABILITIES as readonly string[]).includes(c));

	const order: Record<Severity, number> = { action: 0, warn: 1, info: 2 };
	findings.sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code));

	return {
		people,
		findings,
		delegable,
		counts: {
			members: data.members.length,
			admins: data.members.filter((m) => m.administrator).length,
			officers: data.members.filter((m) => m.officer_status).length,
			execOfficers: data.members.filter((m) => m.officer_status && isExecRole(m.officer_role)).length,
			liveGrants: data.grants.filter(liveGrant).length,
			committees: data.committees.length,
			projects: data.projects.length,
			pageEditors: livePageEditors.length,
		},
		grants: data.grants.map((g) => ({
			member: nameOf(g.member_id),
			permission: g.permission,
			context: g.context_type === 'global' ? 'global' : scopeTitle(g.context_type, g.context_id ?? ''),
			grantedBy: nameOf(g.granted_by_id),
			active: g.active,
			expires: g.expires_at?.toISOString().slice(0, 10) ?? null,
			live: liveGrant(g),
		})),
		committees: data.committees.map((c) => ({
			title: c.title,
			active: c.active,
			chairs: [
				...new Set([
					nameOf(c.chair_id),
					...data.committeeLinks.filter((l) => l.scope_id === c.id && l.flag).map((l) => nameOf(l.member_id)),
				]),
			],
			members: data.committeeLinks.filter((l) => l.scope_id === c.id).length,
		})),
		projects: data.projects.map((p) => ({
			title: p.title,
			active: p.active,
			leads: data.projectLinks.filter((l) => l.scope_id === p.id && l.flag).map((l) => nameOf(l.member_id)),
			members: data.projectLinks.filter((l) => l.scope_id === p.id).length,
		})),
		pageEditors: data.pageEditors.map((e) => ({
			member: nameOf(e.member_id),
			scope: scopeTitle(e.scope_type, e.scope_id),
			grantedBy: nameOf(e.granted_by_member_id),
			expires: e.expires_at?.toISOString().slice(0, 10) ?? null,
		})),
	};
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const CAP_SHORT: Record<Capability, string> = {
	scan_attendance: 'scan',
	manage_events: 'events',
	manage_event_photos: 'photos',
	manage_projects: 'projects',
	manage_site_content: 'site',
	review_resumes: 'résumés',
	manage_links: 'links',
	upload_resume: 'upload',
};

function toMarkdown(r: ReturnType<typeof analyze>) {
	const cell = (s: string) => s.replace(/\|/g, '\\|');
	const table = (head: string[], rows: string[][]) =>
		[`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join(
			'\n',
		);
	const icon: Record<Severity, string> = { action: '🔴 ACTION', warn: '🟠 warn', info: '⚪ info' };
	const c = r.counts;
	return [
		`# Permission audit — ${url.hostname}/${url.pathname.slice(1)}`,
		'',
		`_Generated ${new Date().toISOString()} · read-only · contains member names, do not commit._`,
		'',
		`${c.members} members · ${c.admins} admins · ${c.officers} officers (${c.execOfficers} exec) · ${c.liveGrants} live grants · ` +
			`${c.committees} committees · ${c.projects} projects · ${c.pageEditors} live page editors`,
		'',
		'## Findings',
		'',
		r.findings.length ? table(['', 'Code', 'Detail'], r.findings.map((x) => [icon[x.severity], x.code, x.message])) : 'None.',
		'',
		'## Who has what (effective)',
		'',
		'Effective = what `hasCapability` actually returns, i.e. role-implied + live grants. ✓ = has it.',
		'',
		table(
			['Person', 'Role', ...CAPABILITY_KEYS.map((k) => CAP_SHORT[k]), 'Chairs', 'Leads', 'Page editor', 'Bot tier', 'Discord'],
			r.people.map((p) => [
				p.name,
				p.role,
				...CAPABILITY_KEYS.map((k) => (p.effective.includes(k) ? (p.grants.includes(k) ? '✓ (grant)' : '✓') : '')),
				p.chairs.join(', '),
				p.leads.join(', '),
				p.pageEditor.join(', '),
				p.botTier,
				p.discordLinked ? '✓' : '✗',
			]),
		),
		'',
		'## Capability grants (raw `member_permissions`)',
		'',
		r.grants.length
			? table(
					['Member', 'Capability', 'Context', 'Granted by', 'Active', 'Expires', 'Live'],
					r.grants.map((g) => [g.member, g.permission, g.context, g.grantedBy, g.active ? '✓' : '✗', g.expires ?? '—', g.live ? '✓' : '✗']),
				)
			: 'None.',
		'',
		'## Committees',
		'',
		table(['Committee', 'Active', 'Chair(s)', 'Members'], r.committees.map((x) => [x.title, x.active ? '✓' : '✗', x.chairs.join(', '), String(x.members)])),
		'',
		'## Projects',
		'',
		table(['Project', 'Active', 'Lead(s)', 'Members'], r.projects.map((x) => [x.title, x.active ? '✓' : '✗', x.leads.join(', ') || '—', String(x.members)])),
		'',
		'## Page editors',
		'',
		r.pageEditors.length
			? table(['Member', 'Page', 'Granted by', 'Expires'], r.pageEditors.map((e) => [e.member, e.scope, e.grantedBy, e.expires ?? '—']))
			: 'None.',
		'',
		'## Officer delegation setting',
		'',
		`Officers may grant: ${r.delegable.length ? r.delegable.map((d) => `\`${d}\``).join(', ') : '_nothing (admins only)_'}`,
		'',
	].join('\n');
}

async function main() {
	const report = analyze(await load());
	const md = toMarkdown(report);
	console.log(md);
	if (MD_OUT || JSON_OUT) mkdirSync(AUDIT_DIR, { recursive: true });
	if (MD_OUT) {
		const out = join(AUDIT_DIR, basename(MD_OUT));
		writeFileSync(out, md);
		console.error(`\nWrote ${out}`);
	}
	if (JSON_OUT) {
		const out = join(AUDIT_DIR, basename(JSON_OUT));
		writeFileSync(out, JSON.stringify({ database: `${url.hostname}/${url.pathname.slice(1)}`, generatedAt: new Date(), ...report }, null, 2));
		console.error(`Wrote ${out}`);
	}
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
