import 'server-only';

import { cache } from 'react';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/database/client';
import { resolveMemberRoles, type MemberRoles } from '@watts/core/members';
import { hasCapability, type Capability } from '@watts/permissions';

/**
 * Session + DB-resolved roles for a Server Component / layout. Wrapped in React
 * `cache()` so an `/admin` layout and the page it wraps share one resolve per
 * request. Returns `{ session: null, roles: null }` for an anonymous request.
 */
export const getSessionRoles = cache(
	async (): Promise<{ session: Session | null; roles: MemberRoles | null }> => {
		const session = await getServerSession(authOptions);
		if (!session?.user?.id) return { session: null, roles: null };
		const roles = await resolveMemberRoles(db, session.user.id);
		return { session, roles };
	},
);

/**
 * Auth gates for raw Route Handlers (byte streaming, webhooks) — the tRPC procedure
 * ladder can't be used there. Capabilities are resolved from the DB via
 * `resolveMemberRoles`, NOT read off the session token, so a revoked grant takes
 * effect on the next request instead of at the next session refresh.
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

	const roles = await resolveMemberRoles(db, session.user.id);
	if (!hasCapability(roles, cap)) return new Response('Forbidden', { status: 403 });

	return { session, roles };
}
