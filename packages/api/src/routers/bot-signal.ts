import { createTRPCRouter, adminProcedure } from '../trpc';
import type { SendResult } from '@watts/bot-signals';

export const botSignalRouter = createTRPCRouter({
	/**
	 * Admin-only: send the bot a `bot.test` signal; the bot answers in its default
	 * logging channel. Sent immediately (not batched) so the button can show whether
	 * the webhook accepted it.
	 */
	sendTest: adminProcedure.mutation(async ({ ctx }): Promise<SendResult> => {
		if (!ctx.botSignals) return { sent: false, reason: 'not configured' };
		const requestedBy = (ctx.session.user.name || 'an admin').slice(0, 80);
		return ctx.botSignals.send([{ type: 'bot.test', payload: { requestedBy } }]);
	}),
});
