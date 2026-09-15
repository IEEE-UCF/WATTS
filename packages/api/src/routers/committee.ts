// Rough committee management — membership assignment for the Staff Hub's Committees &
// Projects panel. Not the full CMS: no photo uploads, no discordRoleId wiring, no editing
// beyond create. See project-cms-todo memory / the dashboard-widgets plan for what's deferred.
import { z } from 'zod';
import { adminProcedure, officerProcedure, createTRPCRouter } from '../trpc';
import {
	listCommitteesWithCounts,
	createCommittee,
	listCommitteeMembers,
	addCommitteeMember,
	removeCommitteeMember,
	setCommitteeChair,
} from '@watts/core/committees';
import { mapDomainError } from '../map-domain-error';

export const committeeRouter = createTRPCRouter({
	getAll: officerProcedure.query(async ({ ctx }) => listCommitteesWithCounts(ctx.db)),

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
			try {
				return await addCommitteeMember(ctx.db, input.committeeId, input.memberId);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	removeMember: officerProcedure
		.input(z.object({ committeeId: z.string().uuid(), memberId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
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
			try {
				return await setCommitteeChair(ctx.db, input.committeeId, input.memberId, input.isChair);
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
