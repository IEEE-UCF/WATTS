'use client';
import React from 'react';
import { MemberQRCode } from '@/components/qr/member-qr-code';
import { trpc } from '@/lib/trpc/client';

/**
 * The member's check-in pass — styled like an event badge (ribbon header, name,
 * viewfinder-framed code) rather than a bare QR image dropped in a generic card.
 * The QR itself is still rendered by components/qr/member-qr-code.tsx ('bare'
 * variant, no chrome of its own); everything below is presentation only.
 */
export const Member_QR_Code = () => {
	const { data: session, isLoading, isError } = trpc.auth.getSession.useQuery();
	// The QR primitive does no data fetching of its own — fetch the profile here so
	// the badge can show a real name and major instead of a generic label.
	const { data: memberProfile } = trpc.member.getMyProfile.useQuery(undefined, {
		enabled: !!session?.user,
		retry: false,
	});

	if (isLoading) {
		return (
			<BadgeShell>
				<p className="p-6 text-center text-sm text-muted-foreground">Loading your pass…</p>
			</BadgeShell>
		);
	}

	if (isError || !session?.user?.discordId) {
		return (
			<BadgeShell>
				<p className="p-6 text-center text-sm text-red-400">
					Couldn&apos;t load your check-in pass — try refreshing.
				</p>
			</BadgeShell>
		);
	}

	// Only the Discord id goes in the code itself; name/major below are display-only.
	const memberInfoString = JSON.stringify({ id: session.user.discordId });

	const fullName = memberProfile
		? `${memberProfile.firstName} ${memberProfile.lastName}`.trim()
		: (session.user.name ?? 'Member');

	const subtitle = memberProfile?.major
		? memberProfile.graduationYear
			? `${memberProfile.major} · Class of ${memberProfile.graduationYear}`
			: memberProfile.major
		: 'IEEE @ UCF Member';

	return (
		<BadgeShell>
			<div className="flex items-center justify-between bg-ieee-dark-yellow px-5 py-2">
				<span className="font-heading text-[11px] tracking-[0.2em] text-black">
					IEEE @ UCF
				</span>
				<span className="font-heading text-[11px] tracking-[0.2em] text-black">
					{memberProfile?.officerStatus ? 'OFFICER PASS' : 'MEMBER PASS'}
				</span>
			</div>

			<div className="flex flex-col items-center gap-5 px-6 py-6">
				<div className="text-center">
					<div className="font-subheading text-xl text-white">{fullName}</div>
					<div className="text-sm text-muted-foreground">{subtitle}</div>
				</div>

				<div className="relative p-3">
					<span className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-ieee-dark-yellow" />
					<span className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-ieee-dark-yellow" />
					<span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-ieee-dark-yellow" />
					<span className="absolute right-0 bottom-0 h-5 w-5 border-r-2 border-b-2 border-ieee-dark-yellow" />
					<MemberQRCode
						memberInfo={memberInfoString}
						logoUrl="/iconography/ieeeucficon.png"
						variant="bare"
					/>
				</div>

				<p className="text-xs text-muted-foreground-dim">Show this at check-in</p>
			</div>
		</BadgeShell>
	);
};

function BadgeShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-ieee-near-black shadow-[0_0_24px_rgba(250,204,21,0.35)]">
			{children}
		</div>
	);
}
