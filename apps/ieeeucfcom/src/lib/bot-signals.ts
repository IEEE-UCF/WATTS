import 'server-only';

import { after } from 'next/server';
import {
	encodeEnvelope,
	type BotSignalSender,
	type SendResult,
	type Signal,
} from '@watts/bot-signals';

/**
 * The website's side of website → Discord bot signals (contract: @watts/bot-signals).
 *
 * The bot and the website share only the database, and the bot doesn't poll it for
 * changes (every read wakes the Neon compute, billed while awake). Instead we post a
 * signed envelope through a Discord channel webhook; the bot recognises that webhook's
 * messages, verifies them, runs the matching handlers, and deletes them. No inbound
 * port on the VPS.
 *
 * Env (shared with the bot): BOT_SIGNAL_WEBHOOK_URL, BOT_SIGNAL_SECRET. Either unset →
 * signals are skipped (`send` reports "not configured").
 */
function configured(): { url: string; secret: string } | null {
	const url = process.env.BOT_SIGNAL_WEBHOOK_URL?.trim();
	const secret = process.env.BOT_SIGNAL_SECRET?.trim();
	return url && secret ? { url, secret } : null;
}

async function post(signals: Signal[]): Promise<SendResult> {
	const cfg = configured();
	if (!cfg) return { sent: false, reason: 'not configured' };
	try {
		const res = await fetch(cfg.url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				content: encodeEnvelope(signals, cfg.secret),
				allowed_mentions: { parse: [] },
			}),
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return { sent: false, reason: `webhook ${res.status}` };
		return { sent: true };
	} catch (error) {
		if (error instanceof Error && error.name === 'TimeoutError')
			return { sent: false, reason: 'timeout' };
		return { sent: false, reason: error instanceof Error ? error.message : 'send failed' };
	}
}

/**
 * One sender per request. `emit` collects signals (identical ones once) and posts a
 * single envelope after the response via `after()`; `send` posts immediately.
 * Neither throws — a lost signal only means the bot catches up on its fallback poll.
 */
export function createBotSignalSender(): BotSignalSender {
	const queued = new Map<string, Signal>();

	return {
		emit(type, payload) {
			if (!configured()) return;
			const signal = { type, payload } as Signal;
			const key = JSON.stringify(signal);
			if (queued.has(key)) return;
			const first = queued.size === 0;
			queued.set(key, signal);
			if (!first) return;
			after(async () => {
				const result = await post([...queued.values()]);
				if (!result.sent) console.warn(`Bot signal not sent: ${result.reason}`);
			});
		},
		send: post,
	};
}
