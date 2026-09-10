import { and, desc, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import {
	Members,
	Users,
	Committees,
	CommitteeMembers,
	Projects,
	ProjectMembers,
	Events,
	EventAttendees,
	MemberPermissions,
	majorEnums,
	officerRoleEnum,
} from '@watts/db/schema';
import {
	CAPABILITY_KEYS,
	isCapability,
	isOfficerDelegable,
	type CapabilitySubject,
} from '@watts/permissions';
import { computeRoleTier, type PermissionLevel } from '@watts/permissions/tier';
import { DomainError } from './errors';
import { getOfficerGrantableCapabilities } from './settings';

type MajorEnum = (typeof majorEnums.enumValues)[number];
type OfficerRole = (typeof officerRoleEnum.enumValues)[number];
type Gender = 'M' | 'F' | 'NB' | 'O' | 'PNTS';

export interface MemberRoles extends CapabilitySubject {
	memberId: string;
	officerStatus: boolean;
	officerRole: string | null;
	administrator: boolean;
	permissions: string[];
}

/**
 * Resolve a member's role facts from the auth user id: the `members` row flags
 * plus the set of *active, non-expired* granular capability grants.
 *
 * This is the ONE place member roles are resolved — the tRPC procedure gates and
 * the NextAuth session callback both call it. It was previously duplicated four
 * times, twice without the `expiresAt` guard (a latent bug this fixes).
 *
 * The return shape satisfies @watts/permissions `CapabilitySubject`, so it drops
 * straight into `hasCapability`.
 */
export async function resolveMemberRoles(db: WattsDb, userId: string): Promise<MemberRoles | null> {
	const [member] = await db
		.select({
			id: Members.id,
			officerStatus: Members.officerStatus,
			officerRole: Members.officerRole,
			administrator: Members.administrator,
		})
		.from(Members)
		.where(eq(Members.userId, userId))
		.limit(1);

	if (!member) return null;

	const grants = await db
		.select({ permission: MemberPermissions.permission })
		.from(MemberPermissions)
		.where(
			and(
				eq(MemberPermissions.memberId, member.id),
				eq(MemberPermissions.active, true),
				or(isNull(MemberPermissions.expiresAt), gt(MemberPermissions.expiresAt, new Date())),
			),
		);

	return {
		memberId: member.id,
		officerStatus: member.officerStatus,
		officerRole: member.officerRole ?? null,
		administrator: member.administrator,
		permissions: [...new Set(grants.map((g) => g.permission))],
	};
}

// ---- lookups ----

/** Every member row, unfiltered. Admin screens. */
export function listMembers(db: WattsDb) {
	return db.select().from(Members);
}

export async function getMemberById(db: WattsDb, id: string) {
	const [member] = await db.select().from(Members).where(eq(Members.id, id)).limit(1);
	if (!member) throw new DomainError('NOT_FOUND', 'Member not found');
	return member;
}

export async function getMemberByUserId(db: WattsDb, userId: string) {
	const member = await findMemberByUserId(db, userId);
	if (!member) throw new DomainError('NOT_FOUND', 'No member profile found');
	return member;
}

/** Like getMemberByUserId but returns null instead of throwing. */
export async function findMemberByUserId(db: WattsDb, userId: string) {
	const [member] = await db.select().from(Members).where(eq(Members.userId, userId)).limit(1);
	return member ?? null;
}

/**
 * Full permission-tier resolution for a Discord member: the `members` row by
 * `discordId` plus committee/project memberships, collapsed to the bot's ordinal
 * `PermissionLevel` (`@watts/permissions/tier`). `opts.isConfigOwner` short-circuits
 * to ADMINISTRATOR; an unknown discordId → GUEST.
 */
export async function resolveMemberTier(
	db: WattsDb,
	discordId: string,
	opts: { isConfigOwner?: boolean } = {},
): Promise<PermissionLevel> {
	const [member] = await db
		.select({
			id: Members.id,
			administrator: Members.administrator,
			officerStatus: Members.officerStatus,
			officerRole: Members.officerRole,
		})
		.from(Members)
		.where(eq(Members.discordId, discordId))
		.limit(1);

	if (!member) return computeRoleTier(null, opts);

	const committeeLinks = await db
		.select({ isChair: CommitteeMembers.isChair })
		.from(CommitteeMembers)
		.where(eq(CommitteeMembers.memberId, member.id));
	const projectLinks = await db
		.select({ isLead: ProjectMembers.isLead })
		.from(ProjectMembers)
		.where(eq(ProjectMembers.memberId, member.id));

	return computeRoleTier(
		{
			administrator: member.administrator,
			officerStatus: member.officerStatus,
			officerRole: member.officerRole ?? null,
			isCommitteeChair: committeeLinks.some((c) => c.isChair),
			isProjectLead: projectLinks.some((p) => p.isLead),
			isCommitteeMember: committeeLinks.length > 0,
		},
		opts,
	);
}

/**
 * Rich member list for the members-management screen: status flags, résumé
 * indicator, committees, granted capabilities, and the linked Discord account.
 */
export async function listMembersForAdmin(db: WattsDb) {
	const rows = await db
		.select({
			id: Members.id,
			userId: Members.userId,
			firstName: Members.firstName,
			middleName: Members.middleName,
			lastName: Members.lastName,
			personalEmail: Members.personalEmail,
			ucfEmail: Members.ucfEmail,
			major: Members.major,
			graduationYear: Members.graduationYear,
			administrator: Members.administrator,
			officerStatus: Members.officerStatus,
			officerRole: Members.officerRole,
			duesPaid: Members.duesPaid,
			active: Members.active,
			memberDiscordId: Members.discordId,
			resumeUploadedAt: Members.resumeUploadedAt,
			hasResume: Members.resumeKey,
			resumeUrl: Members.resumeURL,
			createdAt: Members.createdAt,
			userName: Users.name,
			userEmail: Users.email,
			userDiscordId: Users.discordId,
		})
		.from(Members)
		.leftJoin(Users, eq(Members.userId, Users.id))
		.orderBy(Members.lastName, Members.firstName);

	const memberIds = rows.map((r) => r.id);

	// inArray([]) is a safe no-match in drizzle, so no length guard needed.
	const committeeLinks = await db
		.select({
			memberId: CommitteeMembers.memberId,
			committeeId: CommitteeMembers.committeeId,
			isChair: CommitteeMembers.isChair,
			title: Committees.title,
			slug: Committees.slug,
		})
		.from(CommitteeMembers)
		.innerJoin(Committees, eq(CommitteeMembers.committeeId, Committees.id))
		.where(inArray(CommitteeMembers.memberId, memberIds));

	const byMember = new Map<string, typeof committeeLinks>();
	for (const link of committeeLinks) {
		const list = byMember.get(link.memberId) ?? [];
		list.push(link);
		byMember.set(link.memberId, list);
	}

	const permRows = await db
		.select({ memberId: MemberPermissions.memberId, permission: MemberPermissions.permission })
		.from(MemberPermissions)
		.where(and(inArray(MemberPermissions.memberId, memberIds), eq(MemberPermissions.active, true)));
	const permsByMember = new Map<string, string[]>();
	for (const p of permRows) {
		const list = permsByMember.get(p.memberId) ?? [];
		if (!list.includes(p.permission)) list.push(p.permission);
		permsByMember.set(p.memberId, list);
	}

	return rows.map((r) => ({
		...r,
		hasResume: Boolean(r.hasResume),
		discordLinked: Boolean(r.userDiscordId || r.memberDiscordId),
		discordId: r.userDiscordId ?? r.memberDiscordId ?? null,
		committees: (byMember.get(r.id) ?? []).map((c) => ({
			id: c.committeeId,
			title: c.title,
			slug: c.slug,
			isChair: c.isChair,
		})),
		permissions: permsByMember.get(r.id) ?? [],
	}));
}

/** All members with résumé status, newest upload first. Résumé-review screen. */
export function listMemberResumes(db: WattsDb) {
	return db
		.select({
			memberId: Members.id,
			firstName: Members.firstName,
			lastName: Members.lastName,
			major: Members.major,
			graduationYear: Members.graduationYear,
			// Fields the résumé-export filter bar reads (grad year / dues / officers).
			// When you add a new export filter dimension, add its column here too — see
			// the NOTE in apps/ieeeucfcom/src/lib/resume-export/filters.ts.
			duesPaid: Members.duesPaid,
			officerStatus: Members.officerStatus,
			resumeFileName: Members.resumeFileName,
			resumeUploadedAt: Members.resumeUploadedAt,
			resumeUrl: Members.resumeURL,
			resumeOnedrivePath: Members.resumeOnedrivePath,
			hasResume: isNotNull(Members.resumeKey),
		})
		.from(Members)
		.orderBy(desc(Members.resumeUploadedAt), Members.lastName);
}

/**
 * Members with an uploaded résumé — storage key plus the fields the bulk export
 * needs to name each file. Filtered to rows that actually have a `resumeKey`.
 */
export function listResumesForExport(db: WattsDb) {
	return db
		.select({
			memberId: Members.id,
			firstName: Members.firstName,
			lastName: Members.lastName,
			major: Members.major,
			graduationYear: Members.graduationYear,
			// Consumed by matchesResumeFilter() / applyResumeSelection() in the export
			// route. New filter dimension → add its column here as well.
			duesPaid: Members.duesPaid,
			officerStatus: Members.officerStatus,
			resumeUploadedAt: Members.resumeUploadedAt,
			resumeKey: Members.resumeKey,
			resumeFileName: Members.resumeFileName,
		})
		.from(Members)
		.where(isNotNull(Members.resumeKey))
		.orderBy(Members.graduationYear, Members.lastName);
}

// ---- registration + profile ----

export interface RegisterMemberInput {
	userId: string;
	discordId: string;
	firstName: string;
	middleName?: string;
	lastName: string;
	personalEmail: string;
	ucfEmail: string;
	dateOfBirth: string;
	phoneNumber?: string;
	gender: Gender;
	graduationYear: number;
	major: MajorEnum;
}

/** Create the member profile for a signed-in user. Throws CONFLICT if one exists. */
export async function registerMember(db: WattsDb, input: RegisterMemberInput) {
	const existing = await db
		.select()
		.from(Members)
		.where(eq(Members.userId, input.userId))
		.limit(1);
	if (existing.length > 0) {
		throw new DomainError('CONFLICT', 'member profile already exists!');
	}

	const [member] = await db
		.insert(Members)
		.values({
			userId: input.userId,
			discordId: input.discordId,
			firstName: input.firstName,
			middleName: input.middleName || null,
			lastName: input.lastName,
			personalEmail: input.personalEmail,
			ucfEmail: input.ucfEmail,
			dateOfBirth: input.dateOfBirth,
			phoneNumber: input.phoneNumber || null,
			gender: input.gender,
			graduationYear: input.graduationYear,
			major: input.major,
			officerStatus: false,
			administrator: false,
			duesPaid: false,
			active: true,
			officerRole: null,
			biography: null,
			resumeURL: null,
			linkedinURL: null,
			githubURL: null,
			websiteURL: null,
		})
		.returning();

	return { member };
}

export interface UpdateMemberProfileInput {
	firstName?: string;
	middleName?: string;
	lastName?: string;
	biography?: string;
	phoneNumber?: string;
	major: MajorEnum;
	graduationYear?: number;
	gender?: Gender;
	linkedinURL?: string;
	githubURL?: string;
	websiteURL?: string;
}

/** Patch the signed-in member's own profile. Throws NOT_FOUND if absent. */
export async function updateMemberProfile(
	db: WattsDb,
	userId: string,
	patch: UpdateMemberProfileInput,
) {
	const [updated] = await db
		.update(Members)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(Members.userId, userId))
		.returning();
	if (!updated) throw new DomainError('NOT_FOUND', 'Profile not found');
	return { member: updated };
}

