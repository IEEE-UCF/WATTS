import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '@/lib/database/client';
import { EventPhotos } from '@watts/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { publicProcedure, capabilityProcedure, createTRPCRouter } from '../trpc';
import { DateTime } from 'luxon';
import { finalizeUpload, UploadError } from '@watts/storage/finalize';
import { getStorage } from '@watts/storage';
import { newPhotoKeys, sanitizeFilename } from '@watts/storage/keys';
import {
	listActiveEvents,
	getEventById,
	getEventBySlug,
	createEvent,
	updateEvent,
	deleteEvent,
	checkInMember,
} from '@watts/core/events';
import { mapDomainError } from '../map-domain-error';

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
type EventRow = Awaited<ReturnType<typeof listActiveEvents>>[number];
function toDisplay(event: EventRow) {
	return {
		...event,
		startTime: toEasternTime(event.startTime),
		endTime: event.endTime ? toEasternTime(event.endTime) : null,
		startTimeRaw: event.startTime,
		endTimeRaw: event.endTime ?? null,
	};
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
});

const eventUpdateSchema = eventCreateSchema.partial();

export const eventRouter = createTRPCRouter({
	getAll: publicProcedure.query(async () => {
		try {
			const events = await listActiveEvents(db);
			return events.map(toDisplay);
		} catch (error) {
			mapDomainError(error);
		}
	}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ input }) => {
			try {
				return toDisplay(await getEventById(db, input.id));
			} catch (error) {
				mapDomainError(error);
			}
		}),

	getBySlug: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ input }) => {
			try {
				return toDisplay(await getEventBySlug(db, input.slug));
			} catch (error) {
				mapDomainError(error);
			}
		}),

	create: manageEvents
		.input(eventCreateSchema)
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await createEvent(db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	update: manageEvents
		.input(z.object({ id: z.string().uuid(), data: eventUpdateSchema }))
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await updateEvent(db, input.id, input.data)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	delete: manageEvents
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input }) => {
			try {
				await deleteEvent(db, input.id);
				return { success: true };
			} catch (error) {
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
		.mutation(async ({ input }) => {
			try {
				return { success: true, ...(await checkInMember(db, input)) };
			} catch (error) {
				mapDomainError(error);
			}
		}),

	// ---- Event photos ----

	/** Public event feed: only photos explicitly marked public (and approved). */
	listPhotos: publicProcedure
		.input(z.object({ eventId: z.string().uuid() }))
		.query(async ({ input }) => {
			return db
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
		.query(async ({ input }) => {
			return db
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
		.query(async ({ input }) => {
			const clauses = [];
			if (input.eventId) clauses.push(eq(EventPhotos.eventId, input.eventId));
			if (input.tag) clauses.push(sql`${input.tag.toLowerCase()} = ANY(${EventPhotos.tags})`);
			if (input.q) {
				clauses.push(
					sql`to_tsvector('english', ${EventPhotos.searchText}) @@ websearch_to_tsquery('english', ${input.q})`,
				);
			}
			return db
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
				return await finalizeUpload(db, {
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
				if (err instanceof UploadError) {
					throw new TRPCError({
						code: err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'BAD_REQUEST',
						message: err.message,
					});
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err instanceof Error ? err.message : 'Failed to finalize photo',
				});
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
		.mutation(async ({ input }) => {
			const [current] = await db
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

			const [updated] = await db
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
		.mutation(async ({ input }) => {
			const [photo] = await db
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
			await db.delete(EventPhotos).where(eq(EventPhotos.id, input.id));
			return { success: true };
		}),
});
