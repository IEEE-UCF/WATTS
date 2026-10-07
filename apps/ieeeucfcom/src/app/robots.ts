import type { MetadataRoute } from 'next';

// Crawlers get the public marketing pages and the sitemap. Everything behind auth, the
// API and the dev tooling is off limits, and so is /_next/image: every optimized-image
// fetch is billed by Vercel (cache reads/writes), and crawlers don't reuse a browser cache.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: '*',
			allow: '/',
			disallow: [
				'/api/',
				'/_next/image',
				'/admin',
				'/auth/',
				'/dashboard',
				'/settings',
				'/staff',
				'/dev',
				'/test',
				'/style-guide',
				'/component-showcase',
				// Short-link redirects: a crawler hit would count as a click.
				'/go/',
			],
		},
		sitemap: 'https://www.ieeeucf.com/sitemap.xml',
	};
}
