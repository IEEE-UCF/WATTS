import { asc, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { MeetingTimes } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateMeetingTimeInput {
	title: string;
	dayOfWeek: number;
	startTime: string;
	endTime?: string;
	location?: string;
}

export type UpdateMeetingTimeInput = Partial<CreateMeetingTimeInput>;

export function listMeetingTimes(db: WattsDb) {
	return db
		.select()
		.from(MeetingTimes)
		.where(eq(MeetingTimes.active, true))
		.orderBy(asc(MeetingTimes.dayOfWeek), asc(MeetingTimes.startTime));
}

export async function createMeetingTime(db: WattsDb, input: CreateMeetingTimeInput) {
	const [meetingTime] = await db
		.insert(MeetingTimes)
		.values({
			title: input.title,
			dayOfWeek: input.dayOfWeek,
			startTime: input.startTime,
			endTime: input.endTime ?? null,
			location: input.location ?? null,
		})
		.returning();
	return { meetingTime };
}

export async function updateMeetingTime(db: WattsDb, id: string, data: UpdateMeetingTimeInput) {
	const [meetingTime] = await db
		.update(MeetingTimes)
		.set(data)
		.where(eq(MeetingTimes.id, id))
		.returning();
	if (!meetingTime) throw new DomainError('NOT_FOUND', 'Meeting time not found');
	return { meetingTime };
}

export async function deleteMeetingTime(db: WattsDb, id: string) {
	const [deleted] = await db.delete(MeetingTimes).where(eq(MeetingTimes.id, id)).returning();
	if (!deleted) throw new DomainError('NOT_FOUND', 'Meeting time not found');
}
