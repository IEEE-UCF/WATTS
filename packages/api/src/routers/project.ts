import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { WattsDb } from '@watts/db';
import type { MemberRoles } from '@watts/core/members';
import { publicProcedure, officerProcedure, memberProcedure, capabilityProcedure, createTRPCRouter } from '../trpc';
import {
	listActiveProjects,
	getProjectById,
	getProjectBySlug,
	createProject,
	updateProject,
	deleteProject,
	listProjectMembers,
	addProjectMember,
	removeProjectMember,
	setProjectLead,
	isProjectLead,
	requestProjectMembership,
	listProjectMembershipRequests,
	approveProjectMembershipRequest,
	denyProjectMembershipRequest,
	listMyLeadRequests,
	listProjectsLedBy,
} from '@watts/core/projects';
import { hasCapability } from '@watts/permissions';
import { finalizeUpload } from '@watts/storage/finalize';
import { projectPhotoKey, sanitizeFilename } from '@watts/storage/keys';
import { Projects } from '@watts/db/schema';
import { eq } from 'drizzle-orm';
import { mapDomainError, mapUploadError } from '../map-domain-error';

const manageProjects = capabilityProcedure('manage_projects');

// `.nullish()` (not `.optional()`) on every clearable text field: the admin form must be
// able to send an explicit `null` to blank out a previously-set value. `undefined` means
// "leave unchanged" (the field was omitted from the payload); `null` means "clear it" —
// collapsing both to `undefined` client-side is what silently broke clearing before.
const projectCreateSchema = z.object({
	title: z.string().min(1, 'Project title is required').max(255),
	slug: z.string().max(64).nullish(),
	overview: z.string().min(1, 'Overview is required'),
	projectLead: z.string().max(255).nullish(), // Temporary plain-text field
	hardwareInfo: z.string().nullish(),
	softwareInfo: z.string().nullish(),
	skills: z.string().nullish(),
	photoUrls: z.array(z.string()).optional(),
	categoryId: z.string().uuid().nullish(),
	discordRoleId: z.string().max(64).nullish(),
	discordLeadRoleId: z.string().max(64).nullish(),
	discordChannelId: z.string().max(64).nullish(),
});

const projectUpdateSchema = projectCreateSchema.partial();

/**
 * Officer/admin (manage_projects) OR this specific project's current lead — the one
 * shared gate for everything a lead is allowed to do, but only for their own project(s):
 * reviewing/approving membership requests, and editing their project's info below.
 */
async function assertIsOfficerOrProjectLead(
	ctx: { db: WattsDb; getRoles: () => Promise<MemberRoles | null>; member: { id: string } },
	projectId: string,
) {
	const roles = await ctx.getRoles();
	if (hasCapability(roles, 'manage_projects')) return;
	if (await isProjectLead(ctx.db, projectId, ctx.member.id)) return;
	throw new TRPCError({ code: 'FORBIDDEN', message: "Must be an officer or this project's lead" });
}

// The subset of a project's fields a non-officer lead may edit for their own project —
// deliberately narrow: no title/overview/category/Discord linkage/lead reassignment,
// just the hardware/software/skills tag lists. Officers use the full `update` procedure.
const projectInfoSchema = z.object({
	projectId: z.string().uuid(),
	hardwareInfo: z.string().nullish(),
	softwareInfo: z.string().nullish(),
	skills: z.string().nullish(),
});

