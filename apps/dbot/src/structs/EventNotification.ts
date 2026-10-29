import type { NotifiableEvent } from '@watts/core/event-notifications';

export interface EventNotificationOptions {
	/** Stored in event_notifications.kind; one reminder per (event, kind), ever. */
	kind: string;
	/** How late it may still go out (bot was down when it was due). Past that, it's dropped. */
	graceMs: number;
}

/** At fire time: skip (recorded with the reason), or send with whatever `prepare` gathered. */
export type NotificationDecision<T> = { skip: string } | { send: T };

/**
 * A timed reminder about an event. Subclasses live in src/notifications/ and are
 * auto-loaded; the NotificationScheduler (modules/notifications/) plans a timer per
 * event from `fireAt`, then at that time calls `prepare` and, unless it skips, `send`.
 * Claiming, recording and retry-safety are the scheduler's job, not the subclass's.
 */
export abstract class EventNotification<T = unknown> {
	public readonly isEventNotification = true;
	public client: any; // Fritz client instance
	public readonly kind: string;
	public readonly graceMs: number;

	constructor(client: any, options: EventNotificationOptions) {
		this.client = client;
		this.kind = options.kind;
		this.graceMs = options.graceMs;
	}

	/** When this reminder is due for the event (epoch ms), or null if it doesn't apply. */
	abstract fireAt(event: NotifiableEvent): number | null;

	/** Gather what the message needs, or decide it isn't needed after all. */
	abstract prepare(event: NotifiableEvent): Promise<NotificationDecision<T>>;

	/** Post the reminder. Resolves the Discord message id (null if none) and a short summary. */
	abstract send(event: NotifiableEvent, data: T): Promise<{ messageId: string | null; detail?: string }>;
}
