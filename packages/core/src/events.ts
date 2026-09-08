import { and, asc, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Events, EventAttendees, Members } from '@watts/db/schema';
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
}

export type UpdateEventInput = Partial<CreateEventInput>;

/** Every active event, oldest start first. Raw timestamp strings — the caller formats. */
export async function listActiveEvents(db: WattsDb) {
	return db.select().from(Events).where(eq(Events.active, true)).orderBy(asc(Events.startTime));
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

export async function createEvent(db: WattsDb, input: CreateEventInput) {
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
		})
		.returning();
	return { event };
}

export async function updateEvent(db: WattsDb, id: string, data: UpdateEventInput) {
	const [event] = await db
		.update(Events)
		.set({ ...data, updatedAt: new Date().toISOString() })
		.where(eq(Events.id, id))
		.returning();
	if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
	return { event };
}

export async function deleteEvent(db: WattsDb, id: string) {
	const [deleted] = await db.delete(Events).where(eq(Events.id, id)).returning();
	if (!deleted) throw new DomainError('NOT_FOUND', 'Event not found');
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