// ---- role / capability administration ----

export interface CapabilityActor {
	/** auth user id of whoever is performing the grant */
	userId: string;
	administrator: boolean;
}

/**
 * Grant / revoke a global-scope granular capability.
 *
 * Admins may grant any capability to anyone. A non-admin officer may only
 * grant/revoke a capability an admin has delegated (settings
 * officerGrantableCapabilities ⊆ OFFICER_DELEGABLE_CAPABILITIES) and only to a
 * plain member — never to another officer or an admin.
 */
export async function setMemberCapability(
	db: WattsDb,
	actor: CapabilityActor,
	args: { memberId: string; permission: string; granted: boolean },
) {
	if (!isCapability(args.permission)) {
		throw new DomainError('BAD_REQUEST', `Unknown capability. Valid: ${CAPABILITY_KEYS.join(', ')}`);
	}

	const [target] = await db
		.select({
			id: Members.id,
			administrator: Members.administrator,
			officerStatus: Members.officerStatus,
		})
		.from(Members)
		.where(eq(Members.id, args.memberId))
		.limit(1);
	if (!target) throw new DomainError('NOT_FOUND', 'Member not found');

	if (!actor.administrator) {
		const allowed = await getOfficerGrantableCapabilities(db);
		if (!isOfficerDelegable(args.permission) || !allowed.includes(args.permission)) {
			throw new DomainError('FORBIDDEN', "Officers aren't allowed to grant this capability.");
		}
		if (target.administrator || target.officerStatus) {
			throw new DomainError('FORBIDDEN', 'Officers can only change capabilities for regular members.');
		}
	}

	// Clear any existing global rows for this capability, then re-add if granting.
	await db
		.delete(MemberPermissions)
		.where(
			and(
				eq(MemberPermissions.memberId, args.memberId),
				eq(MemberPermissions.permission, args.permission),
				eq(MemberPermissions.contextType, 'global'),
			),
		);

	if (args.granted) {
		const [grantedByMember] = await db
			.select({ id: Members.id })
			.from(Members)
			.where(eq(Members.userId, actor.userId))
			.limit(1);
		await db.insert(MemberPermissions).values({
			memberId: args.memberId,
			grantedById: grantedByMember?.id ?? null,
			contextType: 'global',
			contextId: null,
			permission: args.permission,
			active: true,
		});
	}

	return { permission: args.permission, granted: args.granted };
}

