import { Event } from '../structs/Event.js';

export class ReadyEvent extends Event {
	constructor(client: any) {
		super(client, {
			name: 'clientReady',
			once: true,
		});
	}

	async run() {
		console.log('\n');
		console.log(`🤖 ${this.client.user?.tag} is online and ready!`);
		console.log('\n');
		// console.log(`📊 Serving ${this.client.guilds.cache.size} guild(s)`);
		// console.log(`👥 Connected to ${this.client.users.cache.size} user(s)`);

		// Set bot status from config
		this.client.user?.setActivity({
			name: this.client.config.status.name,
			type: this.client.config.status.type,
		});

		// Startup/status ping in the default logging channel
		const defaultLoggingId: string = this.client.config.servers.main.channels.defaultLogging;
		if (defaultLoggingId) {
			try {
				const channel = await this.client.channels.fetch(defaultLoggingId);
				if (channel?.isTextBased() && 'send' in channel) {
					await channel.send('bot alive');
					this.client.logger?.success(`Posted startup message to #defaultLogging (${defaultLoggingId}).`);
				} else {
					this.client.logger?.warn(`CHANNEL_DEFAULT_LOGGING_ID ${defaultLoggingId} is not a sendable text channel.`);
				}
			} catch (err) {
				this.client.logger?.warn(`Could not post startup message to #defaultLogging: ${err}`);
			}
		} else {
			this.client.logger?.warn('CHANNEL_DEFAULT_LOGGING_ID is unset — skipping the startup message.');
		}

		await this.client.eventsAutomation.start();
		await this.client.discordEventSync.start();

		// Clean permission cache periodically
		setInterval(() => {
			this.client.permissions?.cleanExpiredCache();
		}, 5 * 60 * 1000); // Clean every 5 minutes

		// Clean command cooldowns periodically
		setInterval(() => {
			this.client.commands?.forEach((command: any) => {
				command.cleanCooldowns?.();
			});
		}, 60 * 1000); // Clean every minute
	}
}