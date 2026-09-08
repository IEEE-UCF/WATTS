import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Members, MemberPermissions } from '@watts/db/schema';
import type { CapabilitySubject } from '@watts/permissions';

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
