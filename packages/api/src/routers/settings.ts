import { z } from 'zod';
import { createTRPCRouter, adminProcedure, officerProcedure } from '../trpc';
import {
	getOfficerGrantableCapabilities,
	setOfficerGrantableCapabilities,
} from '@watts/core/settings';
import { OFFICER_DELEGABLE_CAPABILITIES } from '@watts/permissions';

export const settingsRouter = createTRPCRouter({
	/**
	 * Which capabilities officers are currently allowed to grant to plain members.
	 * Readable by any staff member (officers need it to know what they can toggle).
	 */
	officerGrantableCapabilities: officerProcedure.query(async ({ ctx }) => ({
		delegable: [...OFFICER_DELEGABLE_CAPABILITIES],
		enabled: await getOfficerGrantableCapabilities(ctx.db),
	})),

	/** Admin-only: set the officer-delegable capability allow-list. */
	setOfficerGrantableCapabilities: adminProcedure
		.input(z.object({ capabilities: z.array(z.string().max(64)) }))
		.mutation(async ({ ctx, input }) => ({
			enabled: await setOfficerGrantableCapabilities(ctx.db, input.capabilities),
		})),
});
