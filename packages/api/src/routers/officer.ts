import { z } from "zod";
import { officerRoleEnum } from "@watts/db/schema";
import {
	publicProcedure,
	adminProcedure,
	capabilityProcedure,
	createTRPCRouter,
} from '../trpc';
import { listOfficers, getOfficerById } from "@watts/core/officers";
import { setMemberOfficer, listMemberResumes } from "@watts/core/members";
import { mapDomainError } from "../map-domain-error";

const reviewResumes = capabilityProcedure("review_resumes");

export const officerRouter = createTRPCRouter({
	// Get all current officers
	getAll: publicProcedure.query(async ({ ctx }) => {
		return listOfficers(ctx.db);
	}),

	// Get a single officer by member id
	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			try {
				return await getOfficerById(ctx.db, input.id);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// Promote a member to officer (admin only)
	promote: adminProcedure
		.input(z.object({ id: z.string().uuid(), officerRole: z.enum(officerRoleEnum.enumValues) }))
		.mutation(async ({ ctx, input }) => {
			try {
				const { member } = await setMemberOfficer(ctx.db, {
					id: input.id,
					officerStatus: true,
					officerRole: input.officerRole,
				});
				return { success: true, officer: member };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// Resume dashboard: all members, with resume status. Officer/admin only.
	listResumes: reviewResumes.query(async ({ ctx }) => {
		return listMemberResumes(ctx.db);
	}),

	// Remove officer status (admin only)
	demote: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await setMemberOfficer(ctx.db, { id: input.id, officerStatus: false })) };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
