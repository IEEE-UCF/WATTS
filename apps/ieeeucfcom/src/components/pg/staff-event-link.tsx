'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { adminEventPath } from '@watts/core/event-path';
import { hasCapability } from '@watts/permissions';

/**
 * Floating "Review event" shortcut on a public event page, shown only to people who can
 * manage events. Client-side so the public page stays statically cached; the auth status
 * query is shared with the navbar (React Query dedupes it).
 */
export function StaffEventLink({ number }: { number: number }) {
	const { data: auth } = trpc.auth.getAuthStatus.useQuery();
	if (
		!auth?.isAuthenticated ||
		!hasCapability(
			{
				administrator: auth.isAdmin,
				officerStatus: auth.isOfficer,
				officerRole: auth.officerRole,
				permissions: auth.permissions,
			},
			'manage_events',
		)
	) {
		return null;
	}

	return (
		<Link
			href={adminEventPath({ number })}
			className="fixed right-4 bottom-4 z-40 rounded-full border border-ieee-warm-dark bg-black/85 px-4 py-2 font-subheading text-sm text-ieee-bright-yellow shadow-lg backdrop-blur hover:bg-black"
		>
			Staff · Review event →
		</Link>
	);
}
