import 'server-only';

import { cache } from 'react';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/database/client';
import {
	memberRolesFromSessionUser,
	resolveMemberRoles,
	type MemberRoles,
} from '@watts/core/members';
import { hasCapability, type Capability } from '@watts/permissions';

/**
 * Roles for a session from THIS request: reuse what the session callback just
 * resolved from the DB; only query again if it couldn't enrich the user.
 */
function rolesFor(session: Session): Promise<MemberRoles | null> {
	const fromSession = memberRolesFromSessionUser(session.user);
	return fromSession !== undefined
		? Promise.resolve(fromSession)
		: resolveMemberRoles(db, session.user.id);
}

/**
 * Session + DB-resolved roles for a Server Component / layout. Wrapped in React
 * `cache()` so an `/admin` layout and the page it wraps share one resolve per
 * request. Returns `{ session: null, roles: null }` for an anonymous request.
 */
export const getSessionRoles = cache(
	async (): Promise<{ session: Session | null; roles: MemberRoles | null }> => {
		const session = await getServerSession(authOptions);
		if (!session?.user?.id) return { session: null, roles: null };
		return { session, roles: await rolesFor(session) };
	},
);

/**
 * Auth gates for raw Route Handlers (byte streaming, webhooks) — the tRPC procedure
 * ladder can't be used there. Capabilities are resolved from the DB via
 * `resolveMemberRoles` on every request (the database-session callback runs it
 * inside `getServerSession`), so a revoked grant takes effect on the next request.
 *
 * Each returns either the resolved value or a `Response` to return as-is:
 *
 *   const gate = await requireCapability('manage_event_photos');
 *   if (gate instanceof Response) return gate;
 *   // …gate.session, gate.roles…
 */

export async function requireSession(): Promise<Session | Response> {
	const session = await getServerSession(authOptions);
	if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
	return session;
}

export async function requireCapability(
	cap: Capability,
): Promise<{ session: Session; roles: Awaited<ReturnType<typeof resolveMemberRoles>> } | Response> {
	const session = await getServerSession(authOptions);
	if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

	const roles = await rolesFor(session);
	if (!hasCapability(roles, cap)) return new Response('Forbidden', { status: 403 });

	return { session, roles };
}
