import { z } from "zod";
import { db } from "@/lib/database/client";
import { majorEnums, officerRoleEnum } from "@watts/db/schema";
import {
	protectedProcedure,
	adminProcedure,
	memberProcedure,
	officerProcedure,
	createTRPCRouter,
} from '@watts/api/trpc';
import {
	registerMember,
	updateMemberProfile,
	listMembers,
	listMembersForAdmin,
	getMemberById,
	getMemberByUserId,
	setMemberCapability,
	setMemberAdmin,
	setMemberOfficer,
} from "@watts/core/members";
import { mapDomainError } from "../map-domain-error";

// Validation schemas
const memberRegistrationSchema = z.object({
	firstName: z.string().min(1, "First name is required").max(255),
	middleName: z.string().max(255).optional(),
	lastName: z.string().min(1, "Last name is required").max(255),
	personalEmail: z.string().email("Invalid email format").max(255),
	ucfEmail: z.string().email("Invalid email format").refine((email) => email.endsWith("@ucf.edu")).max(255),
	dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
	phoneNumber: z.string().max(20).optional(),
	gender: z.enum(["M", "F", "NB", "O", "PNTS"]),
	graduationYear: z.number().int().min(2020).max(2035),
	major: z.enum(majorEnums.enumValues),
});

const memberUpdateSchema = z.object({
	firstName: z.string().min(1).max(255).optional(),
	middleName: z.string().max(255).optional(),
	lastName: z.string().min(1).max(255).optional(),
	biography: z.string().optional(),
	phoneNumber: z.string().max(20).optional(),
	major: z.enum(majorEnums.enumValues),
	graduationYear: z.number().int().min(2020).max(2035).optional(),
	gender: z.enum(["M", "F", "NB", "O", "PNTS"]).optional(),
	linkedinURL: z.string().url().optional(),
	githubURL: z.string().url().optional(),
	websiteURL: z.string().url().optional(),
});

export const memberRouter = createTRPCRouter({
	// for member creation and registration checking
	completeRegistration: protectedProcedure
		.input(memberRegistrationSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const discordId = ctx.session.user.discordId || ctx.session.user.id;
				return {
					success: true,
					...(await registerMember(db, { ...input, userId: ctx.session.user.id, discordId })),
				};
			} catch (error) {
				mapDomainError(error);
			}
		}),

	updateMyProfile: memberProcedure
		.input(memberUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateMemberProfile(db, ctx.session.user.id, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getAll: adminProcedure.query(async () => {
		return listMembers(db);
	}),

	/**
	 * Rich member list for the members-management screen:
	 * status flags, résumé indicator, committees, and linked Discord account.
	 * Officers may view it (they can only act on delegated capabilities — see setPermission).
	 */
	listForAdmin: officerProcedure.query(async () => {
		return listMembersForAdmin(db);
	}),

	/**
	 * Grant / revoke a granular capability (global scope).
	 *
	 * Admins may grant any capability to anyone. Officers may only grant/revoke a
	 * capability that an admin has delegated (settings.officerGrantableCapabilities,
	 * always a subset of OFFICER_DELEGABLE_CAPABILITIES) and only to plain members
	 * — never to other officers or admins.
	 */
	setPermission: officerProcedure
		.input(
			z.object({
				memberId: z.string().uuid(),
				permission: z.string().max(64),
				granted: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				return {
					success: true,
					...(await setMemberCapability(
						db,
						{ userId: ctx.session.user.id, administrator: ctx.roles.administrator },
						input,
					)),
				};
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** Grant / revoke administrator. Cannot remove your own admin (lockout guard). */
	setAdmin: adminProcedure
		.input(z.object({ id: z.string().uuid(), value: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return {
					success: true,
					...(await setMemberAdmin(db, { ...input, actingUserId: ctx.session.user.id })),
				};
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** Set officer status and (optionally) role in one call. Clearing status clears the role. */
	setOfficer: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				officerStatus: z.boolean(),
				officerRole: z.enum(officerRoleEnum.enumValues).nullish(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await setMemberOfficer(db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getById: officerProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ input }) => {
			try {
				return await getMemberById(db, input.id);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getMyProfile: memberProcedure.query(async ({ ctx }) => {
		try {
			return await getMemberByUserId(db, ctx.session.user.id);
		} catch (error) {
			mapDomainError(error);
		}
	}),
});
