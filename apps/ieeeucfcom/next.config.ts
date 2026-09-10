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
	transpilePackages: ['@watts/permissions', '@watts/db', '@watts/core', '@watts/auth', '@watts/storage', '@watts/api', '@watts/calendar', '@watts/ui'],
	async headers() {
		return [{ source: '/:path*', headers: securityHeaders }];
	},
	images: {
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
