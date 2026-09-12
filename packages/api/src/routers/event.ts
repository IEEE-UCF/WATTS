import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { EventPhotos } from '@watts/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { publicProcedure, capabilityProcedure, createTRPCRouter } from '../trpc';
import { DateTime } from 'luxon';
import { finalizeUpload } from '@watts/storage/finalize';
import { getStorage } from '@watts/storage';
import { eventFlyerKey, newPhotoKeys, sanitizeFilename } from '@watts/storage/keys';
import {
	listActiveEvents,
	listAllEvents,
	getEventById,
	getEventBySlug,
	createEvent,
	updateEvent,
	deleteEvent,
	restoreEvent,
	hardDeleteEvent,
	syncEventToGoogle,
	importEventsFromGoogle,
	checkInMember,
} from '@watts/core/events';
import { listLabels } from '@watts/core/event-labels';
import { mapDomainError, mapUploadError } from '../map-domain-error';

const manageEvents = capabilityProcedure('manage_events');
const scanAttendance = capabilityProcedure('scan_attendance');
const managePhotos = capabilityProcedure('manage_event_photos');

// Helper to convert a Postgres timestamptz string to an Eastern time display string.
//
// schema.ts uses mode: 'string' on all timestamp columns, so Drizzle returns the raw
// Postgres wire format: "2026-03-09 19:30:00+00" — note the SPACE instead of 'T'.
// DateTime.fromISO() requires ISO 8601 with a 'T' separator and will return Invalid
// if given a space-separated string, producing wrong/blank times on the frontend.
//
// Fix: normalise to ISO 8601 before parsing, then let Luxon handle the timezone offset.
function toEasternTime(time: string): string {
	// Replace the space between date and time with 'T' to make it valid ISO 8601.
	// Also normalise "+00" → "+00:00" if present (Postgres sometimes omits the minutes).
	const iso = time
		.replace(' ', 'T') // "2026-03-09 19:30:00+00" → "2026-03-09T19:30:00+00"
		.replace(/([+-]\d{2})$/, '$1:00'); // "+00" → "+00:00"  (no-op if already "+00:00")

	const dt = DateTime.fromISO(iso); // Luxon reads the offset from the string itself

	if (!dt.isValid) {
		console.warn('[toEasternTime] Failed to parse timestamp:', time, '→', iso, dt.invalidReason);
		return time; // fall back to raw string rather than showing nothing
	}

	return dt.setZone('America/New_York').toFormat('MMMM d, yyyy h:mm a');
}

// Presentation shape for an events row: human-readable Eastern strings for display
// plus the raw UTC strings for reliable client-side Date parsing/sorting.
type EventRow = Awaited<ReturnType<typeof listAllEvents>>[number];
type LabelRow = Awaited<ReturnType<typeof listLabels>>[number];

function toDisplay(event: EventRow, label: LabelRow | null = null) {
	return {
		...event,
		startTime: toEasternTime(event.startTime),
		endTime: event.endTime ? toEasternTime(event.endTime) : null,
		startTimeRaw: event.startTime,
		endTimeRaw: event.endTime ?? null,
		label: label
			? { id: label.id, name: label.name, slug: label.slug, colorId: label.colorId, hex: label.hex }
			: null,
	};
}

async function withLabels(
	events: EventRow[],
	labels: LabelRow[],
): Promise<ReturnType<typeof toDisplay>[]> {
	const byId = new Map(labels.map((l) => [l.id, l]));
	return events.map((e) => toDisplay(e, e.labelId ? byId.get(e.labelId) ?? null : null));
}

// Validation schemas
const eventCreateSchema = z.object({
	title: z.string().min(1, 'Event title is required').max(255),
	description: z.string().min(1, 'Description is required'),
	location: z.string().min(1, 'Location is required').max(255),
	startTime: z.string(),
	endTime: z.string().optional(),
	committeeId: z.string().uuid().optional(),
	flyerUrl: z.string().max(500).optional(),
	rsvpLink: z.string().max(500).optional(),
	slug: z.string().max(64).optional(),
	requiresDues: z.boolean().optional(),
	labelId: z.string().uuid().nullish(),
	isGlobal: z.boolean().optional(),
	hidden: z.boolean().optional(),
	timeZone: z.string().max(64).optional(),
	allDay: z.boolean().optional(),
	needsRoomReservation: z.boolean().optional(),
	manuallyGivenRoom: z.boolean().optional(),
	pingCreatorOnUpdate: z.boolean().optional(),
});

const eventUpdateSchema = eventCreateSchema.partial();

