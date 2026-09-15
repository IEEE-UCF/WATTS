// TODO(cms): create/update/delete below have no admin UI caller yet — the
// only way to manage /projects content today is seed fixtures or raw DB
// access. Needs an /admin/projects page (apps/ieeeucfcom/src/app/admin/),
// following the /admin/events pattern (list + edit modal). See project-cms-todo
// memory note for context on why this surfaced.
import { z } from 'zod';
import { publicProcedure, adminProcedure, officerProcedure, createTRPCRouter } from '../trpc';
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
} from '@watts/core/projects';
import { mapDomainError } from '../map-domain-error';

// Validation schemas
const projectCreateSchema = z.object({
	title: z.string().min(1, 'Project title is required').max(255),
	slug: z.string().max(64).optional(),
	overview: z.string().min(1, 'Overview is required'),
	projectLead: z.string().max(255).optional(), // Temporary plain-text field
	hardwareInfo: z.string().optional(),
	softwareInfo: z.string().optional(),
	skills: z.string().optional(),
	photoUrls: z.array(z.string()).optional(),
	discordRoleId: z.string().max(64).optional(),
});

const projectUpdateSchema = projectCreateSchema.partial();

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

	create: adminProcedure
		.input(projectCreateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await createProject(ctx.db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: adminProcedure
		.input(z.object({ id: z.string().uuid(), data: projectUpdateSchema }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateProject(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: adminProcedure
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
});
