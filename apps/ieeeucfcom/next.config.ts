import { loadRootEnv } from '@watts/config/load-env';
import { getServerEnv } from '@watts/config';

// Next only auto-loads .env* from this app dir. Pull in the repo-root ./.env so the
// whole monorepo shares one env file. Must run before the config object is built.
loadRootEnv();

// Fail the build/boot loudly if a deployed environment is missing auth secrets
// (DATABASE_URL, NEXTAUTH_*, DISCORD_*). No-op when APP_ENV=local.
getServerEnv();

import type { NextConfig } from 'next';

// Baseline security headers, applied to every response. A full script/style CSP
// needs nonce plumbing through the App Router and is deferred; the directives here
// (frame-ancestors / base-uri / object-src) are safe without it. HSTS is prod-only
// so it never pins localhost during dev.
const securityHeaders = [
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
	{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
	{
		key: 'Content-Security-Policy',
		value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
	},
	...(process.env.NODE_ENV === 'production'
		? [
				{
					key: 'Strict-Transport-Security',
					value: 'max-age=63072000; includeSubDomains; preload',
				},
			]
		: []),
];

const nextConfig: NextConfig = {
	// Workspace packages that ship raw .ts — Next transpiles them into the app bundle.
	transpilePackages: [
		'@watts/permissions',
		'@watts/db',
		'@watts/core',
		'@watts/auth',
		'@watts/storage',
		'@watts/api',
		'@watts/calendar',
		'@watts/ui',
	],
	async headers() {
		return [{ source: '/:path*', headers: securityHeaders }];
	},
	images: {
		// Vercel bills image cache reads/writes in 8 KB units, so cost tracks (variants x bytes).
		// Static images rarely change, so keep them in Vercel's CDN cache for 31 days: stops
		// STALE re-transforms (billed as writes). This is CDN-side only: measured on production,
		// /_next/image still sends browsers `max-age=0, must-revalidate` (only `next start`
		// sends the long max-age), so it does not stop repeat visitors from revalidating. Safe
		// for replaced images: local files are keyed by content hash and flyer URLs carry `?v=`
		// (finalize.ts), so a new upload is a new cache key. Don't add `search: ''` to the
		// remote patterns below or flyers stop matching.
		minimumCacheTTL: 2678400,
		// Default list minus 3840: with no `sizes`, `width={2000}` asks for 2048w and 3840w, and
		// for sources <= 2000px both return the same bytes under two cache keys.
		deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
		// Only quality 75 is ever used; refusing other `?q=` values stops extra cache entries.
		qualities: [75],
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'cdn.discordapp.com',
				port: '',
				pathname: '/avatars/**',
			},
			{
				protocol: 'https',
				hostname: 'cdn.discordapp.com',
				port: '',
				pathname: '/embed/avatars/**',
			},
			// Vercel Blob public store (preview / production)
			{
				protocol: 'https',
				hostname: '*.public.blob.vercel-storage.com',
				port: '',
				pathname: '/**',
			},
			// Local MinIO public bucket (development) — host port from the 3050–3060 block
			{
				protocol: 'http',
				hostname: 'localhost',
				port: '3052',
				pathname: '/**',
			},
			{
				protocol: 'http',
				hostname: '127.0.0.1',
				port: '3052',
				pathname: '/**',
			},
		],
	},
};

export default nextConfig;
