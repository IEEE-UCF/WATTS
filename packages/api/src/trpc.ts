// tRPC core for WATTS: transformer, error formatter, procedure builders, and the
// role/capability gates. Framework-neutral — no next / next-auth. The context is
// injected: the caller (a Next route handler, an RSC caller, a test) resolves the
// session and hands in a Drizzle client.

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Members } from '@watts/db/schema';
import { hasCapability, type Capability } from '@watts/permissions';
import { resolveMemberRoles, type MemberRoles } from '@watts/core/members';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Structural stand-in for a next-auth Session — keeps this package next-auth-free.
 * The app's augmented `Session` (src/types/next-auth.d.ts) is assignable to this.
 */
export interface ApiSessionUser {
	id: string;
	name?: string | null;
	email?: string | null;
	image?: string | null;
	discordId?: string | null;
	memberId?: string | null;
	officerStatus?: boolean;
	officerRole?: string | null;
	administrator?: boolean;
	permissions?: string[];
}
export interface ApiSession {
	user?: ApiSessionUser | null;
	expires?: string;
}

/**
 * 1. CONTEXT — injected. The route handler / RSC caller resolves the session
 *    (getServerSession) and passes the app's Drizzle client; nothing here reaches
 *    for a singleton.
 */
export interface CreateContextOptions {
	db: WattsDb;
	session: ApiSession | null;
	headers?: Headers;
}

export const createTRPCContext = (opts: CreateContextOptions) => {
	if (isDev) {
		const source = opts.headers?.get('x-trpc-source') ?? 'unknown';
		console.log('>>> tRPC request from', source, 'by', opts.session?.user?.id ?? 'anon');
	}

	// Per-request memo of the role resolver. Every gate and the `auth.*` router call
	// this, so a batched request that touches several of them resolves roles once, not
	// once per procedure.
	let rolesPromise: Promise<MemberRoles | null> | undefined;
	const getRoles = (): Promise<MemberRoles | null> => {
		const userId = opts.session?.user?.id;
		if (!userId) return Promise.resolve(null);
		return (rolesPromise ??= resolveMemberRoles(opts.db, userId));
	};

	return {
		session: opts.session,
		db: opts.db,
		headers: opts.headers,
		token: opts.headers?.get('Authorization') ?? null,
		getRoles,
	};
};

/**
 * 2. INITIALIZATION
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter: ({ shape, error }) => ({
		...shape,
		data: {
			...shape.data,
			zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
		},
	}),
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/**
 * Timing middleware
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
	if (!isDev) return next();

	const start = Date.now();
	const waitMs = Math.floor(Math.random() * 400) + 100;
	await new Promise((resolve) => setTimeout(resolve, waitMs));

	const result = await next();
	console.log(`[TRPC] ${path} took ${Date.now() - start}ms to execute`);
	return result;
});

/**
 * Public procedure
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected procedure with proper typing
 */
export const protectedProcedure = t.procedure.use(timingMiddleware).use(({ ctx, next }) => {
	if (!ctx.session?.user) {
		throw new TRPCError({ code: 'UNAUTHORIZED' });
	}
	// Re-shape so `session.user` is non-nullable for every downstream procedure.
	return next({
		ctx: {
			session: { ...ctx.session, user: ctx.session.user },
		},
	});
});

// All role/capability gates resolve through ctx.getRoles() → @watts/core/members
// `resolveMemberRoles` (one implementation, shared with the NextAuth session callback),
// memoised per request in createTRPCContext.

/**
 * Officer procedure
 *
 * Requires user to be logged in AND have officerStatus = true OR administrator = true.
 * Admins are granted officer-level access implicitly.
 */
export const officerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const roles = await ctx.getRoles();

	if (!roles || (!roles.officerStatus && !roles.administrator)) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'Officer status required',
		});
	}

	return next({
		ctx: {
			session: ctx.session,
			roles,
		},
	});
});

/**
 * Capability procedure factory.
 *
 * Passes if the caller is an admin, an officer, OR holds the named granular
 * capability (an active member_permissions row). See @watts/permissions.
 */
export function capabilityProcedure(cap: Capability) {
	return protectedProcedure.use(async ({ ctx, next }) => {
		const roles = await ctx.getRoles();
		if (!hasCapability(roles, cap)) {
			throw new TRPCError({
				code: 'FORBIDDEN',
				message: `Missing permission: ${cap}`,
			});
		}
		return next({ ctx: { session: ctx.session } });
	});
}

/**
 * Admin procedure
 *
 * Requires user to be logged in AND have administrator = true
 * Use this for admin-only features like managing members.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const roles = await ctx.getRoles();

	if (!roles?.administrator) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'Administrator privileges required',
		});
	}

	return next({
		ctx: {
			session: ctx.session,
		},
	});
});

/**
 * Member procedure
 *
 * Requires user to be logged in AND have a member profile.
 * Use this for member-only features.
 */
export const memberProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const member = await ctx.db
		.select()
		.from(Members)
		.where(eq(Members.userId, ctx.session.user.id))
		.limit(1);

	if (member.length === 0) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'Member profile required. Please complete registration.',
		});
	}

	return next({
		ctx: {
			session: ctx.session,
			member: member[0], // Includes officerStatus, officerRole, administrator
		},
	});
});
