import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { Command } from '../../structs/Command.ts';
import { PermissionLevel } from '../../modules/helpers/Utils.ts';
import { resolveWhois, formatWhois, type WhoisResult } from '@watts/core/members';

export class WhoisCommand extends Command {
	constructor(client: any) {
		super(client, {
			name: 'whois',
			description: 'Look someone up in the IEEE database (defaults to you).',
			usage: 'whois [user] [name]',
			category: 'general',
			permissionLevel: PermissionLevel.GUEST,
			guildOnly: false,
			cooldown: 5,
		});
	}

	command(): SlashCommandBuilder | SlashCommandOptionsOnlyBuilder {
		return new SlashCommandBuilder()
			.setName(this.name)
			.setDescription(this.description)
			.addUserOption((option) =>
				option
					.setName('user')
					.setDescription('The Discord user to look up')
					.setRequired(false),
			)
			.addStringOption((option) =>
				option
					.setName('name')
					.setDescription('Full or partial name (use instead of a Discord user)')
					.setRequired(false),
			);
	}

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();

		try {
			const db = this.client.database.getDB();
			const userOpt = interaction.options.getUser('user', false);
			const nameOpt = interaction.options.getString('name', false);

			let result: WhoisResult;
			if (userOpt) {
				result = await resolveWhois(db, {
					discordId: userOpt.id,
					label: `@${userOpt.username}`,
				});
			} else if (nameOpt) {
				result = await resolveWhois(db, { name: nameOpt });
			} else {
				// no args → look up the caller
				result = await resolveWhois(db, {
					discordId: interaction.user.id,
					label: `@${interaction.user.username}`,
				});
			}

			const mention =
				result.status === 'found' && result.profile.member.discordId
					? `<@${result.profile.member.discordId}>`
					: undefined;

			const content = formatWhois(result, { mention });

			if (result.status !== 'found') {
				await interaction.editReply({ content });
				return;
			}

			// Rich card alongside the sentence.
			const { member, committees, projects, lastEvent } = result.profile;
			const embed = this.client
				.createEmbed()
				.setTitle(
					[member.firstName, member.middleName, member.lastName].filter(Boolean).join(' '),
				)
				.setTimestamp();

			if (member.discordId) {
				try {
					const u = await this.client.users.fetch(member.discordId);
					embed.setThumbnail(u.displayAvatarURL({ size: 256 }));
				} catch {
					/* not fetchable — skip the thumbnail */
				}
			}

			embed.addFields({
				name: '📚  Academic Info',
				value: `**Major:** ${member.major}\n**Graduation Year:** ${member.graduationYear}`,
				inline: false,
			});

			if (member.biography) {
				embed.addFields({
					name: '📝  Biography',
					value:
						member.biography.length > 1024
							? member.biography.slice(0, 1021) + '...'
							: member.biography,
					inline: false,
				});
			}

			if (committees.length > 0) {
				embed.addFields({
					name: '📋  Committees',
					value: committees
						.map((c) => (c.isChair ? `${c.title} (Chair)` : c.title))
						.join('\n'),
					inline: true,
				});
			}

			if (projects.length > 0) {
				embed.addFields({
					name: '🔧  Projects',
					value: projects.map((p) => (p.isLead ? `${p.title} (Lead)` : p.title)).join('\n'),
					inline: true,
				});
			}

			if (lastEvent) {
				embed.addFields({
					name: '📅  Last seen',
					value: `${lastEvent.title} — ${new Date(lastEvent.startTime).toLocaleDateString(
						'en-US',
						{ month: 'long', day: 'numeric', year: 'numeric' },
					)}`,
					inline: false,
				});
			}

			const links: string[] = [];
			if (member.linkedinURL) links.push(`[LinkedIn](${member.linkedinURL})`);
			if (member.githubURL) links.push(`[GitHub](${member.githubURL})`);
			if (member.websiteURL) links.push(`[Website](${member.websiteURL})`);
			if (member.resumeURL) links.push(`[Résumé](${member.resumeURL})`);
			if (links.length > 0) {
				embed.addFields({ name: '🔗  Links', value: links.join('  •  '), inline: false });
			}

			await interaction.editReply({ content, embeds: [embed] });
		} catch (error) {
			this.client.logger.fail(`Error fetching member info: ${error}`);
			console.error(error);
			await interaction.editReply('An error occurred while fetching member information.');
		}
	}
}
