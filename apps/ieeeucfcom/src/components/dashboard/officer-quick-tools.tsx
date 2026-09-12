'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Card } from '@watts/ui/card';

/** A single tile for now — résumé-queue count only, since it reuses the same
 * officer.listResumes call the admin overview needs anyway. Check-ins-today and
 * photos-pending duplicate Staff Hub work and are deferred there instead of building
 * those queries twice. Renders nothing for a plain member. */
export function OfficerQuickTools({
	isOfficer,
	isAdmin,
}: {
	isOfficer: boolean;
	isAdmin: boolean;
}) {
	const resumes = trpc.officer.listResumes.useQuery(undefined, { enabled: isOfficer || isAdmin });
	if (!isOfficer && !isAdmin) return null;

	const thisWeek = (resumes.data ?? []).filter(
		(r) =>
			r.hasResume &&
			r.resumeUploadedAt &&
			Date.now() - new Date(r.resumeUploadedAt).getTime() < 7 * 86400000,
	).length;

	return (
		<Card className="flex-row items-center justify-between gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<div>
				<div className="text-sm font-semibold text-foreground">Résumés this week</div>
				<div className="font-mono text-2xl text-ieee-dark-yellow">{thisWeek}</div>
			</div>
			<Link
				href="/staff"
				className="text-xs text-muted-foreground hover:text-ieee-dark-yellow hover:underline"
			>
				Open Staff Hub →
			</Link>
		</Card>
	);
}
