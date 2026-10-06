// Read models for the public event page (/events/[number]/[slug]) and the event lists
// on committee pages. Everything here is public: hidden or deleted events are never
// returned, photos must be approved + public, and attendance is a count only.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import {
	Committees,
	EventAttendees,
	EventLabels,
	EventPhotos,
	Events,
	RoomReservations,
} from '@watts/db/schema';
import { findRedirect } from './redirects';

/** A row in an event list: enough for a card or a dated row, plus its page address. */
export interface EventSummary {
	id: string;
	/** Permanent; the part of the URL that's actually looked up. */
	number: number;
	/** Readable part of the URL, from the title. */
	slug: string;
	title: string;
	startTime: string;
	endTime: string | null;
	allDay: boolean;
	timeZone: string;
	location: string;
	flyerUrl: string | null;
	label: { name: string; hex: string | null } | null;
	/** Past events only; null for upcoming ones. */
	attendanceCount: number | null;
}

export { eventPath } from './event-path';

export interface PublicEventPhoto {
	id: string;
	url: string;
	caption: string | null;
}

export interface PublicEventPage extends EventSummary {
	description: string;
	rsvpLink: string | null;
	requiresDues: boolean;
	/** Confirmed room, when it differs from the free-text location. */
	room: string | null;
	committee: { title: string; slug: string | null } | null;
	isPast: boolean;
	photos: PublicEventPhoto[];
	/** Up to 3 upcoming events: this committee's first, then the rest of the calendar. */
	more: EventSummary[];
}

const visible = and(eq(Events.active, true), eq(Events.hidden, false));

/** The moment an event counts as over: its end, else its start. */
function endOf(e: { startTime: string; endTime: string | null }): number {
	return new Date(e.endTime ?? e.startTime).getTime();
}

const summaryColumns = {
	id: Events.id,
	number: Events.number,
	slug: Events.slug,
	title: Events.title,
	startTime: Events.startTime,
	endTime: Events.endTime,
	allDay: Events.allDay,
	timeZone: Events.timeZone,
	location: Events.location,
	flyerUrl: Events.flyerUrl,
	labelName: EventLabels.name,
	labelHex: EventLabels.hex,
};

interface SummaryRow {
	id: string;
	number: number;
	slug: string | null;
	title: string;
	startTime: string;
	endTime: string | null;
	allDay: boolean;
	timeZone: string;
	location: string;
	flyerUrl: string | null;
	labelName: string | null;
	labelHex: string | null;
}

async function attendanceCounts(db: WattsDb, eventIds: string[]): Promise<Map<string, number>> {
	if (eventIds.length === 0) return new Map();
	const rows = await db
		.select({ eventId: EventAttendees.eventId, n: count() })
		.from(EventAttendees)
		.where(inArray(EventAttendees.eventId, eventIds))
		.groupBy(EventAttendees.eventId);
	return new Map(rows.map((r) => [r.eventId, Number(r.n)]));
}

function toSummary(r: SummaryRow, counts: Map<string, number>, now: number): EventSummary {
	return {
		id: r.id,
		number: r.number,
		slug: r.slug || 'event',
		title: r.title,
		startTime: r.startTime,
		endTime: r.endTime,
		allDay: r.allDay,
		timeZone: r.timeZone,
		location: r.location,
		flyerUrl: r.flyerUrl,
		label: r.labelName ? { name: r.labelName, hex: r.labelHex } : null,
		attendanceCount: endOf(r) < now ? (counts.get(r.id) ?? 0) : null,
	};
}

/** Upcoming (soonest first) and recent past (newest first) events for one committee. */
export async function listCommitteeEvents(
	db: WattsDb,
	committeeId: string,
	opts: { upcoming?: number; past?: number } = {},
): Promise<{ upcoming: EventSummary[]; past: EventSummary[] }> {
	const nowIso = new Date().toISOString();
	const [upcoming, past] = await Promise.all([
		db
			.select(summaryColumns)
			.from(Events)
			.leftJoin(EventLabels, eq(EventLabels.id, Events.labelId))
			.where(and(visible, eq(Events.committeeId, committeeId), gte(Events.startTime, nowIso)))
			.orderBy(asc(Events.startTime))
			.limit(opts.upcoming ?? 3),
		db
			.select(summaryColumns)
			.from(Events)
			.leftJoin(EventLabels, eq(EventLabels.id, Events.labelId))
			.where(and(visible, eq(Events.committeeId, committeeId), lt(Events.startTime, nowIso)))
			.orderBy(desc(Events.startTime))
			.limit(opts.past ?? 4),
	]);
	const counts = await attendanceCounts(
		db,
		past.map((p) => p.id),
	);
	const now = Date.now();
	return {
		upcoming: upcoming.map((r) => toSummary(r, counts, now)),
		past: past.map((r) => toSummary(r, counts, now)),
	};
}

