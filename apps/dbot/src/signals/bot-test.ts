import { SignalHandler, type SignalContext } from '../structs/SignalHandler.ts';
import type { SignalPayload } from '@watts/bot-signals';

/** Admin-panel "Send test signal" → confirm receipt in the default logging channel. */
export class BotTestSignal extends SignalHandler<'bot.test'> {
	constructor(client: any) {
		super(client, { type: 'bot.test' });
	}

	async run(payloads: SignalPayload<'bot.test'>[], context: SignalContext): Promise<void> {
		const channelId = this.client.config.servers.main.channels.defaultLogging;
		if (!channelId) {
			this.client.logger.warn('bot.test signal received, but CHANNEL_DEFAULT_LOGGING_ID is unset.');
			return;
		}

		const channel = await this.client.channels.fetch(channelId).catch(() => null);
		if (!channel?.isTextBased() || !('send' in channel)) {
			this.client.logger.warn(`bot.test: CHANNEL_DEFAULT_LOGGING_ID ${channelId} is not a sendable text channel.`);
			return;
		}

		const latency = ((Date.now() - context.sentAt) / 1000).toFixed(1);
		for (const { requestedBy } of payloads) {
			await channel.send({
				content: `✅ Test webhook received — from ${requestedBy}, ${latency}s after send.`,
				allowedMentions: { parse: [] },
			});
		}
		this.client.logger.success(`bot.test signal handled (${payloads.length}).`);
	}
}
