import { EmbedBuilder } from 'discord.js';
import { getEventWrapUpCounts, type NotifiableEvent } from '@watts/core/event-notifications';
import { EventNotification, type NotificationDecision } from '../structs/EventNotification.ts';

const HOUR = 60 * 60 * 1000;
const DEFAULT_DURATION_MS = HOUR;

interface WrapUpData {
	attendeeCount: number;
	photoCount: number;
}

/**
 * Officer wrap-up nudge: some hours after a global event ends (per-event setting,
 * default 24), if it has no photos or no check-ins, ping the event's creator and the
 * officer role in the officers channel with a link to the admin events page.
 */
export class WrapUpNudge extends EventNotification<WrapUpData> {
	constructor(client: any) {
		super(client, { kind: 'wrap-up', graceMs: 3 * 24 * HOUR });
	}

	fireAt(event: NotifiableEvent): number | null {
		if (!event.settings.wrapUp) return null;
		const end = event.endTime ? Date.parse(event.endTime) : Date.parse(event.startTime) + DEFAULT_DURATION_MS;
		return end + event.settings.wrapUpDelayHours * HOUR;
	}

	async prepare(event: NotifiableEvent): Promise<NotificationDecision<WrapUpData>> {
		const counts = await getEventWrapUpCounts(this.client.database.getDB(), event.id);
		if (counts.attendeeCount > 0 && counts.photoCount > 0) {
			return { skip: `already wrapped up (${counts.attendeeCount} check-ins, ${counts.photoCount} photos)` };
		}
		return { send: counts };
	}

	async send(event: NotifiableEvent, counts: WrapUpData): Promise<{ messageId: string | null; detail?: string }> {
		const cfg = this.client.config.eventNotifications;
		const channelId: string =
			cfg.officersChannel !== '' ? cfg.officersChannel : this.client.config.servers.main.channels.defaultLogging;
		const channel = await this.client.channels.fetch(channelId).catch(() => null);
		if (!channel?.isTextBased() || !('send' in channel)) {
			throw new Error(`officers channel ${channelId || '(unset)'} is not a sendable text channel`);
		}

		const missing: string[] = [];
		if (counts.photoCount === 0) missing.push('📸 **Photos**: none uploaded yet');
		if (counts.attendeeCount === 0) missing.push('🎟️ **Check-ins**: none recorded yet');

		const end = event.endTime ? Date.parse(event.endTime) : Date.parse(event.startTime) + DEFAULT_DURATION_MS;
		const adminUrl = `${cfg.siteUrl.replace(/\/$/, '')}/admin/events`;
		const embed = this.client
			.createEmbed()
			.setTitle(`Event wrap-up: ${event.title}`.slice(0, 256))
			.setDescription(
				[
					`Ended <t:${Math.floor(end / 1000)}:R>. Still missing:`,
					...missing.map((m) => `• ${m}`),
					'',
					`Upload photos and record attendance on the [admin events page](${adminUrl}).`,
				].join('\n'),
			) as EmbedBuilder;

		const mentions = [
			event.creatorDiscordId ? `<@${event.creatorDiscordId}>` : null,
			cfg.officerRole ? `<@&${cfg.officerRole}>` : null,
		].filter(Boolean);

		const message = await channel.send({
			content: mentions.length ? `${mentions.join(' ')} — don't forget to wrap up this event!` : undefined,
			embeds: [embed],
			allowedMentions: {
				users: event.creatorDiscordId ? [event.creatorDiscordId] : [],
				roles: cfg.officerRole ? [cfg.officerRole] : [],
			},
		});
		return { messageId: message.id, detail: `missing: ${counts.photoCount ? '' : 'photos '}${counts.attendeeCount ? '' : 'check-ins'}`.trim() };
	}
}
