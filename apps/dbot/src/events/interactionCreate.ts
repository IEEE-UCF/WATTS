import {
	ChatInputCommandInteraction,
	ChannelType,
	MessageFlags,
} from 'discord.js';
import type { Interaction } from 'discord.js';
import { Event } from '../structs/Event.js';

export class InteractionCreateEvent extends Event {
	constructor(client: any) {
		super(client, {
			name: 'interactionCreate',
		});
	}

	async run(interaction: Interaction): Promise<void> {
		if (!interaction.isChatInputCommand()) return;

		const command = this.client.commands?.get(interaction.commandName);
		if (!command) return;

		// Enabled / guild-only / permission tier / cooldown — the same gate command
		// buttons go through (events/button.ts).
		const blocked = await command.gate(interaction.user.id, Boolean(interaction.guild));
		if (blocked) {
			await interaction.reply({ embeds: [blocked], flags: MessageFlags.Ephemeral });
			return;
		}

		// Execute command
		try {
			await command.run(interaction);
			command.setCooldown(interaction.user.id);

			// Log command usage
			console.log(`Command ${command.name} used by ${interaction.user.tag} (${interaction.user.id})`);
		} catch (error) {
			console.error(`Error executing command ${command.name}:`, error);

			const embed = this.client.createEmbed()
				.setTitle('❌ Command Error')
				.setDescription('An error occurred while executing this command.');
			const replyOptions = { embeds: [embed], ephemeral: true };

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(replyOptions);
			} else {
				await interaction.reply(replyOptions);
			}

			// Send error to logs channel if configured
			await this.sendErrorToLogs(interaction as ChatInputCommandInteraction, error);
		}
	}

	private async sendErrorToLogs(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
		try {
			// Check if we have a logs channel configured
			const logsChannelId = this.client.config?.servers?.main?.channels?.defaultLogging;
			if (!logsChannelId) return;

			const logsChannel = this.client.channels.cache.get(logsChannelId);
			if (!logsChannel?.isTextBased()) return;

			const embed = this.client.createEmbed()
				.setTitle('🚨 Command Error')
				.setDescription([
					`**Command:** \`${interaction.commandName}\``,
					`**User:** ${interaction.user.tag} (${interaction.user.id})`,
					`**Guild:** ${interaction.guild?.name ?? 'DM'} (${interaction.guild?.id ?? 'N/A'})`,
					`**Channel:** ${interaction.channel?.type === ChannelType.GuildText ? `#${interaction.channel.name}` : 'DM'} (${interaction.channel?.id ?? 'N/A'})`,
					`**Error:** \`\`\`${error.message ?? error}\`\`\``,
				].join('\n'))
				.setColor('#FF3333');

			await logsChannel.send({ embeds: [embed] });
		} catch (logError) {
			console.error('Error sending to logs channel:', logError);
		}
	}
}