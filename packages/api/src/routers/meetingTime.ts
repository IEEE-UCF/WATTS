import { z } from 'zod';
import { publicProcedure, adminProcedure, createTRPCRouter } from '../trpc';
import {
	listMeetingTimes,
	createMeetingTime,
	updateMeetingTime,
	deleteMeetingTime,
} from '@watts/core/meetings';
import { mapDomainError } from '../map-domain-error';

const meetingTimeCreateSchema = z.object({
	title: z.string().min(1).max(255),
	dayOfWeek: z.number().int().min(0).max(6),
	startTime: z.string().min(1).max(8),
	endTime: z.string().min(1).max(8).optional(),
	location: z.string().max(255).optional(),
});

const meetingTimeUpdateSchema = meetingTimeCreateSchema.partial();

export const meetingTimeRouter = createTRPCRouter({
	getAll: publicProcedure.query(async ({ ctx }) => {
		try {
			return await listMeetingTimes(ctx.db);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	create: adminProcedure
		.input(meetingTimeCreateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await createMeetingTime(ctx.db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: adminProcedure
		.input(z.object({ id: z.string().uuid(), data: meetingTimeUpdateSchema }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateMeetingTime(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await deleteMeetingTime(ctx.db, input.id);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