export const eventRouter = createTRPCRouter({
	getAll: publicProcedure.query(async ({ ctx }) => {
		try {
			const [events, labels] = await Promise.all([listActiveEvents(ctx.db), listLabels(ctx.db)]);
			return withLabels(events, labels);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	/** Staff grid: every event including inactive/soft-deleted ones. */
	getAllForAdmin: manageEvents.query(async ({ ctx }) => {
		try {
			const [events, labels] = await Promise.all([listAllEvents(ctx.db), listLabels(ctx.db)]);
			return withLabels(events, labels);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			try {
				const event = await getEventById(ctx.db, input.id);
				const labels = event.labelId ? await listLabels(ctx.db) : [];
				return toDisplay(event, labels.find((l) => l.id === event.labelId) ?? null);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getBySlug: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const event = await getEventBySlug(ctx.db, input.slug);
				const labels = event.labelId ? await listLabels(ctx.db) : [];
				return toDisplay(event, labels.find((l) => l.id === event.labelId) ?? null);
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/**
	 * The soonest upcoming active event in a given category (label slug), or null.
	 * Used by the homepage GBM countdown — pass `{ labelSlug: 'gbm' }`.
	 */
	next: publicProcedure
		.input(z.object({ labelSlug: z.string().max(32) }))
		.query(async ({ ctx, input }) => {
			try {
				const [events, labels] = await Promise.all([
					listActiveEvents(ctx.db),
					listLabels(ctx.db),
				]);
				const label = labels.find((l) => l.slug === input.labelSlug);
				if (!label) return null;
				const now = Date.now();
				// listActiveEvents is already ordered by startTime asc.
				const upcoming = events.find(
					(e) => e.labelId === label.id && new Date(e.startTime).getTime() >= now,
				);
				return upcoming ? toDisplay(upcoming, label) : null;
			} catch (error) {
				mapDomainError(error);
			}
		}),

	create: manageEvents
		.input(eventCreateSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return {
					success: true,
					...(await createEvent(ctx.db, input, { createdByUserId: ctx.session.user.id })),
				};
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: manageEvents
		.input(z.object({ id: z.string().uuid(), data: eventUpdateSchema }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await updateEvent(ctx.db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: manageEvents
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await deleteEvent(ctx.db, input.id);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** Undo an archive: reactivate the event and re-publish it to Google Calendar. */
	restore: manageEvents
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await restoreEvent(ctx.db, input.id)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** Permanently remove an event + its attendees + its Google Calendar mirror. */
	hardDelete: manageEvents
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await hardDeleteEvent(ctx.db, input.id);
				return { success: true };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** Called by the admin UI after a flyer's bytes have landed in the public bucket. */
	confirmFlyer: manageEvents
		.input(z.object({ eventId: z.string().uuid(), filename: z.string().max(255).optional() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await finalizeUpload(ctx.db, {
					kind: 'event-flyer',
					key: eventFlyerKey(input.eventId),
					userId: ctx.session.user.id,
					eventId: input.eventId,
					filename: sanitizeFilename(input.filename),
				});
			} catch (err) {
				mapUploadError(err);
			}
		}),

	/**
	 * Pull events already on the Google Calendar into the DB. `dryRun` previews
	 * without writing. Idempotent — re-running only imports newly-seen events.
	 */
	importFromGoogle: manageEvents
		.input(
			z
				.object({
					dryRun: z.boolean().optional(),
					updateExisting: z.boolean().optional(),
					sinceDays: z.number().int().min(0).max(3650).optional(),
				})
				.optional(),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const sinceIso =
					input?.sinceDays != null
						? new Date(Date.now() - input.sinceDays * 86_400_000).toISOString()
						: undefined;
				const { enabled, results } = await importEventsFromGoogle(ctx.db, {
					dryRun: input?.dryRun,
					updateExisting: input?.updateExisting,
					sinceIso,
					importedByUserId: ctx.session.user.id,
				});
				const count = (a: string) => results.filter((r) => r.action === a).length;
				return {
					success: true,
					enabled,
					dryRun: Boolean(input?.dryRun),
					imported: count('imported'),
					updated: count('updated'),
					skipped: count('skipped'),
					results,
				};
			} catch (error) {
				mapDomainError(error);
			}
		}),

	/** Retry the Google Calendar mirror for one event (after a syncStatus 'error'). */
	resync: manageEvents
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const event = await syncEventToGoogle(ctx.db, input.id);
				if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
				return { success: true, syncStatus: event.syncStatus, lastSyncedAt: event.lastSyncedAt };
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				mapDomainError(error);
			}
		}),

	/**
	 * Add an attendee to an event via QR code scan.
	 * Requires officer or admin privileges (scanner is officer-facing).
	 * Validates: event active, member active, no duplicate, dues if required.
	 */
	addAttendee: scanAttendance
		.input(
			z.object({
				eventId: z.string().uuid(),
				discordId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				return { success: true, ...(await checkInMember(ctx.db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// ---- Event photos ----

	/** Public event feed: only photos explicitly marked public (and approved). */
	listPhotos: publicProcedure
		.input(z.object({ eventId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select({
					id: EventPhotos.id,
					webUrl: EventPhotos.webUrl,
					caption: EventPhotos.caption,
					tags: EventPhotos.tags,
					featured: EventPhotos.featured,
					width: EventPhotos.width,
					height: EventPhotos.height,
					takenAt: EventPhotos.takenAt,
					createdAt: EventPhotos.createdAt,
				})
				.from(EventPhotos)
				.where(
					and(
						eq(EventPhotos.eventId, input.eventId),
						eq(EventPhotos.approved, true),
						eq(EventPhotos.visibility, 'public'),
					),
				)
				.orderBy(desc(EventPhotos.featured), desc(EventPhotos.createdAt));
		}),

	/** Internal grid: every photo for an event. Officers + admins. */
	adminListPhotos: managePhotos
		.input(z.object({ eventId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select()
				.from(EventPhotos)
				.where(eq(EventPhotos.eventId, input.eventId))
				.orderBy(desc(EventPhotos.createdAt));
		}),

	/** Keyword / tag / event lookup across photos. Officers + admins. */
	searchPhotos: managePhotos
		.input(
			z.object({
				q: z.string().max(200).optional(),
				tag: z.string().max(40).optional(),
				eventId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.query(async ({ ctx, input }) => {
			const clauses = [];
			if (input.eventId) clauses.push(eq(EventPhotos.eventId, input.eventId));
			if (input.tag) clauses.push(sql`${input.tag.toLowerCase()} = ANY(${EventPhotos.tags})`);
			if (input.q) {
				clauses.push(
					sql`to_tsvector('english', ${EventPhotos.searchText}) @@ websearch_to_tsquery('english', ${input.q})`,
				);
			}
			return ctx.db
				.select()
				.from(EventPhotos)
				.where(clauses.length ? and(...clauses) : undefined)
				.orderBy(desc(EventPhotos.createdAt))
				.limit(input.limit);
		}),

	/** Called by the admin UI after each photo's bytes have landed in storage. */
	confirmPhoto: managePhotos
		.input(
			z.object({
				eventId: z.string().uuid(),
				photoId: z.string().uuid(),
				filename: z.string().max(255).optional(),
				width: z.number().int().positive().optional(),
				height: z.number().int().positive().optional(),
				takenAt: z.string().datetime().optional(),
				caption: z.string().max(2000).optional(),
				tags: z.array(z.string().max(40)).max(20).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const keys = newPhotoKeys(input.eventId, input.photoId);
			try {
				return await finalizeUpload(ctx.db, {
					kind: 'event-photo',
					key: keys.webKey,
					userId: ctx.session.user.id,
					eventId: input.eventId,
					photoId: input.photoId,
					filename: sanitizeFilename(input.filename),
					width: input.width ?? null,
					height: input.height ?? null,
					takenAt: input.takenAt ?? null,
					caption: input.caption ?? null,
					tags: input.tags ?? [],
				});
			} catch (err) {
				mapUploadError(err);
			}
		}),

	updatePhoto: managePhotos
		.input(
			z.object({
				id: z.string().uuid(),
				caption: z.string().max(2000).nullish(),
				tags: z.array(z.string().max(40)).max(20).optional(),
				featured: z.boolean().optional(),
				visibility: z.enum(['public', 'members', 'private']).optional(),
				approved: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [current] = await ctx.db
				.select()
				.from(EventPhotos)
				.where(eq(EventPhotos.id, input.id))
				.limit(1);
			if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found' });

			const caption = input.caption === undefined ? current.caption : input.caption;
			const tags = input.tags ?? current.tags;
			const searchText = [caption ?? '', tags.join(' '), current.sourceFilename ?? '']
				.join(' ')
				.trim();

			const [updated] = await ctx.db
				.update(EventPhotos)
				.set({
					caption: caption ?? null,
					tags,
					featured: input.featured ?? current.featured,
					visibility: input.visibility ?? current.visibility,
					approved: input.approved ?? current.approved,
					searchText,
				})
				.where(eq(EventPhotos.id, input.id))
				.returning();

			return { success: true, photo: updated };
		}),

	deletePhoto: managePhotos
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const [photo] = await ctx.db
				.select()
				.from(EventPhotos)
				.where(eq(EventPhotos.id, input.id))
				.limit(1);
			if (!photo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found' });

			const storage = await getStorage();
			for (const key of [photo.webKey, photo.thumbKey, photo.originalKey]) {
				if (!key) continue;
				await storage.delete({ key, bucket: 'private' }).catch(() => undefined);
			}
			await ctx.db.delete(EventPhotos).where(eq(EventPhotos.id, input.id));
			return { success: true };
		}),
});