/**
 * Grant / revoke administrator. `actingUserId` cannot clear their own admin
 * (self-lockout guard).
 */
export async function setMemberAdmin(
	db: WattsDb,
	args: { id: string; value: boolean; actingUserId: string },
) {
	const [self] = await db
		.select({ id: Members.id })
		.from(Members)
		.where(eq(Members.userId, args.actingUserId))
		.limit(1);
	if (self?.id === args.id && args.value === false) {
		throw new DomainError('BAD_REQUEST', "You can't remove your own administrator access.");
	}

	const [updated] = await db
		.update(Members)
		.set({ administrator: args.value, updatedAt: new Date() })
		.where(eq(Members.id, args.id))
		.returning();
	if (!updated) throw new DomainError('NOT_FOUND', 'Member not found');
	return { member: updated };
}

/**
 * Set officer status and (optionally) role in one call. Clearing status clears
 * the role. Backs member.setOfficer AND officer.promote / officer.demote.
 */
export async function setMemberOfficer(
	db: WattsDb,
	args: { id: string; officerStatus: boolean; officerRole?: OfficerRole | null },
) {
	const [updated] = await db
		.update(Members)
		.set({
			officerStatus: args.officerStatus,
			officerRole: args.officerStatus ? (args.officerRole ?? null) : null,
			updatedAt: new Date(),
		})
		.where(eq(Members.id, args.id))
		.returning();
	if (!updated) throw new DomainError('NOT_FOUND', 'Member not found');
	return { member: updated };
}

