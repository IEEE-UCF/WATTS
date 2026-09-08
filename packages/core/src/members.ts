import { and, desc, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import {
	Members,
	Users,
	Committees,
	CommitteeMembers,
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
	const [member] = await db.select().from(Members).where(eq(Members.userId, userId)).limit(1);
	if (!member) throw new DomainError('NOT_FOUND', 'No member profile found');
	return member;
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
			resumeFileName: Members.resumeFileName,
			resumeUploadedAt: Members.resumeUploadedAt,
			resumeUrl: Members.resumeURL,
			resumeOnedrivePath: Members.resumeOnedrivePath,
			hasResume: isNotNull(Members.resumeKey),
		})
		.from(Members)
		.orderBy(desc(Members.resumeUploadedAt), Members.lastName);
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
