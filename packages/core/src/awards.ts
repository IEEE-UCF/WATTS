import { and, desc, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Awards } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateAwardInput {
	category: string;
	eventName: string;
	place: string;
	year: number;
	projectId?: string;
	memberId?: string;
	description?: string;
}

export type UpdateAwardInput = Partial<CreateAwardInput>;

export function listAwards(db: WattsDb, filter?: { year?: number }) {
	const conditions = [eq(Awards.active, true)];
	if (filter?.year !== undefined) conditions.push(eq(Awards.year, filter.year));
	return db.select().from(Awards).where(and(...conditions)).orderBy(desc(Awards.year));
}

export async function getAwardById(db: WattsDb, id: string) {
	const [award] = await db.select().from(Awards).where(eq(Awards.id, id)).limit(1);
	if (!award) throw new DomainError('NOT_FOUND', 'Award not found');
	return award;
}

export async function createAward(db: WattsDb, input: CreateAwardInput) {
	const [award] = await db
		.insert(Awards)
		.values({
			category: input.category,
			eventName: input.eventName,
			place: input.place,
			year: input.year,
			projectId: input.projectId ?? null,
			memberId: input.memberId ?? null,
			description: input.description ?? null,
		})
		.returning();
	return { award };
}

export async function updateAward(db: WattsDb, id: string, data: UpdateAwardInput) {
	const [award] = await db.update(Awards).set(data).where(eq(Awards.id, id)).returning();
	if (!award) throw new DomainError('NOT_FOUND', 'Award not found');
	return { award };
}

export async function deleteAward(db: WattsDb, id: string) {
	const [deleted] = await db.delete(Awards).where(eq(Awards.id, id)).returning();
	if (!deleted) throw new DomainError('NOT_FOUND', 'Award not found');
}