// ---- whois: DB lookup + prose summary (used by the Discord bot's /whois) ----

export interface Pronouns {
	/** he / she / they */
	subject: string;
	/** him / her / them */
	object: string;
	/** his / her / their */
	possessive: string;
}

/**
 * Derive pronouns from the `members.gender` enum (`M | F | NB | O | PNTS`).
 * `NB`, `O`, and `PNTS` all resolve to they/them — the safe neutral default.
 * There is no dedicated `pronouns` column yet.
 */
export function pronounsForGender(gender: string | null | undefined): Pronouns {
	if (gender === 'M') return { subject: 'he', object: 'him', possessive: 'his' };
	if (gender === 'F') return { subject: 'she', object: 'her', possessive: 'her' };
	return { subject: 'they', object: 'them', possessive: 'their' };
}

type WhoisMember = typeof Members.$inferSelect;

export interface WhoisProfile {
	member: WhoisMember;
	pronouns: Pronouns;
	committees: { title: string; isChair: boolean }[];
	projects: { title: string; isLead: boolean }[];
	lastEvent: { title: string; startTime: string; attendedAt: Date } | null;
}

export type WhoisResult =
	| { status: 'found'; profile: WhoisProfile }
	/** a Discord user with no `members` row */
	| { status: 'not-registered'; query: string }
	/** a name search that matched nothing */
	| { status: 'no-match'; query: string }
	/** a name search that matched more than one active member */
	| { status: 'ambiguous'; query: string; names: string[] };

