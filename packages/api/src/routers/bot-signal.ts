import { createTRPCRouter, adminProcedure } from '../trpc';
import type { SendResult, Signal } from '@watts/bot-signals';

/**
 * Admin buttons that send the Discord bot a signal. Each one sends immediately (not
 * batched) so the button can show whether the webhook accepted it. To add a button:
 * add a procedure here, classify it in infra/e2e/lib/access-matrix.ts, and add a
 * <SignalButton> to components/admin/bot-signal-test.tsx.
 */
export const botSignalRouter = createTRPCRouter({
	/** Bot posts "Test webhook received" in its default logging channel. */
	sendTest: adminProcedure.mutation(({ ctx }) =>
		send(ctx, { type: 'bot.test', payload: { requestedBy: (ctx.session.user.name || 'an admin').slice(0, 80) } }),
	),

	/** Bot runs a Discord event sync pass now (same as /syncevents). */
	syncEvents: adminProcedure.mutation(({ ctx }) => send(ctx, { type: 'events.changed', payload: {} })),
});

function send(ctx: { botSignals?: { send(signals: Signal[]): Promise<SendResult> } }, signal: Signal): Promise<SendResult> {
	if (!ctx.botSignals) return Promise.resolve({ sent: false, reason: 'not configured' });
	return ctx.botSignals.send([signal]);
}
