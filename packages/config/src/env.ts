// Zod-validated view of the environment. Opt-in: call `getServerEnv()` where you want
// a typed, validated bundle instead of scattered `process.env.X` reads. Nothing here is
// evaluated at import time, so importing this module never throws.
//
// Migration note: the app still reads most of these via `process.env` directly. Move
// call sites onto `getServerEnv()` incrementally.

import { z } from 'zod';
import { loadRootEnv } from '../load-env.mjs';

const serverSchema = z.object({
	APP_ENV: z.enum(['local', 'development', 'production']).default('local'),

	DB_PROVIDER: z.enum(['local', 'neon']).default('neon'),
	DATABASE_URL: z.string().min(1),

	STORAGE_PROVIDER: z.enum(['local', 'vercel']).default('local'),
	S3_ENDPOINT: z.string().optional(),
	S3_REGION: z.string().default('us-east-1'),
	S3_ACCESS_KEY_ID: z.string().optional(),
	S3_SECRET_ACCESS_KEY: z.string().optional(),
	S3_BUCKET_PUBLIC: z.string().default('media-public'),
	S3_BUCKET_PRIVATE: z.string().default('resumes-private'),
	S3_PUBLIC_BASE_URL: z.string().optional(),
	BLOB_READ_WRITE_TOKEN: z.string().optional(),

	NEXTAUTH_URL: z.string().optional(),
	NEXTAUTH_SECRET: z.string().optional(),
	DISCORD_CLIENT_ID: z.string().optional(),
	DISCORD_CLIENT_SECRET: z.string().optional(),

	DEV_ADMIN_EMAIL: z.string().default('admin@watts.local'),

	RESUME_UPLOAD_AUDIENCE: z.enum(['admins', 'officers', 'members']).default('admins'),
}).superRefine((env, ctx) => {
	// Auth secrets are optional for `local` (Discord OAuth may be unconfigured on a
	// fresh checkout) but must be set for any deployed environment.
	if (env.APP_ENV === 'local') return;
	for (const key of ['NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'] as const) {
		if (!env[key]) {
			ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when APP_ENV != local` });
		}
	}
});

const publicSchema = z.object({
	NEXT_PUBLIC_STORAGE_PROVIDER: z.enum(['local', 'vercel']).default('local'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let cachedServer: ServerEnv | undefined;
let cachedPublic: PublicEnv | undefined;

export function getServerEnv(): ServerEnv {
	if (!cachedServer) {
		loadRootEnv();
		cachedServer = serverSchema.parse(process.env);
	}
	return cachedServer;
}

export function getPublicEnv(): PublicEnv {
	if (!cachedPublic) {
		cachedPublic = publicSchema.parse({
			NEXT_PUBLIC_STORAGE_PROVIDER: process.env.NEXT_PUBLIC_STORAGE_PROVIDER,
		});
	}
	return cachedPublic;
}
