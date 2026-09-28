import type { MetadataRoute } from 'next';
import { getPublishedSlugs } from '@/lib/site-content';

// Refreshed hourly so newly published committee/project pages get listed.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const { committees, projects } = await getPublishedSlugs();
	const contentPages: MetadataRoute.Sitemap = [
		...committees.map((slug) => `https://www.ieeeucf.com/committees/${slug}`),
		...projects.map((slug) => `https://www.ieeeucf.com/projects/${slug}`),
	].map((url) => ({ url, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 }));

	return [
		{
			url: 'https://www.ieeeucf.com/',
			lastModified: new Date(),
			changeFrequency: 'weekly',
			priority: 1,
		},
		{
			url: 'https://www.ieeeucf.com/about',
			lastModified: new Date(),
			changeFrequency: 'weekly',
			priority: 0.9,
		},
		{
			url: 'https://www.ieeeucf.com/events',
			lastModified: new Date(),
			changeFrequency: 'daily',
			priority: 0.7,
		},
		{
			url: 'https://www.ieeeucf.com/projects',
			lastModified: new Date(),
			changeFrequency: 'daily',
			priority: 0.7,
		},
		{
			url: 'https://www.ieeeucf.com/sponsorships',
			lastModified: new Date(),
			changeFrequency: 'monthly',
			priority: 0.5,
		},
		{
			url: 'https://www.ieeeucf.com/connect',
			lastModified: new Date(),
			changeFrequency: 'monthly',
			priority: 0.5,
		},

		{
			url: 'https://www.ieeeucf.com/dashboard',
			lastModified: new Date(),
			changeFrequency: 'daily',
			priority: 0.8,
		},
		...contentPages,
	];
}
