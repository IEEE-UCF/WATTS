import { z } from 'zod';
import { publicProcedure, capabilityProcedure, createTRPCRouter } from '../trpc';
import { listCategories, createCategory, updateCategory, setCategoryArchived } from '@watts/core/project-categories';
import { mapDomainError } from '../map-domain-error';

const manageProjects = capabilityProcedure('manage_projects');

const categoryCreateSchema = z.object({
	name: z.string().min(1).max(64),
	slug: z.string().min(1).max(32),
	sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const projectCategoryRouter = createTRPCRouter({
	/** All categories (form selects filter to non-archived client-side). Public — the /projects page can filter by category. */
	list: publicProcedure.query(async ({ ctx }) => {
		try {
			return await listCategories(ctx.db);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	create: manageProjects.input(categoryCreateSchema).mutation(async ({ ctx, input }) => {
		try {
			return { success: true, ...(await createCategory(ctx.db, input)) };
		} catch (error) {
			mapDomainError(error);
		}
	}),

	update: manageProjects
		.input(z.object({ id: z.string().uuid(), data: categoryCreateSchema.partial() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateCategory(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	setArchived: manageProjects
		.input(z.object({ id: z.string().uuid(), archived: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await setCategoryArchived(ctx.db, input.id, input.archived)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
