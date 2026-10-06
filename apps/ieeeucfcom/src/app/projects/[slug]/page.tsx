import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ContentPageView } from '@/components/pg/content-page';
import { findProjectRedirect, getProjectPage, getPublishedSlugs } from '@/lib/site-content';

// Static + ISR: rendered once per project and refreshed when a change is published.
export const revalidate = 3600;

export async function generateStaticParams() {
	const { projects } = await getPublishedSlugs();
	return projects.map((slug) => ({ slug }));
}

interface Props {
	params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const page = await getProjectPage(slug);
	if (!page) return { title: 'Project | IEEE UCF' };
	const title = `${page.title} | IEEE UCF`;
	const description = page.tagline ?? page.body.slice(0, 160);
	return {
		title,
		description,
		openGraph: {
			title,
			description,
			url: `https://www.ieeeucf.com/projects/${slug}`,
			type: 'website',
		},
	};
}

export default async function ProjectPage({ params }: Props) {
	const { slug } = await params;
	const page = await getProjectPage(slug);
	if (!page) {
		// Renamed project: send old links to the current address.
		const current = await findProjectRedirect(slug);
		if (current) permanentRedirect(`/projects/${current}`);
		notFound();
	}
	return <ContentPageView page={page} />;
}
