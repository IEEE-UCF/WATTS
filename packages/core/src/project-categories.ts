// Domain layer for the adjustable project category set (`project_categories`).
// Officers CRUD these in /admin/projects; projects reference a category by id.

import { asc, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { ProjectCategories } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateCategoryInput {
	name: string;
	slug: string;
	sortOrder?: number;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string) {
	if (!SLUG_RE.test(slug) || slug.length > 32) {
		throw new DomainError('BAD_REQUEST', 'Slug must be kebab-case, ≤32 chars (a-z, 0-9, -)');
	}
}

/** All categories, non-archived first then by sortOrder. Pass `activeOnly` for form selects. */
export async function listCategories(db: WattsDb, opts: { activeOnly?: boolean } = {}) {
	const rows = await db
		.select()
		.from(ProjectCategories)
		.orderBy(asc(ProjectCategories.sortOrder), asc(ProjectCategories.name));
	return opts.activeOnly ? rows.filter((r) => !r.archived) : rows;
}

export async function getCategoryById(db: WattsDb, id: string) {
	const [row] = await db.select().from(ProjectCategories).where(eq(ProjectCategories.id, id)).limit(1);
	if (!row) throw new DomainError('NOT_FOUND', 'Category not found');
	return row;
}

export async function createCategory(db: WattsDb, input: CreateCategoryInput) {
	assertSlug(input.slug);
	const [existing] = await db
		.select({ id: ProjectCategories.id })
		.from(ProjectCategories)
		.where(eq(ProjectCategories.slug, input.slug))
		.limit(1);
	if (existing) throw new DomainError('CONFLICT', `A category with slug "${input.slug}" already exists`);

	const [category] = await db
		.insert(ProjectCategories)
		.values({
			name: input.name,
			slug: input.slug,
			sortOrder: input.sortOrder ?? 0,
		})
		.returning();
	return { category };
}

export async function updateCategory(db: WattsDb, id: string, data: UpdateCategoryInput) {
	if (data.slug !== undefined) {
		assertSlug(data.slug);
		const [clash] = await db
			.select({ id: ProjectCategories.id })
			.from(ProjectCategories)
			.where(eq(ProjectCategories.slug, data.slug))
			.limit(1);
		if (clash && clash.id !== id) {
			throw new DomainError('CONFLICT', `A category with slug "${data.slug}" already exists`);
		}
	}

	const [category] = await db
		.update(ProjectCategories)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(ProjectCategories.id, id))
		.returning();
	if (!category) throw new DomainError('NOT_FOUND', 'Category not found');
	return { category };
}

/** Soft toggle — projects keep their `categoryId`, the category just drops out of selects. */
export async function setCategoryArchived(db: WattsDb, id: string, archived: boolean) {
	const [category] = await db
		.update(ProjectCategories)
		.set({ archived, updatedAt: new Date() })
		.where(eq(ProjectCategories.id, id))
		.returning();
	if (!category) throw new DomainError('NOT_FOUND', 'Category not found');
	return { category };
}
