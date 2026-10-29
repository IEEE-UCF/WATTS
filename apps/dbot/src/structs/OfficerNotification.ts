import type { EmbedBuilder } from 'discord.js';
import type { NotifiableEvent } from '@watts/core/event-notifications';
import { adminEventPath } from '@watts/core/event-path';
import { EventNotification } from './EventNotification.ts';

/**
 * An EventNotification for officers: posted in the officers channel (CHANNEL_OFFICERS_ID,
 * else the default logging channel), pinging the event's creator and the officer role
 * (ROLE_OFFICER_ID), linking to the event's admin review page. Subclasses build the
 * message; this handles where it goes and who it pings.
 */
export abstract class OfficerNotification<T = unknown> extends EventNotification<T> {
	private get cfg() {
		return this.client.config.eventNotifications;
	}

	/** Absolute URL of the event's officer/admin review page (/admin/events/<number>). */
	reviewUrl(event: NotifiableEvent): string {
		return `${this.cfg.siteUrl.replace(/\/$/, '')}${adminEventPath(event)}`;
	}

	/** Post to officers; resolves the Discord message id. */
	async postToOfficers(event: NotifiableEvent, message: { text: string; embed: EmbedBuilder }): Promise<string> {
		const channelId: string =
			this.cfg.officersChannel !== '' ? this.cfg.officersChannel : this.client.config.servers.main.channels.defaultLogging;
		const channel = await this.client.channels.fetch(channelId).catch(() => null);
		if (!channel?.isTextBased() || !('send' in channel)) {
			throw new Error(`officers channel ${channelId || '(unset)'} is not a sendable text channel`);
		}

		const creator: string | null = event.creatorDiscordId;
		const role: string = this.cfg.officerRole;
		const mentions = [creator ? `<@${creator}>` : null, role ? `<@&${role}>` : null].filter(Boolean);

		const sent = await channel.send({
			content: [...mentions, message.text].join(' '),
			embeds: [message.embed],
			allowedMentions: { users: creator ? [creator] : [], roles: role ? [role] : [] },
		});
		return sent.id;
	}
}
