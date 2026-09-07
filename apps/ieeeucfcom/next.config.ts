import { loadRootEnv } from '@watts/config/load-env';

// Next only auto-loads .env* from this app dir. Pull in the repo-root ./.env so the
// whole monorepo shares one env file. Must run before the config object is built.
loadRootEnv();

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
			// Local MinIO public bucket (development)
			{
				protocol: 'http',
				hostname: 'localhost',
				port: '9000',
				pathname: '/**',
			},
			{
				protocol: 'http',
				hostname: '127.0.0.1',
				port: '9000',
				pathname: '/**',
			},
		],
	},
};

export default nextConfig;
