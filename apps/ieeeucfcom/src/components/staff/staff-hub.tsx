'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { hasCapability, CAPABILITIES, type Capability } from '@watts/permissions';
import { Card } from '@watts/ui/card';
import { QREventScanner } from '@/components/admin/qr_event_scanner';
import { CommitteesProjectsPanel } from '@/components/staff/committees-projects-panel';

function CapTag({ cap }: { cap: Capability }) {
	return (
		<span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground">
			{cap}
		</span>
	);
}

function Panel({
	title,
	cap,
	wide,
	children,
}: {
	title: string;
	cap?: Capability;
	wide?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Card
			className={`gap-0 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40 ${
				wide ? 'lg:col-span-2' : ''
			}`}
		>
			<div className="mb-3 flex items-center gap-2">
				<h2 className="font-heading text-sm tracking-[0.14em] text-foreground uppercase">
					{title}
				</h2>
				{cap && (
					<span className="ml-auto flex items-center gap-2">
						<span className="text-[11px] text-muted-foreground-dim">
							{CAPABILITIES[cap].label}
						</span>
						<CapTag cap={cap} />
					</span>
				)}
			</div>
			{children}
		</Card>
	);
}

function LinkCard({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm text-foreground transition-colors hover:border-ieee-dark-yellow hover:text-ieee-dark-yellow"
		>
			{label}{' '}
			<span aria-hidden className="opacity-60">
				→
			</span>
		</Link>
	);
}

export function StaffHub() {
	const { data: auth, isLoading } = trpc.auth.getAuthStatus.useQuery();

	// All hooks below must run every render — including while auth is still loading — or
	// the conditional `enabled` flags change which hooks fire between renders and React
	// throws "change in the order of Hooks." `can()` just returns false until auth resolves.
	const subject = {
		administrator: auth?.isAdmin,
		officerStatus: auth?.isOfficer,
		permissions: auth?.permissions ?? [],
	};
	const can = (c: Capability) => hasCapability(subject, c);
	const isAdmin = Boolean(auth?.isAdmin);

	const checkIns = trpc.event.todaysCheckIns.useQuery(undefined, {
		enabled: can('scan_attendance'),
	});
	const alerts = trpc.event.roomReservationAlerts.useQuery(undefined, {
		enabled: can('manage_events'),
	});
	const pendingPhotos = trpc.event.pendingVisibilityCount.useQuery(undefined, {
		enabled: can('manage_event_photos'),
	});
	const resumes = trpc.officer.listResumes.useQuery(undefined, {
		enabled: can('review_resumes'),
	});
	const resumesThisWeek = (resumes.data ?? []).filter(
		(r) =>
			r.hasResume &&
			r.resumeUploadedAt &&
			Date.now() - new Date(r.resumeUploadedAt).getTime() < 7 * 86400000,
	).length;
	const totalCheckIns = (checkIns.data ?? []).reduce((sum, e) => sum + e.count, 0);

	if (isLoading) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	const scope = isAdmin
		? 'Administrator — full access'
		: auth?.isOfficer
			? `Officer${auth.officerRole ? ` · ${auth.officerRole}` : ''}`
			: `Helper · ${(auth?.permissions ?? []).join(', ') || 'no grants'}`;

	const anyTool =
		can('manage_events') ||
		can('scan_attendance') ||
		can('manage_event_photos') ||
		can('review_resumes');

	return (
		<div className="text-foreground">
			<div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span className="text-sm text-muted-foreground-dim">
					{auth?.member
						? `${auth.member.firstName} ${auth.member.lastName}`
						: 'Signed in'}
				</span>
				<span className="rounded-full border border-input px-3 py-1 text-xs text-muted-foreground">
					{scope}
				</span>
			</div>

			{!anyTool && !isAdmin && (
				<p className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
					You don&apos;t have any staff tools yet. An admin can grant you capabilities on
					the Members screen.
				</p>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				{can('scan_attendance') && (
					<Panel title="Check-in" cap="scan_attendance" wide>
						<p className="mb-3 text-sm text-muted-foreground">
							<span className="font-mono text-foreground">{totalCheckIns}</span>{' '}
							checked in today
							{(checkIns.data?.length ?? 0) > 0 && (
								<span className="text-muted-foreground-dim">
									{' '}
									·{' '}
									{checkIns
										.data!.map((e) => `${e.eventTitle} (${e.count})`)
										.join(', ')}
								</span>
							)}
						</p>
						<QREventScanner />
					</Panel>
				)}

				{can('manage_events') && (
					<Panel title="Events" cap="manage_events">
						<p className="mb-3 text-sm text-muted-foreground">
							Create &amp; edit events, pick a category, upload a flyer, and sync to
							Google Calendar.
						</p>
						<LinkCard href="/admin/events" label="Open event manager" />

						<div className="mt-4 border-t border-border pt-3">
							<h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground-dim uppercase">
								Room reservations needing attention
							</h3>
							{(alerts.data ?? []).length === 0 ? (
								<p className="text-xs text-muted-foreground-dim">
									Nothing outstanding.
								</p>
							) : (
								<ul className="flex flex-col gap-1.5">
									{alerts.data!.map((a) => (
										<li
											key={a.eventId}
											className="flex items-center justify-between gap-2 text-xs"
										>
											<span className="text-foreground">{a.eventTitle}</span>
											<span className="flex items-center gap-1.5">
												{a.isNewSinceAnnounced && (
													<span className="rounded-full bg-ieee-dark-yellow px-1.5 py-0.5 font-mono text-[9px] text-black">
														new
													</span>
												)}
												<span className="text-muted-foreground-dim capitalize">
													{a.status}
												</span>
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
					</Panel>
				)}

				{can('manage_event_photos') && (
					<Panel title="Event Photos" cap="manage_event_photos">
						<p className="mb-3 text-sm text-muted-foreground">
							Upload and manage photos per event, set captions, tags, and visibility.{' '}
							<span className="font-mono text-foreground">
								{pendingPhotos.data ?? 0}
							</span>{' '}
							still on default (private) visibility.
						</p>
						<LinkCard href="/admin/photos" label="Open photo manager" />
					</Panel>
				)}

				{can('review_resumes') && (
					<Panel title="Résumés" cap="review_resumes">
						<p className="mb-3 text-sm text-muted-foreground">
							Browse member résumés with inline preview and filters — not a review
							queue, just what&apos;s on file.{' '}
							<span className="font-mono text-foreground">
								{(resumes.data ?? []).filter((r) => r.hasResume).length}
							</span>{' '}
							on file,{' '}
							<span className="font-mono text-foreground">{resumesThisWeek}</span>{' '}
							uploaded this week.
						</p>
						<LinkCard href="/admin/resumes" label="Open résumés" />
					</Panel>
				)}

				{(isAdmin || auth?.isOfficer) && (
					<Panel title="Committees & Projects">
						<CommitteesProjectsPanel />
					</Panel>
				)}

				{(isAdmin || auth?.isOfficer) && (
					<Panel title="Members">
						<p className="mb-3 text-sm text-muted-foreground">
							{isAdmin
								? 'Roster, roles, capabilities, and résumé / committee status.'
								: 'Roster & status. Toggle admin-delegated capabilities for regular members.'}
						</p>
						<LinkCard href="/admin/members" label="Open members" />
					</Panel>
				)}

				{isAdmin && (
					<Panel title="Admin">
						<p className="mb-3 text-sm text-muted-foreground">
							The full admin dashboard — events, photos, résumés, and site settings.
						</p>
						<LinkCard href="/admin/dashboard" label="Admin dashboard" />
					</Panel>
				)}
			</div>
		</div>
	);
}
