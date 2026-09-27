import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { contentActor, getPagePreview } from '@watts/core/site-content';
import { getSessionRoles } from '@/lib/auth-guards';
import { db } from '@/lib/database/client';
import { ContentPageView } from '@/components/pg/content-page';

// Preview of a committee/project page for the people who may edit it: the saved page
// (even while unpublished), or ?revision=<id> to see a submitted change as if approved.
// Rendered per request and never cached, so the public pages stay static.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Preview | IEEE UCF',
	robots: { index: false, follow: false },
};

interface Props {
	params: Promise<{ type: string; slug: string }>;
	searchParams: Promise<{ revision?: string | string[] }>;
}

export default async function PreviewContentPage({ params, searchParams }: Props) {
	const { type, slug } = await params;
	if (type !== 'committee' && type !== 'project') notFound();
	const { revision: rawRevision } = await searchParams;
	const revisionId = typeof rawRevision === 'string' ? rawRevision : null;

	const { session, roles } = await getSessionRoles();
	if (!session) redirect(`/auth/signin?callbackUrl=/pages/${type}/${slug}/preview`);

	// Null for pages the viewer may not edit (or unknown pages/revisions): 404 either way.
	const preview = await getPagePreview(
		db,
		contentActor(session.user.id, roles),
		type,
		slug,
		revisionId,
	);
	if (!preview) notFound();

	const publicPath = `/${type === 'committee' ? 'committees' : 'projects'}/${slug}`;
	const { revision } = preview;
	const showing = revision
		? `${revision.status === 'pending' ? 'Pending change' : `Change (${revision.status})`}${
				revision.authorName ? ` by ${revision.authorName}` : ''
			}, submitted ${revision.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}`
		: 'The saved page';
	const liveNote = preview.livePublished
		? `Live at ${publicPath}`
		: `Not live — ${publicPath} is a 404 until the page is published`;

	return (
		<>
			<div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-1 bg-ieee-bright-yellow px-5 py-2 text-sm text-black">
				<span className="font-heading tracking-widest">PREVIEW</span>
				<span>{showing}</span>
				<span className="opacity-75">·</span>
				<span>{liveNote}</span>
				{revision && !preview.published && (
					<span className="opacity-75">(this change leaves the page unpublished)</span>
				)}
				<Link
					href={`/pages/${type}/${slug}/edit`}
					className="ml-auto font-semibold underline"
				>
					Back to editor
				</Link>
			</div>
			<ContentPageView page={preview.page} />
		</>
	);
}
