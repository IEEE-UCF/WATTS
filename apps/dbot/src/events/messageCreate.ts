import { Event } from '../structs/Event';
import type { Message } from 'discord.js';

export class MessageCreateEvent extends Event {
	constructor(client: any) {
		super(client, {
			name: 'messageCreate',
			once: false,
		});
	}

	async run(message: Message): Promise<void> {
		// Website → bot signals arrive as webhook posts (webhooks count as bots, so this
		// runs before the bot filter). See modules/signals/SignalRouter.ts.
		if (await this.client.signalRouter.fromMessage(message)) return;

		// The website's "events changed" ping (a Discord webhook post) → sync to Discord
		// now, then tidy the ping away. Checked before the bot filter: webhooks are bots.
		const sync = this.client.discordEventSync;
		if (sync?.isSyncPing(message.webhookId)) {
			sync.requestSync();
			await message.delete().catch(() => null); // needs Manage Messages; harmless if not
			return;
		}

		// Ignore messages from bots
		if (message.author?.bot) return;
	}
}