import { and, eq, sql } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Committees, CommitteeMembers, Members } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateCommitteeInput {
	title: string;
	slug?: string;
	about: string;
	/** Committees.chair_id is NOT NULL — creating one requires picking a chair up front. */
	chairId: string;
}

/** Every committee, with its member count — for the rough Staff Committees & Projects panel. */
export async function listCommitteesWithCounts(db: WattsDb) {
	const rows = await db
		.select({
			id: Committees.id,
			title: Committees.title,
			slug: Committees.slug,
			about: Committees.about,
			chairId: Committees.chairId,
			active: Committees.active,
			memberCount: sql<number>`count(${CommitteeMembers.id})`,
		})
		.from(Committees)
		.leftJoin(CommitteeMembers, eq(CommitteeMembers.committeeId, Committees.id))
		.groupBy(Committees.id);
	return rows.map((row) => ({ ...row, memberCount: Number(row.memberCount) }));
}

export async function createCommittee(db: WattsDb, input: CreateCommitteeInput) {
	const [committee] = await db
		.insert(Committees)
		.values({
			title: input.title,
			slug: input.slug ?? null,
			about: input.about,
			chairId: input.chairId,
		})
		.returning();
	// The chair is also a committee member, flagged isChair — otherwise listCommitteeMembers
	// (and the member's own "my committees" widget) would silently omit them.
	await db.insert(CommitteeMembers).values({
		committeeId: committee.id,
		memberId: input.chairId,
		isChair: true,
	});
	return { committee };
}

/** Members on a committee, with chair status. */
export function listCommitteeMembers(db: WattsDb, committeeId: string) {
	return db
		.select({
			memberId: Members.id,
			firstName: Members.firstName,
			lastName: Members.lastName,
			isChair: CommitteeMembers.isChair,
		})
		.from(CommitteeMembers)
		.innerJoin(Members, eq(Members.id, CommitteeMembers.memberId))
		.where(eq(CommitteeMembers.committeeId, committeeId));
}

export async function addCommitteeMember(db: WattsDb, committeeId: string, memberId: string) {
	const [row] = await db
		.insert(CommitteeMembers)
		.values({ committeeId, memberId })
		.onConflictDoNothing()
		.returning();
	return row ?? null;
}

export async function removeCommitteeMember(db: WattsDb, committeeId: string, memberId: string) {
	await db
		.delete(CommitteeMembers)
		.where(and(eq(CommitteeMembers.committeeId, committeeId), eq(CommitteeMembers.memberId, memberId)));
}

export async function setCommitteeChair(
	db: WattsDb,
	committeeId: string,
	memberId: string,
	isChair: boolean,
) {
	const [row] = await db
		.update(CommitteeMembers)
		.set({ isChair })
		.where(and(eq(CommitteeMembers.committeeId, committeeId), eq(CommitteeMembers.memberId, memberId)))
		.returning();
	if (!row) throw new DomainError('NOT_FOUND', 'That member is not on this committee');
	return row;
}