export const projectRouter = createTRPCRouter({
	getAll: publicProcedure.query(async ({ ctx }) => {
		try {
			return await listActiveProjects(ctx.db);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			try {
				return await getProjectById(ctx.db, input.id);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getBySlug: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				return await getProjectBySlug(ctx.db, input.slug);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	create: manageProjects
		.input(projectCreateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await createProject(ctx.db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: manageProjects
		.input(z.object({ id: z.string().uuid(), data: projectUpdateSchema }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateProject(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: manageProjects
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await deleteProject(ctx.db, input.id);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// Rough Staff Committees & Projects panel — membership assignment, not the full CMS.
	listMembers: officerProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(async ({ ctx, input }) => listProjectMembers(ctx.db, input.projectId)),

	addMember: officerProcedure
		.input(z.object({ projectId: z.string().uuid(), memberId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await addProjectMember(ctx.db, input.projectId, input.memberId);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	removeMember: officerProcedure
		.input(z.object({ projectId: z.string().uuid(), memberId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await removeProjectMember(ctx.db, input.projectId, input.memberId);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	setLead: officerProcedure
		.input(z.object({ projectId: z.string().uuid(), memberId: z.string().uuid(), isLead: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await setProjectLead(ctx.db, input.projectId, input.memberId, input.isLead);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	confirmPhoto: manageProjects
		.input(z.object({ projectId: z.string().uuid(), photoId: z.string().uuid(), filename: z.string().max(255).optional() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await finalizeUpload(ctx.db, {
					kind: 'project-photo',
					key: projectPhotoKey(input.projectId, input.photoId),
					userId: ctx.session.user.id,
					projectId: input.projectId,
					photoId: input.photoId,
					filename: sanitizeFilename(input.filename),
				});
			} catch (err) {
				mapUploadError(err);
			}
		}),

	removePhoto: manageProjects
		.input(z.object({ projectId: z.string().uuid(), photoUrl: z.string().url() }))
		.mutation(async ({ ctx, input }) => {
			const [project] = await ctx.db
				.select({ photoUrls: Projects.photoUrls })
				.from(Projects)
				.where(eq(Projects.id, input.projectId))
				.limit(1);
			if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
			const photoUrls = (project?.photoUrls ?? []).filter((url) => url !== input.photoUrl);
			await ctx.db.update(Projects).set({ photoUrls, updatedAt: new Date() }).where(eq(Projects.id, input.projectId));
			return { success: true };
		}),

	// Self-service "request to join" — reviewed by a lead or officer/admin before a
	// ProjectMembers row is created. Officers/admins can still bypass this via addMember.
	requestMembership: memberProcedure
		.input(z.object({ projectId: z.string().uuid(), message: z.string().max(1000).optional() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await requestProjectMembership(ctx.db, input.projectId, ctx.member.id, input.message);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	listMembershipRequests: memberProcedure
		.input(z.object({ projectId: z.string().uuid(), status: z.enum(['pending', 'approved', 'denied']).optional() }))
		.query(async ({ ctx, input }) => {
			await assertIsOfficerOrProjectLead(ctx, input.projectId);
			return listProjectMembershipRequests(ctx.db, input.projectId, input.status);
		}),

	approveRequest: memberProcedure
		.input(z.object({ requestId: z.string().uuid(), projectId: z.string().uuid(), reviewNote: z.string().max(1000).optional() }))
		.mutation(async ({ ctx, input }) => {
			await assertIsOfficerOrProjectLead(ctx, input.projectId);
			try {
				return await approveProjectMembershipRequest(ctx.db, input.requestId, ctx.member.id, input.reviewNote);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	denyRequest: memberProcedure
		.input(z.object({ requestId: z.string().uuid(), projectId: z.string().uuid(), reviewNote: z.string().max(1000).optional() }))
		.mutation(async ({ ctx, input }) => {
			await assertIsOfficerOrProjectLead(ctx, input.projectId);
			try {
				return await denyProjectMembershipRequest(ctx.db, input.requestId, ctx.member.id, input.reviewNote);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// Dashboard panel for a non-officer lead: their own projects' pending requests,
	// in one call. Empty array for anyone who isn't a lead of anything.
	myLeadRequests: memberProcedure.query(async ({ ctx }) => {
		return listMyLeadRequests(ctx.db, ctx.member.id);
	}),

	// All projects the caller leads (unfiltered by pending requests) — feeds the lead's
	// "edit your project's info" panel.
	myLedProjects: memberProcedure.query(async ({ ctx }) => {
		return listProjectsLedBy(ctx.db, ctx.member.id);
	}),

	// Narrow edit surface for a non-officer lead: hardware/software/skills only, scoped
	// to a project THEY lead. Officers can also call it (assertIsOfficerOrProjectLead
	// passes on manage_projects alone), but they'd normally use the full `update`.
	updateOwnProjectInfo: memberProcedure
		.input(projectInfoSchema)
		.mutation(async ({ ctx, input }) => {
			await assertIsOfficerOrProjectLead(ctx, input.projectId);
			const { projectId, ...data } = input;
			try {
				return { success: true, ...(await updateProject(ctx.db, projectId, data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
