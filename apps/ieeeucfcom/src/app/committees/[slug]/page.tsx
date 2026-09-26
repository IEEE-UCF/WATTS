import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentPageView } from '@/components/pg/content-page';
import { getCommitteePage, getPublishedSlugs } from '@/lib/site-content';

// Static + ISR: rendered once per committee and refreshed when a change is published.
export const revalidate = 3600;

export async function generateStaticParams() {
	const { committees } = await getPublishedSlugs();
	return committees.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const page = await getCommitteePage(slug);
	if (!page) return { title: 'Committee | IEEE UCF' };
	const title = `${page.title} | IEEE UCF`;
	const description = page.tagline ?? page.body.slice(0, 160);
	return {
		title,
		description,
		openGraph: { title, description, url: `https://www.ieeeucf.com/committees/${slug}`, type: 'website' },
	};
}

export default async function CommitteePage({ params }: Props) {
	const { slug } = await params;
	const page = await getCommitteePage(slug);
	if (!page) notFound();
	return <ContentPageView page={page} />;
}
