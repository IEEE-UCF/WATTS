'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

const STYLES = {
	/** Yellow button, for the dark hero. */
	primary: 'bg-ieee-bright-yellow text-black hover:bg-ieee-dark-yellow',
	/** Black button, for the yellow CTA band. */
	inverse: 'bg-black text-ieee-bright-yellow hover:bg-ieee-near-black',
} as const;

/**
 * "Request to join" for a project page. Signed-out visitors (or accounts without a
 * member profile) are sent to sign in; members fire project.requestMembership, which
 * the lead or an officer reviews.
 */
export function JoinProjectButton({
	projectId,
	variant = 'primary',
}: {
	projectId: string;
	variant?: keyof typeof STYLES;
}) {
	const { data: auth } = trpc.auth.getAuthStatus.useQuery();
	const request = trpc.project.requestMembership.useMutation();
	const cls = `inline-block rounded-xs px-7 py-4 font-display text-sm tracking-[0.08em] transition-colors disabled:opacity-60 ${STYLES[variant]}`;

	if (auth && (!auth.isAuthenticated || !auth.isMember)) {
		return (
			<Link href="/auth/signin" className={cls}>
				SIGN IN TO JOIN
			</Link>
		);
	}

	if (request.isSuccess) {
		return <p className="font-heading text-base">Request sent. The lead will follow up.</p>;
	}

	// A duplicate request comes back as CONFLICT with a readable message.
	const error =
		request.error?.data?.code === 'CONFLICT'
			? request.error.message
			: request.error
				? 'Something went wrong. Try again.'
				: null;

	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				className={cls}
				disabled={!auth || request.isPending}
				onClick={() => request.mutate({ projectId })}
			>
				{request.isPending ? 'SENDING…' : 'REQUEST TO JOIN'}
			</button>
			{error && <p className="text-sm text-red-400">{error}</p>}
		</div>
	);
}
