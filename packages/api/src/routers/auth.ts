// Read-only "what can this user see" helpers for the frontend (nav links, banners).
//
// The role/permission facts all come from `ctx.getRoles()` — the per-request-memoised
// `resolveMemberRoles` (@watts/core/members), the same resolver the enforcing
// procedures and the NextAuth session callback use. This router does NOT do its own
// `select … from Members`; that used to drift from the resolver (notably: the old
// getAuthStatus built `permissions` without the capability-expiry filter).

import { eq } from 'drizzle-orm';
import { Members, Users } from '@watts/db/schema';
import { publicProcedure, createTRPCRouter } from '../trpc';
import { hasStaffCapability } from '@watts/permissions';

export const authRouter = createTRPCRouter({
	// current session
	getSession: publicProcedure.query(({ ctx }) => ctx.session),

	// check if user is authenticated
	isAuthenticated: publicProcedure.query(({ ctx }): boolean => !!ctx.session?.user),

	// has a members row
	isMember: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
		return (await ctx.getRoles()) !== null;
	}),

	// officer_status = true
	isOfficer: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
		return (await ctx.getRoles())?.officerStatus ?? false;
	}),

	// administrator = true
	isAdmin: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
		return (await ctx.getRoles())?.administrator ?? false;
	}),

	// officer role name, if any
	getOfficerRole: publicProcedure.query(async ({ ctx }): Promise<string | null> => {
		return (await ctx.getRoles())?.officerRole ?? null;
	}),

	// dues_paid is a status flag, not a role — not part of MemberRoles, so this keeps
	// its own narrow read.
	hasPaidDues: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
		if (!ctx.session?.user) return false;
		const [member] = await ctx.db
			.select({ duesPaid: Members.duesPaid })
			.from(Members)
			.where(eq(Members.userId, ctx.session.user.id))
			.limit(1);
		return member?.duesPaid ?? false;
	}),

	// everything the frontend needs in one call
	getAuthStatus: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.session?.user) {
			return {
				isAuthenticated: false,
				isMember: false,
				isOfficer: false,
				isAdmin: false,
				hasPaidDues: false,
				officerRole: null,
				permissions: [] as string[],
				hasStaffAccess: false,
				user: null,
				member: null,
				discordAvatar: null,
			};
		}

		const [userRow] = await ctx.db
			.select()
			.from(Users)
			.where(eq(Users.id, ctx.session.user.id))
			.limit(1);

		const [member] = await ctx.db
			.select()
			.from(Members)
			.where(eq(Members.userId, ctx.session.user.id))
			.limit(1);

		const roles = await ctx.getRoles();
		const permissions = roles?.permissions ?? [];
		const isOfficer = roles?.officerStatus ?? false;
		const isAdmin = roles?.administrator ?? false;

		let discordAvatar = userRow?.image || null;
		if (!discordAvatar && userRow?.discordId) {
			discordAvatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(userRow.discordId) % 5}.png`;
		}

		return {
			isAuthenticated: true,
			isMember: !!member,
			isOfficer,
			isAdmin,
			hasPaidDues: member?.duesPaid || false,
			officerRole: roles?.officerRole ?? member?.officerRole ?? null,
			permissions,
			// Can this person reach /staff? admin, officer, or any *staff* capability
			// (a member-facing grant like `upload_resume` does not count).
			hasStaffAccess: isAdmin || isOfficer || hasStaffCapability(permissions),
			user: ctx.session.user,
			member: member || null,
			profile: ctx.session.user.discordId,
			discordAvatar,
		};
	}),
});
