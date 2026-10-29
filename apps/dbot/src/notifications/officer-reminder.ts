import type { EmbedBuilder } from 'discord.js';
import { notificationDueAt, type NotifiableEvent } from '@watts/core/event-notifications';
import type { NotificationDecision } from '../structs/EventNotification.ts';
import { OfficerNotification } from '../structs/OfficerNotification.ts';

const MINUTE = 60 * 1000;

/**
 * Officer heads-up shortly before a global event starts (per-event setting, default
 * 15 minutes): ping the creator + officers with a link to the event's review page, where
 * the check-in scanner opens already set to this event.
 */
export class OfficerReminder extends OfficerNotification<null> {
	constructor(client: any) {
		// If the bot was down when it was due, still send it — but never once the event
		// has started (prepare skips that).
		super(client, { kind: 'officer-reminder', graceMs: 60 * MINUTE });
	}

	fireAt(event: NotifiableEvent): number | null {
		return notificationDueAt(event)['officer-reminder'];
	}

	prepare(event: NotifiableEvent): Promise<NotificationDecision<null>> {
		if (Date.now() >= Date.parse(event.startTime)) {
			return Promise.resolve({ skip: 'event had already started' });
		}
		return Promise.resolve({ send: null });
	}

	async send(event: NotifiableEvent): Promise<{ messageId: string | null; detail?: string }> {
		const start = Math.floor(Date.parse(event.startTime) / 1000);
		const reviewUrl = this.reviewUrl(event);
		const embed = (this.client.createEmbed() as EmbedBuilder)
			.setTitle(`Starting soon: ${event.title}`.slice(0, 256))
			.setURL(reviewUrl)
			.setDescription(
				[
					`Starts <t:${start}:R> (<t:${start}:t>) · 📍 ${event.location}`,
					'',
					`[Open the event page](${reviewUrl}) for the check-in scanner and photo upload.`,
				].join('\n'),
			);

		const minutes = event.settings.officerReminderMinutes;
		const messageId = await this.postToOfficers(event, {
			text: `— **${event.title}** starts in ${minutes} minute${minutes === 1 ? '' : 's'}. Get check-in ready!`,
			embed,
		});
		return { messageId };
	}
}
