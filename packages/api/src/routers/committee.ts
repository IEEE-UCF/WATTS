// Rough committee management — membership assignment for the Staff Hub's Committees &
// Projects panel. Not the full CMS: no photo uploads, no discordRoleId wiring, no editing
// beyond create. See project-cms-todo memory / the dashboard-widgets plan for what's deferred.
//
// Scoping: any officer can SEE every committee and its members, but only an executive
// officer / admin, or an officer who chairs THAT committee, can change its members or
// chairs (see docs/PERMISSIONS.md).
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { WattsDb } from '@watts/db';
import type { MemberRoles } from '@watts/core/members';
import { isExecutive } from '@watts/permissions';
import { adminProcedure, officerProcedure, createTRPCRouter } from '../trpc';
import {
	listCommitteesWithCounts,
	createCommittee,
	listCommitteeMembers,
	addCommitteeMember,
	removeCommitteeMember,
	setCommitteeChair,
} from '@watts/core/committees';
import { isCommitteeChair } from '@watts/core/site-content';
import { mapDomainError } from '../map-domain-error';

async function canManageCommittee(db: WattsDb, roles: MemberRoles, committeeId: string): Promise<boolean> {
	if (isExecutive(roles)) return true;
	return isCommitteeChair(db, committeeId, roles.memberId);
}

async function assertCanManageCommittee(ctx: { db: WattsDb; roles: MemberRoles }, committeeId: string) {
	if (!(await canManageCommittee(ctx.db, ctx.roles, committeeId))) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'Only an executive officer or this committee’s chair can change its members',
		});
	}
}

/** A non-executive chair removing themselves would lock themselves out of the committee. */
function assertNotSelfLockout(roles: MemberRoles, memberId: string) {
	if (!isExecutive(roles) && memberId === roles.memberId) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'You can’t remove yourself as chair — ask an executive officer',
		});
	}
}

export const committeeRouter = createTRPCRouter({
	getAll: officerProcedure.query(async ({ ctx }) => {
		const committees = await listCommitteesWithCounts(ctx.db);
		return Promise.all(
			committees.map(async (c) => ({ ...c, canManage: await canManageCommittee(ctx.db, ctx.roles, c.id) })),
		);
	}),

	// Committees.chairId is NOT NULL — creating one requires a chair up front.
	create: adminProcedure
		.input(z.object({ title: z.string().min(1).max(255), slug: z.string().max(64).optional(), about: z.string().min(1), chairId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await createCommittee(ctx.db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	listMembers: officerProcedure
		.input(z.object({ committeeId: z.string().uuid() }))
		.query(async ({ ctx, input }) => listCommitteeMembers(ctx.db, input.committeeId)),

	addMember: officerProcedure
		.input(z.object({ committeeId: z.string().uuid(), memberId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await assertCanManageCommittee(ctx, input.committeeId);
			try {
				return await addCommitteeMember(ctx.db, input.committeeId, input.memberId);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	removeMember: officerProcedure
		.input(z.object({ committeeId: z.string().uuid(), memberId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await assertCanManageCommittee(ctx, input.committeeId);
			assertNotSelfLockout(ctx.roles, input.memberId);
			try {
				await removeCommitteeMember(ctx.db, input.committeeId, input.memberId);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	setChair: officerProcedure
		.input(z.object({ committeeId: z.string().uuid(), memberId: z.string().uuid(), isChair: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await assertCanManageCommittee(ctx, input.committeeId);
			if (!input.isChair) assertNotSelfLockout(ctx.roles, input.memberId);
			try {
				return await setCommitteeChair(ctx.db, input.committeeId, input.memberId, input.isChair);
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
