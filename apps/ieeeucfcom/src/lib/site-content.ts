import 'server-only';

import { unstable_cache } from 'next/cache';
import {
	getPublicSiteContent,
	getPublishedCommitteePage,
	getPublishedProjectPage,
	listPublishedCommittees,
	listPublishedPageSlugs,
	type CommitteeCard,
	type PublicContentPage,
	type PublicSiteContent,
} from '@watts/core/site-content';
import { db } from '@/lib/database/client';

// Public pages stay static: CMS reads are cached under one tag and refreshed when a
// change is published (the tRPC route calls revalidateTag('site-content')), with an
// hourly safety net. See docs/site-content/ARCHITECTURE.md.
export const SITE_CONTENT_TAG = 'site-content';
export const SITE_CONTENT_REVALIDATE = 3600;

const EMPTY: PublicSiteContent = { slots: {}, officers: [], sponsors: [] };

const cachedContent = unstable_cache(() => getPublicSiteContent(db), ['site-content'], {
	tags: [SITE_CONTENT_TAG],
	revalidate: SITE_CONTENT_REVALIDATE,
});

/**
 * Everything the public pages render from the CMS. Never throws: if the database is
 * unreachable (e.g. CI builds with a placeholder DATABASE_URL) the pages fall back to
 * their code defaults. The try/catch sits OUTSIDE the cache so a failure isn't cached.
 */
export async function getSiteContent(): Promise<PublicSiteContent> {
	try {
		return await cachedContent();
	} catch (err) {
		console.warn('[site-content] falling back to code defaults:', (err as Error).message);
		return EMPTY;
	}
}

const cachedCommitteePage = unstable_cache(
	(slug: string) => getPublishedCommitteePage(db, slug),
	['site-content-committee-page'],
	{ tags: [SITE_CONTENT_TAG], revalidate: SITE_CONTENT_REVALIDATE },
);

const cachedProjectPage = unstable_cache(
	(slug: string) => getPublishedProjectPage(db, slug),
	['site-content-project-page'],
	{ tags: [SITE_CONTENT_TAG], revalidate: SITE_CONTENT_REVALIDATE },
);

// Page lookups let DB errors propagate: an error response is not cached, whereas
// falling back to "not found" would cache a 404 for a live page.
export function getCommitteePage(slug: string): Promise<PublicContentPage | null> {
	return cachedCommitteePage(slug);
}

export function getProjectPage(slug: string): Promise<PublicContentPage | null> {
	return cachedProjectPage(slug);
}

const cachedCommittees = unstable_cache(
	() => listPublishedCommittees(db),
	['site-content-committees'],
	{
		tags: [SITE_CONTENT_TAG],
		revalidate: SITE_CONTENT_REVALIDATE,
	},
);

/** Published committees for /committees — empty (not an error) when the DB is unreachable. */
export async function getCommitteeDirectory(): Promise<CommitteeCard[]> {
	try {
		return await cachedCommittees();
	} catch (err) {
		console.warn('[site-content] committee directory unavailable:', (err as Error).message);
		return [];
	}
}

/** For generateStaticParams at build time — empty when the DB is unreachable (CI). */
export async function getPublishedSlugs(): Promise<{ committees: string[]; projects: string[] }> {
	try {
		return await listPublishedPageSlugs(db);
	} catch {
		return { committees: [], projects: [] };
	}
}
