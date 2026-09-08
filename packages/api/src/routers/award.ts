import { z } from 'zod';
import { publicProcedure, adminProcedure, createTRPCRouter } from '../trpc';
import {
	listAwards,
	getAwardById,
	createAward,
	updateAward,
	deleteAward,
} from '@watts/core/awards';
import { mapDomainError } from '../map-domain-error';

const awardCreateSchema = z.object({
	category: z.string().min(1).max(255),
	eventName: z.string().min(1).max(255),
	place: z.string().min(1).max(64),
	year: z.number().int().min(2000).max(2100),
	projectId: z.string().uuid().optional(),
	memberId: z.string().uuid().optional(),
	description: z.string().optional(),
});

const awardUpdateSchema = awardCreateSchema.partial();

export const awardRouter = createTRPCRouter({
	getAll: publicProcedure
		.input(z.object({ year: z.number().int().optional() }).optional())
		.query(async ({ ctx, input }) => {
			try {
				return await listAwards(ctx.db, input);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			try {
				return await getAwardById(ctx.db, input.id);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	create: adminProcedure
		.input(awardCreateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await createAward(ctx.db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: adminProcedure
		.input(z.object({ id: z.string().uuid(), data: awardUpdateSchema }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateAward(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await deleteAward(ctx.db, input.id);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
