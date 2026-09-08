import { z } from "zod";
import { db } from "@/lib/database/client";
import { officerRoleEnum } from "@watts/db/schema";
import {
	publicProcedure,
	adminProcedure,
	capabilityProcedure,
	createTRPCRouter,
} from "../trpc";
import { listOfficers, getOfficerById } from "@watts/core/officers";
import { setMemberOfficer, listMemberResumes } from "@watts/core/members";
import { mapDomainError } from "../map-domain-error";

const reviewResumes = capabilityProcedure("review_resumes");

export const officerRouter = createTRPCRouter({
	// Get all current officers
	getAll: publicProcedure.query(async () => {
		return listOfficers(db);
	}),

	// Get a single officer by member id
	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ input }) => {
			try {
				return await getOfficerById(db, input.id);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// Promote a member to officer (admin only)
	promote: adminProcedure
		.input(z.object({ id: z.string().uuid(), officerRole: z.enum(officerRoleEnum.enumValues) }))
		.mutation(async ({ input }) => {
			try {
				const { member } = await setMemberOfficer(db, {
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
	listResumes: reviewResumes.query(async () => {
		return listMemberResumes(db);
	}),

	// Remove officer status (admin only)
	demote: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await setMemberOfficer(db, { id: input.id, officerStatus: false })) };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
