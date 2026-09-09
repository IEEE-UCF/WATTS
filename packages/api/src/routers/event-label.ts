import { z } from 'zod';
import { publicProcedure, capabilityProcedure, createTRPCRouter } from '../trpc';
import {
	listLabels,
	createLabel,
	updateLabel,
	setLabelActive,
	syncNativeLabelsFromGoogle,
} from '@watts/core/event-labels';
import { createCalendarClient, GOOGLE_COLOR_IDS } from '@watts/calendar';
import { mapDomainError } from '../map-domain-error';

const manageEvents = capabilityProcedure('manage_events');

const colorId = z.enum(GOOGLE_COLOR_IDS).nullish();
const hex = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/u, 'Hex must look like #a4bdfc')
	.nullish();

const labelCreateSchema = z.object({
	name: z.string().min(1).max(64),
	slug: z.string().min(1).max(32),
	colorId,
	googleLabelId: z.string().max(64).nullish(),
	hex,
	sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const eventLabelRouter = createTRPCRouter({
	/** All labels (form selects filter to `active` client-side). Public — the feed renders label chips. */
	list: publicProcedure.query(async ({ ctx }) => {
		try {
			return await listLabels(ctx.db);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	create: manageEvents.input(labelCreateSchema).mutation(async ({ ctx, input }) => {
		try {
			return { success: true, ...(await createLabel(ctx.db, input)) };
		} catch (error) {
			mapDomainError(error);
		}
	}),

	update: manageEvents
		.input(z.object({ id: z.string().uuid(), data: labelCreateSchema.partial() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateLabel(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	setActive: manageEvents
		.input(z.object({ id: z.string().uuid(), active: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await setLabelActive(ctx.db, input.id, input.active)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** The native event labels configured on the connected Google Calendar. */
	nativeLabels: manageEvents.query(async () => {
		try {
			return await createCalendarClient().listNativeLabels();
		} catch (error) {
			mapDomainError(error);
		}
	}),

	/** Link our labels to the calendar's native labels by name + refresh their colours. */
	pullFromGoogle: manageEvents.mutation(async ({ ctx }) => {
		try {
			return { success: true, ...(await syncNativeLabelsFromGoogle(ctx.db)) };
		} catch (error) {
			mapDomainError(error);
		}
	}),
});
