import 'server-only';

import { after } from 'next/server';

/**
 * Nudge the Discord bot to run its website → Discord event sync now.
 *
 * The bot and the website share only the database, and the bot's DB poll is kept
 * slow on purpose (every read wakes the Neon compute, which is billed while awake).
 * So instead, after an event change we post a tiny message through a Discord channel
 * webhook; the bot recognises that webhook's messages, syncs, and deletes them. No
 * inbound port on the VPS needed.
 *
 * Env: DISCORD_BOT_SYNC_WEBHOOK_URL (unset → no-op; the bot's poll still catches up).
 * Runs after the response via `after()`, never throws — a failed nudge only means the
 * change reaches Discord on the next poll.
 */
export function requestBotSync(): void {
	const url = process.env.DISCORD_BOT_SYNC_WEBHOOK_URL?.trim();
	if (!url) return;

	after(async () => {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'sync', allowed_mentions: { parse: [] } }),
				signal: AbortSignal.timeout(5000),
			});
			if (!res.ok) console.warn(`Bot sync webhook responded ${res.status}`);
		} catch (error) {
			console.warn('Bot sync webhook failed:', error);
		}
	});
}
