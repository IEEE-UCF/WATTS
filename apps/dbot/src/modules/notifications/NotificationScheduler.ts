// Timed Discord reminders about website events (src/notifications/*).
//
// The bot owns the clock so nothing polls the database: one read plans in-memory
// timers for the next HORIZON; the plan is redone when the website signals
// `events.changed` (src/signals/events-changed-notifications.ts) and twice a day to
// roll the horizon forward. A timer firing re-reads its one event, then claims the
// reminder in event_notifications (unique per event + kind) before sending, so a
// restart or a second bot instance never sends it twice.

import {
	claimEventNotification,
	finishEventNotification,
	getEventForNotification,
	listEventsForNotifications,
} from '@watts/core/event-notifications';
import type { EventNotification } from '../../structs/EventNotification.ts';
import { planNotifications } from './plan.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Plan timers this far ahead. */
const HORIZON_MS = 7 * DAY;
/** Re-plan this often even without signals (rolls the horizon forward). */
const REPLAN_EVERY_MS = 12 * HOUR;
/** Look back this far for events whose reminders may still be due (max delay + grace). */
const LOOKBACK_MS = 14 * DAY;

export class NotificationScheduler {
	private client: any;
	private timers = new Map<string, NodeJS.Timeout>();
	private replanInterval: NodeJS.Timeout | null = null;
	private started = false;

	constructor(client: any) {
		this.client = client;
	}

	get enabled(): boolean {
		return Boolean(this.client.config.eventNotifications?.enabled);
	}

	private get kinds(): EventNotification[] {
		return [...this.client.notifications.values()];
	}

	async start(): Promise<void> {
		if (this.started) return;
		if (!this.enabled) {
			this.client.logger.log('Event notifications are disabled in config.');
			return;
		}
		this.started = true;
		await this.plan();
		this.replanInterval = setInterval(() => void this.plan(), REPLAN_EVERY_MS);
	}

	stop(): void {
		if (this.replanInterval) clearInterval(this.replanInterval);
		this.replanInterval = null;
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
	}

	/** Read upcoming/recent events and (re)set every reminder timer. */
	async plan(): Promise<void> {
		if (!this.started) return;
		try {
			const now = Date.now();
			const events = await listEventsForNotifications(this.client.database.getDB(), {
				fromIso: new Date(now - LOOKBACK_MS).toISOString(),
				toIso: new Date(now + HORIZON_MS).toISOString(),
			});
			const planned = planNotifications(events, this.kinds, now, HORIZON_MS);

			for (const timer of this.timers.values()) clearTimeout(timer);
			this.timers.clear();
			for (const p of planned) this.schedule(p.kind, p.eventId, p.fireAt);

			const due = planned.filter((p) => p.fireAt <= now).length;
			this.client.logger.log(
				`Event notifications planned: ${planned.length} reminder(s) over ${events.length} event(s)${due ? `, ${due} due now` : ''}.`,
			);
		} catch (error) {
			this.client.logger.fail(`Event notification planning failed: ${error}`);
		}
	}

	private schedule(kind: string, eventId: string, fireAt: number): void {
		const key = `${kind}:${eventId}`;
		const existing = this.timers.get(key);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.timers.delete(key);
			void this.fire(kind, eventId);
		}, Math.max(0, fireAt - Date.now()));
		this.timers.set(key, timer);
	}

	/** A timer went off: re-check the event, claim the reminder, send it. */
	private async fire(kind: string, eventId: string): Promise<void> {
		const notification = this.client.notifications.get(kind) as EventNotification | undefined;
		if (!notification) return;
		const db = this.client.database.getDB();
		const label = `${kind} for event ${eventId}`;

		try {
			const event = await getEventForNotification(db, eventId);
			if (!event || event.handled.includes(kind)) return; // archived/hidden/un-globaled, or done

			const fireAt = notification.fireAt(event);
			const now = Date.now();
			if (fireAt === null || fireAt < now - notification.graceMs) return;
			if (fireAt > now + 60_000) {
				// The event moved later without a re-plan reaching us — wait for the new time.
				this.schedule(kind, eventId, fireAt);
				return;
			}

			const decision = await notification.prepare(event);
			if ('skip' in decision) {
				if (await claimEventNotification(db, eventId, kind, 'skipped', decision.skip)) {
					this.client.logger.log(`Notification ${label} skipped: ${decision.skip}`);
				}
				return;
			}

			if (!(await claimEventNotification(db, eventId, kind, 'sent'))) return; // someone else sent it
			try {
				const result = await notification.send(event, decision.send);
				await finishEventNotification(db, eventId, kind, {
					status: 'sent',
					discordMessageId: result.messageId,
					detail: result.detail,
				});
				this.client.logger.success(`Notification sent: ${kind} for "${event.title}".`);
			} catch (error) {
				await finishEventNotification(db, eventId, kind, { status: 'failed', detail: String(error) });
				this.client.logger.fail(`Notification ${label} failed to send: ${error}`);
			}
		} catch (error) {
			this.client.logger.fail(`Notification ${label} errored: ${error}`);
		}
	}
}
