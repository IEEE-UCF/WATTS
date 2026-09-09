import { and, asc, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Events, EventAttendees, EventLabels, Members } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateEventInput {
	title: string;
	description: string;
	location: string;
	/** ISO string; normalised to UTC ISO on write. */
	startTime: string;
	endTime?: string;
	committeeId?: string;
	flyerUrl?: string;
	rsvpLink?: string;
	slug?: string;
	requiresDues?: boolean;
	/** FK → event_labels.id. Drives the Google Calendar colour. */
	labelId?: string | null;
	/** Also publish a Discord scheduled event (picked up by the bot reconciler). */
	isGlobal?: boolean;
	/** IANA tz, e.g. "America/New_York". Defaults to Eastern. */
	timeZone?: string;
	allDay?: boolean;
}

export type UpdateEventInput = Partial<CreateEventInput>;

/** Every active event, oldest start first. Raw timestamp strings — the caller formats. */
export async function listActiveEvents(db: WattsDb) {
	return db.select().from(Events).where(eq(Events.active, true)).orderBy(asc(Events.startTime));
}

/** Every event including inactive/soft-deleted — for the staff management grid. */
export async function listAllEvents(db: WattsDb) {
	return db.select().from(Events).orderBy(asc(Events.startTime));
}

export async function getEventById(db: WattsDb, id: string) {
	const [event] = await db.select().from(Events).where(eq(Events.id, id)).limit(1);
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
	return event;
}

export async function getEventBySlug(db: WattsDb, slug: string) {
	const [event] = await db.select().from(Events).where(eq(Events.slug, slug)).limit(1);
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
	return event;
}

export async function createEvent(
	db: WattsDb,
	input: CreateEventInput,
	opts: { createdByUserId?: string | null } = {},
) {
	const [event] = await db
		.insert(Events)
		.values({
			title: input.title,
			description: input.description,
			location: input.location,
			startTime: new Date(input.startTime).toISOString(),
			endTime: input.endTime ? new Date(input.endTime).toISOString() : null,
			committeeId: input.committeeId ?? null,
			flyerUrl: input.flyerUrl ?? null,
			rsvpLink: input.rsvpLink ?? null,
			slug: input.slug ?? null,
			requiresDues: input.requiresDues ?? false,
			labelId: input.labelId ?? null,
			isGlobal: input.isGlobal ?? false,
			timeZone: input.timeZone ?? 'America/New_York',
			allDay: input.allDay ?? false,
			createdByUserId: opts.createdByUserId ?? null,
		})
		.returning();

	const synced = await syncEventToGoogle(db, event.id);
	return { event: synced ?? event };
}

export async function updateEvent(db: WattsDb, id: string, data: UpdateEventInput) {
	const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
	if (data.title !== undefined) patch.title = data.title;
	if (data.description !== undefined) patch.description = data.description;
	if (data.location !== undefined) patch.location = data.location;
	if (data.startTime !== undefined) patch.startTime = new Date(data.startTime).toISOString();
	if (data.endTime !== undefined) patch.endTime = data.endTime ? new Date(data.endTime).toISOString() : null;
	if (data.committeeId !== undefined) patch.committeeId = data.committeeId ?? null;
	if (data.flyerUrl !== undefined) patch.flyerUrl = data.flyerUrl ?? null;
	if (data.rsvpLink !== undefined) patch.rsvpLink = data.rsvpLink ?? null;
	if (data.slug !== undefined) patch.slug = data.slug ?? null;
	if (data.requiresDues !== undefined) patch.requiresDues = data.requiresDues;
	if (data.labelId !== undefined) patch.labelId = data.labelId ?? null;
	if (data.isGlobal !== undefined) patch.isGlobal = data.isGlobal;
	if (data.timeZone !== undefined) patch.timeZone = data.timeZone;
	if (data.allDay !== undefined) patch.allDay = data.allDay;

	const [event] = await db.update(Events).set(patch).where(eq(Events.id, id)).returning();
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

	const synced = await syncEventToGoogle(db, event.id);
	return { event: synced ?? event };
}

