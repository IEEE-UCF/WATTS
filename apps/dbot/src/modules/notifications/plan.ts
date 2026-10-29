import type { NotifiableEvent } from '@watts/core/event-notifications';

export interface PlannableKind {
	kind: string;
	graceMs: number;
	fireAt(event: NotifiableEvent): number | null;
}

export interface PlannedNotification {
	kind: string;
	eventId: string;
	fireAt: number;
}

/**
 * Which reminders to set timers for: not yet handled, not missed (due less than
 * `graceMs` ago), and due within `horizonMs`. Pure — the scheduler supplies the events.
 */
export function planNotifications(
	events: NotifiableEvent[],
	kinds: PlannableKind[],
	now: number,
	horizonMs: number,
): PlannedNotification[] {
	const planned: PlannedNotification[] = [];
	for (const event of events) {
		for (const k of kinds) {
			if (event.handled.includes(k.kind)) continue;
			const fireAt = k.fireAt(event);
			if (fireAt === null || !Number.isFinite(fireAt)) continue;
			if (fireAt < now - k.graceMs) continue; // missed while the bot was down
			if (fireAt > now + horizonMs) continue; // a later plan picks it up
			planned.push({ kind: k.kind, eventId: event.id, fireAt });
		}
	}
	return planned.sort((a, b) => a.fireAt - b.fireAt);
}
