// Old public-page addresses → the page they belong to now (page_redirects).
// Written whenever an event or project slug changes; read when a URL doesn't match a
// current slug, so links already shared keep working.
import { and, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { PageRedirects } from '@watts/db/schema';

export type RedirectType = 'event' | 'project';

/**
 * Remember that `oldSlug` used to point at `targetId`. If another page held that old
 * address before, the most recent owner wins.
 */
export async function recordRedirect(
	db: WattsDb,
	type: RedirectType,
	oldSlug: string | null | undefined,
	targetId: string,
): Promise<void> {
	if (!oldSlug) return;
	await db
		.insert(PageRedirects)
		.values({ type, oldSlug, targetId })
		.onConflictDoUpdate({
			target: [PageRedirects.type, PageRedirects.oldSlug],
			set: { targetId, createdAt: new Date() },
		});
}

/** The page an old address points at, or null. */
export async function findRedirect(
	db: WattsDb,
	type: RedirectType,
	oldSlug: string,
): Promise<string | null> {
	const [row] = await db
		.select({ targetId: PageRedirects.targetId })
		.from(PageRedirects)
		.where(and(eq(PageRedirects.type, type), eq(PageRedirects.oldSlug, oldSlug)))
		.limit(1);
	return row?.targetId ?? null;
}