/** Everything the event page shows, or null when there's no visible event with that number. */
export async function getPublicEventPage(
	db: WattsDb,
	number: number,
): Promise<PublicEventPage | null> {
	if (!Number.isSafeInteger(number) || number < 1) return null;
	const [row] = await db
		.select({
			...summaryColumns,
			description: Events.description,
			rsvpLink: Events.rsvpLink,
			requiresDues: Events.requiresDues,
			committeeId: Events.committeeId,
			committeeTitle: Committees.title,
			committeeSlug: Committees.slug,
			committeePublished: Committees.published,
		})
		.from(Events)
		.leftJoin(EventLabels, eq(EventLabels.id, Events.labelId))
		.leftJoin(Committees, eq(Committees.id, Events.committeeId))
		.where(and(visible, eq(Events.number, number)))
		.limit(1);
	if (!row) return null;

	const now = Date.now();
	const isPast = endOf(row) < now;
	const nowIso = new Date(now).toISOString();

	const [room] = await db
		.select({ room: RoomReservations.room })
		.from(RoomReservations)
		.where(
			and(
				eq(RoomReservations.eventId, row.id),
				eq(RoomReservations.status, 'confirmed'),
				isNotNull(RoomReservations.room),
			),
		)
		.limit(1);

	const photos = isPast
		? await db
				.select({ id: EventPhotos.id, url: EventPhotos.webUrl, caption: EventPhotos.caption })
				.from(EventPhotos)
				.where(
					and(
						eq(EventPhotos.eventId, row.id),
						eq(EventPhotos.approved, true),
						eq(EventPhotos.visibility, 'public'),
					),
				)
				.orderBy(desc(EventPhotos.featured), asc(EventPhotos.takenAt), asc(EventPhotos.createdAt))
				.limit(48)
		: [];

	// This committee's next events first, then anything else coming up.
	const upcomingOthers = await db
		.select({ ...summaryColumns, committeeId: Events.committeeId })
		.from(Events)
		.leftJoin(EventLabels, eq(EventLabels.id, Events.labelId))
		.where(and(visible, ne(Events.id, row.id), gte(Events.startTime, nowIso)))
		.orderBy(
			row.committeeId
				? sql`case when ${Events.committeeId} = ${row.committeeId} then 0 else 1 end`
				: asc(Events.startTime),
			asc(Events.startTime),
		)
		.limit(3);

	const counts = isPast ? await attendanceCounts(db, [row.id]) : new Map<string, number>();
	const roomName = room?.room?.trim() || null;

	return {
		...toSummary(row, counts, now),
		description: row.description,
		rsvpLink: row.rsvpLink,
		requiresDues: row.requiresDues,
		room: roomName && roomName.toLowerCase() !== row.location.trim().toLowerCase() ? roomName : null,
		committee: row.committeeTitle
			? { title: row.committeeTitle, slug: row.committeePublished ? row.committeeSlug : null }
			: null,
		isPast,
		photos,
		more: upcomingOthers.map((r) => toSummary(r, new Map(), now)),
	};
}

/**
 * Where an old-style /events/[slug] link (shared before numbered URLs) should go now:
 * a saved old address first, else the one visible event that still has that slug.
 * Null when it's unknown, hidden, or ambiguous (two events share the name).
 */
export async function resolveLegacyEventSlug(
	db: WattsDb,
	slug: string,
): Promise<{ number: number; slug: string } | null> {
	const targetId = await findRedirect(db, 'event', slug);
	const rows = await db
		.select({ number: Events.number, slug: Events.slug })
		.from(Events)
		.where(and(visible, targetId ? eq(Events.id, targetId) : eq(Events.slug, slug)))
		.limit(2);
	if (rows.length !== 1) return null;
	return { number: rows[0].number, slug: rows[0].slug || 'event' };
}

/** Visible events that start within ±`days` of now, for prebuilding their pages. */
export async function listRecentEventRefs(
	db: WattsDb,
	days = 60,
): Promise<{ number: number; slug: string }[]> {
	const from = new Date(Date.now() - days * 86_400_000).toISOString();
	const to = new Date(Date.now() + days * 86_400_000).toISOString();
	const rows = await db
		.select({ number: Events.number, slug: Events.slug })
		.from(Events)
		.where(and(visible, gte(Events.startTime, from), lt(Events.startTime, to)));
	return rows.map((r) => ({ number: r.number, slug: r.slug || 'event' }));
}