/**
 * Soft delete: the website is the source of truth, so a "delete" deactivates the
 * row (keeps it for audit + attendee history) and removes the Google Calendar
 * mirror. The Discord scheduled event is cleaned up by the bot reconciler once
 * the row is no longer active + global.
 */
export async function deleteEvent(db: WattsDb, id: string) {
	const [event] = await db.select().from(Events).where(eq(Events.id, id)).limit(1);
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

	if (event.googleCalendarEventId) {
		try {
			const { createCalendarClient } = await import('@watts/calendar');
			await createCalendarClient().deleteEvent(event.googleCalendarEventId);
		} catch (err) {
			console.error('[deleteEvent] Google Calendar cleanup failed for', id, err);
		}
	}

	await db
		.update(Events)
		.set({
			active: false,
			googleCalendarEventId: null,
			syncStatus: 'synced',
			lastSyncedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(Events.id, id));
}

/**
 * Permanently remove an event (and its attendee rows, via FK cascade) and its
 * Google Calendar mirror. For real cleanup — soft delete via `deleteEvent` is the
 * normal path. Best-effort on the Google side: a failure there is logged, not
 * fatal.
 */
export async function hardDeleteEvent(db: WattsDb, id: string) {
	const [event] = await db.select().from(Events).where(eq(Events.id, id)).limit(1);
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

	if (event.googleCalendarEventId) {
		try {
			const { createCalendarClient } = await import('@watts/calendar');
			await createCalendarClient().deleteEvent(event.googleCalendarEventId);
		} catch (err) {
			console.error('[hardDeleteEvent] Google Calendar cleanup failed for', id, err);
		}
	}

	await db.delete(Events).where(eq(Events.id, id));
}

/**
 * Push one event to Google Calendar (create or update) and record the outcome on
 * the row. Never throws for a sync failure — it sets `syncStatus = 'error'` and
 * returns the row so staff can hit "Re-sync". Reused by the `event.resync`
 * mutation. Returns the (possibly updated) event row, or null if it vanished.
 */
export async function syncEventToGoogle(db: WattsDb, id: string) {
	const [event] = await db.select().from(Events).where(eq(Events.id, id)).limit(1);
	if (!event) return null;

	let label:
		| { slug: string; colorId: string | null; googleLabelId: string | null }
		| null = null;
	if (event.labelId) {
		const [row] = await db
			.select({
				slug: EventLabels.slug,
				colorId: EventLabels.colorId,
				googleLabelId: EventLabels.googleLabelId,
			})
			.from(EventLabels)
			.where(eq(EventLabels.id, event.labelId))
			.limit(1);
		label = row ?? null;
	}

	try {
		const { createCalendarClient } = await import('@watts/calendar');
		const client = createCalendarClient();
		const payload = {
			summary: event.title,
			description: event.description,
			location: event.location,
			start: event.startTime,
			end: event.endTime,
			timeZone: event.timeZone,
			allDay: event.allDay,
			colorId: label?.colorId ?? null,
			googleLabelId: label?.googleLabelId ?? null,
			wattsEventId: event.id,
			wattsLabel: label?.slug ?? null,
		};

		const result = event.googleCalendarEventId
			? await client.updateEvent(event.googleCalendarEventId, payload)
			: await client.createEvent(payload);

		const [updated] = await db
			.update(Events)
			.set({
				googleCalendarEventId: result.googleCalendarEventId ?? event.googleCalendarEventId ?? null,
				syncStatus: result.status === 'skipped' ? 'skipped' : 'synced',
				lastSyncedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.where(eq(Events.id, id))
			.returning();
		return updated ?? event;
	} catch (err) {
		console.error('[syncEventToGoogle] failed for', id, err);
		const [updated] = await db
			.update(Events)
			.set({ syncStatus: 'error', updatedAt: new Date().toISOString() })
			.where(eq(Events.id, id))
			.returning();
		return updated ?? event;
	}
}

// ─────────────────────────── import from Google ───────────────────────────

export interface ImportFromGoogleOptions {
	/** Only consider Google events starting at/after this ISO. Default: start of today. */
	sinceIso?: string;
	/** Refresh already-linked rows when Google's copy is newer. Default false. */
	updateExisting?: boolean;
	/** Report only — write nothing. Default false. */
	dryRun?: boolean;
	/** Stamped onto newly imported rows for audit. */
	importedByUserId?: string | null;
}

export interface ImportedEventSummary {
	googleCalendarEventId: string;
	title: string;
	start: string | null;
	action: 'imported' | 'updated' | 'skipped';
	reason?: string;
}

function startOfTodayIso(): string {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.toISOString();
}

function googleStart(g: import('@watts/calendar').GoogleEvent): string | null {
	if (g.start?.dateTime) return g.start.dateTime;
	if (g.start?.date) return `${g.start.date}T00:00:00Z`;
	return null;
}

function googleEnd(g: import('@watts/calendar').GoogleEvent): string | null {
	if (g.end?.dateTime) return new Date(g.end.dateTime).toISOString();
	if (g.end?.date) return new Date(`${g.end.date}T00:00:00Z`).toISOString();
	return null;
}

/**
 * Pull events off the connected Google Calendar into the `events` table. Existing
 * events already linked by `googleCalendarEventId` are left alone (or refreshed
 * when `updateExisting` + Google's copy is newer). Recurring series contribute a
 * single row (the earliest upcoming instance). No-op when calendar credentials
 * are absent. Idempotent — safe to run repeatedly.
 */
export async function importEventsFromGoogle(db: WattsDb, opts: ImportFromGoogleOptions = {}) {
	const { createCalendarClient } = await import('@watts/calendar');
	const client = createCalendarClient();
	if (!client.enabled) {
		return { enabled: false as const, results: [] as ImportedEventSummary[] };
	}

	const sinceIso = opts.sinceIso ?? startOfTodayIso();
	const googleEvents = await client.listEvents({ timeMinIso: sinceIso, maxResults: 2500 });

	const existing = await db
		.select({
			id: Events.id,
			title: Events.title,
			startTime: Events.startTime,
			gcalId: Events.googleCalendarEventId,
			updatedAt: Events.updatedAt,
			lastSyncedAt: Events.lastSyncedAt,
		})
		.from(Events);
	const linkedByGcalId = new Map(
		existing.filter((e) => e.gcalId).map((e) => [e.gcalId as string, e]),
	);
	// Rows someone already typed into the website but that were never synced —
	// keyed by "title|YYYY-MM-DD" so an import adopts them instead of duplicating.
	const adoptable = new Map<string, (typeof existing)[number]>();
	for (const e of existing) {
		if (e.gcalId) continue;
		adoptable.set(`${e.title.trim().toLowerCase()}|${e.startTime.slice(0, 10)}`, e);
	}
	const adopted = new Set<string>();

	const labels = await db
		.select({ id: EventLabels.id, slug: EventLabels.slug, googleLabelId: EventLabels.googleLabelId })
		.from(EventLabels);
	const labelByGoogleId = new Map(
		labels.filter((l) => l.googleLabelId).map((l) => [l.googleLabelId as string, l.id]),
	);
	const labelBySlug = new Map(labels.map((l) => [l.slug, l.id]));

	const results: ImportedEventSummary[] = [];
	const seenSeries = new Set<string>();

	for (const g of googleEvents) {
		const start = googleStart(g);
		const title = g.summary?.trim() || '(untitled)';
		if (g.status === 'cancelled') {
			results.push({ googleCalendarEventId: g.id, title, start, action: 'skipped', reason: 'cancelled' });
			continue;
		}
		if (!start) {
			results.push({ googleCalendarEventId: g.id, title, start, action: 'skipped', reason: 'no start time' });
			continue;
		}

		const linked = linkedByGcalId.get(g.id);
		if (linked) {
			const gUpdated = g.updated ? new Date(g.updated).getTime() : 0;
			const ourStamp = new Date(linked.lastSyncedAt ?? linked.updatedAt).getTime();
			if (opts.updateExisting && gUpdated > ourStamp) {
				if (!opts.dryRun) {
					await db
						.update(Events)
						.set({
							title,
							description: g.description?.trim() || title,
							location: g.location?.trim() || 'TBA',
							startTime: new Date(start).toISOString(),
							endTime: googleEnd(g),
							allDay: Boolean(g.start?.date),
							timeZone: g.start?.timeZone ?? undefined,
							lastSyncedAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						})
						.where(eq(Events.id, linked.id));
				}
				results.push({ googleCalendarEventId: g.id, title, start, action: 'updated' });
			} else {
				results.push({ googleCalendarEventId: g.id, title, start, action: 'skipped', reason: 'already linked' });
			}
			continue;
		}

		// Adopt a matching website-only row rather than creating a duplicate.
		const adoptKey = `${title.toLowerCase()}|${start.slice(0, 10)}`;
		const twin = adoptable.get(adoptKey);
		if (twin && !adopted.has(twin.id)) {
			adopted.add(twin.id);
			if (!opts.dryRun) {
				await db
					.update(Events)
					.set({
						googleCalendarEventId: g.id,
						syncStatus: 'synced',
						lastSyncedAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					})
					.where(eq(Events.id, twin.id));
			}
			results.push({ googleCalendarEventId: g.id, title, start, action: 'updated', reason: 'linked existing row' });
			continue;
		}

		if (g.recurringEventId) {
			if (seenSeries.has(g.recurringEventId)) {
				results.push({ googleCalendarEventId: g.id, title, start, action: 'skipped', reason: 'recurring instance' });
				continue;
			}
			seenSeries.add(g.recurringEventId);
		}

		const labelId =
			(g.eventLabelId && labelByGoogleId.get(g.eventLabelId)) ||
			(g.extendedProperties?.shared?.wattsLabel &&
				labelBySlug.get(g.extendedProperties.shared.wattsLabel)) ||
			null;

		if (!opts.dryRun) {
			await db.insert(Events).values({
				title,
				description: g.description?.trim() || title,
				location: g.location?.trim() || 'TBA',
				startTime: new Date(start).toISOString(),
				endTime: googleEnd(g),
				allDay: Boolean(g.start?.date),
				timeZone: g.start?.timeZone ?? 'America/New_York',
				labelId,
				googleCalendarEventId: g.id,
				syncStatus: 'synced',
				lastSyncedAt: new Date().toISOString(),
				createdByUserId: opts.importedByUserId ?? null,
				active: true,
			});
		}
		results.push({
			googleCalendarEventId: g.id,
			title,
			start,
			action: 'imported',
			reason: labelId ? undefined : 'no category matched',
		});
	}

	return { enabled: true as const, results };
}

/**
 * Check a member into an event by their Discord id (QR-scan flow).
 * Invariants: event exists + active, member exists + active, not already checked
 * in, dues paid if the event requires them.
 */
export async function checkInMember(db: WattsDb, args: { eventId: string; discordId: string }) {
	const [event] = await db.select().from(Events).where(eq(Events.id, args.eventId)).limit(1);
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
	if (!event.active) throw new DomainError('FORBIDDEN', 'Event is not active');

	const [member] = await db
		.select()
		.from(Members)
		.where(eq(Members.discordId, args.discordId))
		.limit(1);
	if (!member) throw new DomainError('NOT_FOUND', 'Member not found');
	if (!member.active) throw new DomainError('FORBIDDEN', 'Member is not active');

	const [existing] = await db
		.select()
		.from(EventAttendees)
		.where(and(eq(EventAttendees.eventId, args.eventId), eq(EventAttendees.memberId, member.id)))
		.limit(1);
	if (existing) throw new DomainError('CONFLICT', 'Member already checked in');

	if (event.requiresDues && !member.duesPaid) {
		throw new DomainError('FORBIDDEN', 'Dues payment required for this event');
	}

	const [attendee] = await db
		.insert(EventAttendees)
		.values({ eventId: args.eventId, memberId: member.id })
		.returning();
	return { attendee };
}
