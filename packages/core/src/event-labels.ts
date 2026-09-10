// Domain layer for the adjustable event category set (`event_labels`).
// Staff CRUD these in /admin/events/labels; events reference a label by id and the
// calendar sync maps `label.colorId` → Google Calendar colorId.

import { asc, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { EventLabels } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateLabelInput {
	name: string;
	slug: string;
	colorId?: string | null;
	/** Native Google Calendar event-label UUID (for calendars using Event Labels). */
	googleLabelId?: string | null;
	hex?: string | null;
	sortOrder?: number;
}

export type UpdateLabelInput = Partial<CreateLabelInput> & { active?: boolean };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string) {
	if (!SLUG_RE.test(slug) || slug.length > 32) {
		throw new DomainError('BAD_REQUEST', 'Slug must be kebab-case, ≤32 chars (a-z, 0-9, -)');
	}
}

/** All labels, active first then by sortOrder. Pass `activeOnly` for form selects. */
export async function listLabels(db: WattsDb, opts: { activeOnly?: boolean } = {}) {
	const rows = await db.select().from(EventLabels).orderBy(asc(EventLabels.sortOrder), asc(EventLabels.name));
	return opts.activeOnly ? rows.filter((r) => r.active) : rows;
}

export async function getLabelById(db: WattsDb, id: string) {
	const [row] = await db.select().from(EventLabels).where(eq(EventLabels.id, id)).limit(1);
	if (!row) throw new DomainError('NOT_FOUND', 'Label not found');
	return row;
}

export async function createLabel(db: WattsDb, input: CreateLabelInput) {
	assertSlug(input.slug);
	const [existing] = await db
		.select({ id: EventLabels.id })
		.from(EventLabels)
		.where(eq(EventLabels.slug, input.slug))
		.limit(1);
	if (existing) throw new DomainError('CONFLICT', `A label with slug "${input.slug}" already exists`);

	const [label] = await db
		.insert(EventLabels)
		.values({
			name: input.name,
			slug: input.slug,
			colorId: input.colorId ?? null,
			googleLabelId: input.googleLabelId ?? null,
			hex: input.hex ?? null,
			sortOrder: input.sortOrder ?? 0,
		})
		.returning();
	return { label };
}

export async function updateLabel(db: WattsDb, id: string, data: UpdateLabelInput) {
	if (data.slug !== undefined) {
		assertSlug(data.slug);
		const [clash] = await db
			.select({ id: EventLabels.id })
			.from(EventLabels)
			.where(eq(EventLabels.slug, data.slug))
			.limit(1);
		if (clash && clash.id !== id) {
			throw new DomainError('CONFLICT', `A label with slug "${data.slug}" already exists`);
		}
	}

	const [label] = await db
		.update(EventLabels)
		.set({ ...data, updatedAt: new Date().toISOString() })
		.where(eq(EventLabels.id, id))
		.returning();
	if (!label) throw new DomainError('NOT_FOUND', 'Label not found');
	return { label };
}

/**
 * Pull the calendar's native event labels and link them to our rows by name
 * (case-insensitive). Fills `googleLabelId` + refreshes `hex` from Google's
 * backgroundColor. Returns which of our labels matched and which native labels
 * had no counterpart. No-op (matched: []) when calendar credentials are absent.
 */
export async function syncNativeLabelsFromGoogle(db: WattsDb) {
	const { createCalendarClient } = await import('@watts/calendar');
	const native = await createCalendarClient().listNativeLabels();
	if (native.length === 0) return { matched: [] as string[], unmatchedNative: [] as string[] };

	const rows = await db.select().from(EventLabels);
	const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
	const matched: string[] = [];
	const unmatchedNative: string[] = [];

	for (const label of native) {
		const row = byName.get(label.name.trim().toLowerCase());
		if (!row) {
			unmatchedNative.push(label.name);
			continue;
		}
		await db
			.update(EventLabels)
			.set({
				googleLabelId: label.id,
				hex: label.backgroundColor ?? row.hex,
				updatedAt: new Date().toISOString(),
			})
			.where(eq(EventLabels.id, row.id));
		matched.push(row.name);
	}
	return { matched, unmatchedNative };
}

/** Soft toggle — events keep their `labelId`, the label just drops out of selects. */
export async function setLabelActive(db: WattsDb, id: string, active: boolean) {
	const [label] = await db
		.update(EventLabels)
		.set({ active, updatedAt: new Date().toISOString() })
		.where(eq(EventLabels.id, id))
		.returning();
	if (!label) throw new DomainError('NOT_FOUND', 'Label not found');
	return { label };
}
