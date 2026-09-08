import { z } from 'zod';
import { createTRPCRouter, adminProcedure, officerProcedure } from '@watts/api/trpc';
import { db } from '@/lib/database/client';
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
	officerGrantableCapabilities: officerProcedure.query(async () => ({
		delegable: [...OFFICER_DELEGABLE_CAPABILITIES],
		enabled: await getOfficerGrantableCapabilities(db),
	})),

	/** Admin-only: set the officer-delegable capability allow-list. */
	setOfficerGrantableCapabilities: adminProcedure
		.input(z.object({ capabilities: z.array(z.string().max(64)) }))
		.mutation(async ({ input }) => ({
			enabled: await setOfficerGrantableCapabilities(db, input.capabilities),
		})),
});
