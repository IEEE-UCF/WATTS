import { z } from 'zod';
import { db } from '@/lib/database/client';
import { publicProcedure, adminProcedure, createTRPCRouter } from '@watts/api/trpc';
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
	getAll: publicProcedure.query(async () => {
		try {
			return await listMeetingTimes(db);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	create: adminProcedure
		.input(meetingTimeCreateSchema)
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await createMeetingTime(db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: adminProcedure
		.input(z.object({ id: z.string().uuid(), data: meetingTimeUpdateSchema }))
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await updateMeetingTime(db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input }) => {
			try {
				await deleteMeetingTime(db, input.id);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),
});
