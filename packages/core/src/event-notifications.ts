// Discord event reminders: per-event settings, the events the bot schedules reminders
// for, and the log of what it already sent (event_notifications).
//
// The bot owns the clock (apps/dbot/src/modules/notifications/): it plans timers from
// `listEventsForNotifications`, re-plans when the website signals `events.changed`, and
// records every reminder here so a restart never repeats one.

import { and, count, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import {
	EventAttendees,
	EventNotifications,
	EventPhotos,
	Events,
	Users,
	type EventNotificationSettings,
} from '@watts/db/schema';

export type { EventNotificationSettings };

export const WRAP_UP_DELAY_HOURS_DEFAULT = 24;
export const WRAP_UP_DELAY_HOURS_MAX = 168;

export interface ResolvedEventNotificationSettings {
	wrapUp: boolean;
	wrapUpDelayHours: number;
}

/** Fill in defaults for an event's stored settings (absent keys → defaults). */
export function resolveEventNotificationSettings(
	raw: EventNotificationSettings | null | undefined,
): ResolvedEventNotificationSettings {
	const delay = Number(raw?.wrapUpDelayHours);
	return {
		wrapUp: raw?.wrapUp ?? true,
		wrapUpDelayHours:
			Number.isInteger(delay) && delay >= 1 && delay <= WRAP_UP_DELAY_HOURS_MAX
				? delay
				: WRAP_UP_DELAY_HOURS_DEFAULT,
	};
}

export interface NotifiableEvent {
	id: string;
	number: number;
	title: string;
	slug: string | null;
	startTime: string;
	endTime: string | null;
	settings: ResolvedEventNotificationSettings;
	creatorDiscordId: string | null;
	/** Reminder kinds already handled (sent, skipped or failed) for this event. */
	handled: string[];
}

/** Events that get Discord reminders: global, active, not hidden. */
const remindable = and(eq(Events.isGlobal, true), eq(Events.active, true), eq(Events.hidden, false));

async function selectNotifiable(db: WattsDb, where: SQL | undefined): Promise<NotifiableEvent[]> {
	const rows = await db
		.select({
			id: Events.id,
			number: Events.number,
			title: Events.title,
			slug: Events.slug,
			startTime: Events.startTime,
			endTime: Events.endTime,
			notificationSettings: Events.notificationSettings,
			creatorDiscordId: Users.discordId,
		})
		.from(Events)
		.leftJoin(Users, eq(Users.id, Events.createdByUserId))
		.where(and(remindable, where));
	if (rows.length === 0) return [];

	const handled = await db
		.select({ eventId: EventNotifications.eventId, kind: EventNotifications.kind })
		.from(EventNotifications)
		.where(inArray(EventNotifications.eventId, rows.map((r) => r.id)));
	const handledBy = new Map<string, string[]>();
	for (const h of handled) handledBy.set(h.eventId, [...(handledBy.get(h.eventId) ?? []), h.kind]);

	return rows.map((r) => ({
		id: r.id,
		number: r.number,
		title: r.title,
		slug: r.slug,
		startTime: r.startTime,
		endTime: r.endTime,
		settings: resolveEventNotificationSettings(r.notificationSettings),
		creatorDiscordId: r.creatorDiscordId,
		handled: handledBy.get(r.id) ?? [],
	}));
}

/**
 * Remindable events starting inside [fromIso, toIso], with their creator's Discord id
 * and the reminders already handled. Two queries.
 */
export function listEventsForNotifications(
	db: WattsDb,
	window: { fromIso: string; toIso: string },
): Promise<NotifiableEvent[]> {
	return selectNotifiable(db, and(gte(Events.startTime, window.fromIso), lte(Events.startTime, window.toIso)));
}

/** One event, re-read just before a reminder fires; null if it's no longer remindable. */
export async function getEventForNotification(db: WattsDb, eventId: string): Promise<NotifiableEvent | null> {
	return (await selectNotifiable(db, eq(Events.id, eventId)))[0] ?? null;
}

/** Check-in and photo counts for one event (the wrap-up nudge's "is anything missing?"). */
export async function getEventWrapUpCounts(
	db: WattsDb,
	eventId: string,
): Promise<{ attendeeCount: number; photoCount: number }> {
	const [[attendees], [photos]] = await Promise.all([
		db.select({ n: count() }).from(EventAttendees).where(eq(EventAttendees.eventId, eventId)),
		db.select({ n: count() }).from(EventPhotos).where(eq(EventPhotos.eventId, eventId)),
	]);
	return { attendeeCount: attendees?.n ?? 0, photoCount: photos?.n ?? 0 };
}

/**
 * Claim a reminder before sending it. Resolves false if it was already handled — the
 * unique (event, kind) row is what stops a restarted or duplicate bot sending twice.
 */
export async function claimEventNotification(
	db: WattsDb,
	eventId: string,
	kind: string,
	status: 'sent' | 'skipped',
	detail?: string,
): Promise<boolean> {
	const inserted = await db
		.insert(EventNotifications)
		.values({ eventId, kind, status, detail: detail?.slice(0, 255) ?? null })
		.onConflictDoNothing({ target: [EventNotifications.eventId, EventNotifications.kind] })
		// Bare returning(): the WattsDb driver union can't type the partial-select form.
		.returning();
	return inserted.length > 0;
}

/** Record the outcome after sending (the Discord message id, or why it failed). */
export async function finishEventNotification(
	db: WattsDb,
	eventId: string,
	kind: string,
	outcome: { status: 'sent' | 'failed'; discordMessageId?: string | null; detail?: string },
): Promise<void> {
	await db
		.update(EventNotifications)
		.set({
			status: outcome.status,
			discordMessageId: outcome.discordMessageId ?? null,
			...(outcome.detail !== undefined ? { detail: outcome.detail.slice(0, 255) } : {}),
		})
		.where(and(eq(EventNotifications.eventId, eventId), eq(EventNotifications.kind, kind)));
}

/** Reminder log per event, for the admin events page. */
export async function listEventNotifications(db: WattsDb, eventIds?: string[]) {
	return db
		.select({
			eventId: EventNotifications.eventId,
			kind: EventNotifications.kind,
			status: EventNotifications.status,
			detail: EventNotifications.detail,
			createdAt: EventNotifications.createdAt,
		})
		.from(EventNotifications)
		.where(eventIds ? inArray(EventNotifications.eventId, eventIds) : undefined);
}
