/* Officers+: run the website → Discord event sync now instead of waiting for the next poll */
/* (the poll is deliberately slow — every DB read wakes the Neon database, which is billed while awake) */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../../structs/Command.js';
import { PermissionLevel } from '../../modules/helpers/Utils.js';

export class SyncEventsCommand extends Command {
	constructor(client: any) {
		super(client, {
			name: 'syncevents',
			description: 'Sync website events, room reservations and the room dashboard to Discord now.',
			usage: 'syncevents',
			category: 'admin',
			permissionLevel: PermissionLevel.OFFICER,
			guildOnly: true,
			cooldown: 30,
		});
	}

	command(): SlashCommandBuilder {
		return new SlashCommandBuilder()
			.setName(this.name)
			.setDescription(this.description);
	}

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const sync = this.client.discordEventSync;
		if (!sync?.enabled) {
			await this.replyError(interaction, 'Sync Disabled', 'Discord event sync is turned off on this bot (DISCORD_EVENT_SYNC_ENABLED).', true);
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		const ran = await sync.reconcile();
		if (ran) {
			await this.replySuccess(interaction, 'Events Synced', 'Discord events, room announcements and the room dashboard are up to date.', true);
		} else {
			await this.replyError(interaction, 'Sync Already Running', 'A sync pass is already in progress — it will pick up your changes.', true);
		}
	}
}

export default SyncEventsCommand;