async function hydrateWhois(db: WattsDb, member: WhoisMember): Promise<WhoisProfile> {
	const committees = await db
		.select({ title: Committees.title, isChair: CommitteeMembers.isChair })
		.from(CommitteeMembers)
		.innerJoin(Committees, eq(Committees.id, CommitteeMembers.committeeId))
		.where(eq(CommitteeMembers.memberId, member.id));

	const projects = await db
		.select({ title: Projects.title, isLead: ProjectMembers.isLead })
		.from(ProjectMembers)
		.innerJoin(Projects, eq(Projects.id, ProjectMembers.projectId))
		.where(eq(ProjectMembers.memberId, member.id));

	const [lastEvent] = await db
		.select({
			title: Events.title,
			startTime: Events.startTime,
			attendedAt: EventAttendees.timestamp,
		})
		.from(EventAttendees)
		.innerJoin(Events, eq(Events.id, EventAttendees.eventId))
		.where(eq(EventAttendees.memberId, member.id))
		// check-in time first; `startTime desc` breaks ties (seed rows share a timestamp)
		.orderBy(desc(EventAttendees.timestamp), desc(Events.startTime))
		.limit(1);

	return {
		member,
		pronouns: pronounsForGender(member.gender),
		committees,
		projects,
		lastEvent: lastEvent
			? {
					title: lastEvent.title,
					startTime: lastEvent.startTime,
					attendedAt: lastEvent.attendedAt as Date,
				}
			: null,
	};
}

/**
 * Resolve a `/whois` lookup by Discord id or by (fuzzy) name.
 *  - `{ discordId }` — exact match on `members.discord_id`; a miss is `not-registered`.
 *  - `{ name }` — case-insensitive substring on "First Last" over *active* members;
 *    0 → `no-match`, >1 → `ambiguous`, 1 → `found`.
 */
export async function resolveWhois(
	db: WattsDb,
	query: { discordId: string; label?: string } | { name: string },
): Promise<WhoisResult> {
	if ('discordId' in query) {
		const [member] = await db
			.select()
			.from(Members)
			.where(eq(Members.discordId, query.discordId))
			.limit(1);
		if (!member) {
			return { status: 'not-registered', query: query.label ?? query.discordId };
		}
		return { status: 'found', profile: await hydrateWhois(db, member) };
	}

	const needle = query.name.trim().toLowerCase();
	const active = await db.select().from(Members).where(eq(Members.active, true));
	const matches = active.filter((m) =>
		`${m.firstName} ${m.lastName}`.toLowerCase().includes(needle),
	);

	const [first] = matches;
	if (!first) return { status: 'no-match', query: query.name };
	if (matches.length > 1) {
		return {
			status: 'ambiguous',
			query: query.name,
			names: matches.slice(0, 10).map((m) => `${m.firstName} ${m.lastName}`),
		};
	}
	return { status: 'found', profile: await hydrateWhois(db, first) };
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One-paragraph natural-language summary of a `resolveWhois` result. Pure — no
 * discord.js. `opts.mention` (a pre-rendered `<@id>` or a bare name) leads the
 * sentence when present.
 */
export function formatWhois(result: WhoisResult, opts: { mention?: string } = {}): string {
	if (result.status === 'not-registered') {
		return `**${result.query}** isn't registered on the IEEE website.`;
	}
	if (result.status === 'no-match') {
		return `No member matches **${result.query}**.`;
	}
	if (result.status === 'ambiguous') {
		return `Multiple members match **${result.query}** — be more specific:\n${result.names.join('\n')}`;
	}

	const { member, pronouns, lastEvent } = result.profile;
	const fullName = [member.firstName, member.middleName, member.lastName]
		.filter(Boolean)
		.join(' ');
	const lead = opts.mention ?? `**${fullName}**`;
	const isThey = pronouns.subject === 'they';
	const verbPresent = isThey ? 'are' : 'is';
	const verbPast = isThey ? 'were' : 'was';
	const inactive = member.active ? '' : ' _(inactive)_';

	const sentences = [
		`${lead} is **${fullName}**, a **${member.major}** major expecting to graduate in **${member.graduationYear}**.${inactive}`,
		member.officerStatus && member.officerRole
			? `${capFirst(pronouns.subject)} ${verbPresent} also an officer, serving as **${member.officerRole}**.`
			: `${capFirst(pronouns.subject)} ${verbPresent} a general member.`,
	];

	if (lastEvent) {
		const when = new Date(lastEvent.startTime).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
		});
		sentences.push(
			`${capFirst(pronouns.subject)} ${verbPast} last seen at **${lastEvent.title}** on ${when}.`,
		);
	}

	const links: string[] = [];
	if (member.linkedinURL) links.push(`[LinkedIn](${member.linkedinURL})`);
	if (member.githubURL) links.push(`[GitHub](${member.githubURL})`);
	if (member.websiteURL) links.push(`[Website](${member.websiteURL})`);
	if (links.length > 0) {
		sentences.push(`Find ${pronouns.object} online: ${links.join(' · ')}.`);
	}

	return sentences.join(' ');
}
