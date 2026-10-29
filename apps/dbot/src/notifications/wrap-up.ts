import type { EmbedBuilder } from 'discord.js';
import {
	eventEndMs,
	getEventWrapUpCounts,
	notificationDueAt,
	type NotifiableEvent,
} from '@watts/core/event-notifications';
import type { NotificationDecision } from '../structs/EventNotification.ts';
import { OfficerNotification } from '../structs/OfficerNotification.ts';

const HOUR = 60 * 60 * 1000;

interface WrapUpData {
	attendeeCount: number;
	photoCount: number;
}

/**
 * Officer wrap-up nudge: some hours after a global event ends (per-event setting,
 * default 24), if it has no photos or no check-ins, ping the creator + officers with a
 * link to the event's review page (photo upload + check-ins in one place).
 */
export class WrapUpNudge extends OfficerNotification<WrapUpData> {
	constructor(client: any) {
		super(client, { kind: 'wrap-up', graceMs: 3 * 24 * HOUR });
	}

	fireAt(event: NotifiableEvent): number | null {
		return notificationDueAt(event)['wrap-up'];
	}

	async prepare(event: NotifiableEvent): Promise<NotificationDecision<WrapUpData>> {
		const counts = await getEventWrapUpCounts(this.client.database.getDB(), event.id);
		if (counts.attendeeCount > 0 && counts.photoCount > 0) {
			return { skip: `already wrapped up (${counts.attendeeCount} check-ins, ${counts.photoCount} photos)` };
		}
		return { send: counts };
	}

	async send(event: NotifiableEvent, counts: WrapUpData): Promise<{ messageId: string | null; detail?: string }> {
		const reviewUrl = this.reviewUrl(event);
		const missing: string[] = [];
		if (counts.photoCount === 0) missing.push('📸 **Photos**: none uploaded yet');
		if (counts.attendeeCount === 0) missing.push('🎟️ **Check-ins**: none recorded yet');

		const embed = (this.client.createEmbed() as EmbedBuilder)
			.setTitle(`Event wrap-up: ${event.title}`.slice(0, 256))
			.setURL(reviewUrl)
			.setDescription(
				[
					`Ended <t:${Math.floor(eventEndMs(event) / 1000)}:R>. Still missing:`,
					...missing.map((m) => `• ${m}`),
					'',
					`[Open the event page](${reviewUrl}) to upload photos and record check-ins.`,
				].join('\n'),
			);

		const messageId = await this.postToOfficers(event, { text: '— don’t forget to wrap up this event!', embed });
		const detail = ['missing:', counts.photoCount ? null : 'photos', counts.attendeeCount ? null : 'check-ins'];
		return { messageId, detail: detail.filter(Boolean).join(' ') };
	}
}
