import { z } from 'zod';
import { publicProcedure, adminProcedure, createTRPCRouter } from '../trpc';
import {
	listActiveProjects,
	getProjectById,
	getProjectBySlug,
	createProject,
	updateProject,
	deleteProject,
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
});
