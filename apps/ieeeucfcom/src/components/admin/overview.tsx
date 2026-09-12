'use client';

import { trpc } from '@/lib/trpc/client';
import { Card } from '@watts/ui/card';

function Kpi({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) {
	return (
		<div className="flex flex-col gap-1">
			<span
				className={`font-mono text-3xl font-semibold ${warn ? 'text-ieee-dark-yellow' : 'text-foreground'}`}
			>
				{value}
			</span>
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	);
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-4">
			<h3 className="font-heading text-xs tracking-[0.14em] text-muted-foreground-dim uppercase">
				{title}
			</h3>
			<div className="grid grid-cols-3 gap-4">{children}</div>
		</div>
	);
}

/**
 * Chapter-health overview — nine KPIs in three groups, every one of them a rollup of a
 * query the Staff Hub panels or the member dashboard already need. See the dashboard-widgets
 * plan for why "dues paid" isn't framed as "this semester" (duesPaid has no term dimension
 * in the schema today).
 */
export function AdminOverview() {
	const orgStats = trpc.member.getOrgStats.useQuery();
	const events = trpc.event.getAllForAdmin.useQuery();
	const alerts = trpc.event.roomReservationAlerts.useQuery();
	const checkIns = trpc.event.todaysCheckIns.useQuery();
	const resumes = trpc.officer.listResumes.useQuery();
	const pendingPhotos = trpc.event.pendingVisibilityCount.useQuery();
	const committees = trpc.committee.getAll.useQuery();
	const projects = trpc.project.getAll.useQuery();

	const total = orgStats.data?.total ?? 0;
	const duesPaid = orgStats.data?.duesPaid ?? 0;
	const duesPct = total > 0 ? Math.round((duesPaid / total) * 100) : 0;

	const now = Date.now();
	const in7Days = now + 7 * 86400000;
	const upcomingWeek = (events.data ?? []).filter((e) => {
		const t = new Date(e.startTimeRaw).getTime();
		return e.active && t >= now && t <= in7Days;
	}).length;

	const resumesOnFile = (resumes.data ?? []).filter((r) => r.hasResume).length;
	const resumesThisWeek = (resumes.data ?? []).filter(
		(r) =>
			r.hasResume &&
			r.resumeUploadedAt &&
			now - new Date(r.resumeUploadedAt).getTime() < 7 * 86400000,
	).length;

	const activeOrgs =
		(committees.data ?? []).filter((c) => c.active).length +
		(projects.data ?? []).filter((p) => p.active).length;

	const totalCheckIns = (checkIns.data ?? []).reduce((sum, e) => sum + e.count, 0);

	return (
		<div className="flex flex-col gap-8">
			<Card className="gap-8 rounded-xl border-border bg-card/60 p-5 shadow-lg shadow-black/40 lg:p-6">
				<Group title="Membership health">
					<Kpi value={total} label="active members" />
					<Kpi value={`${duesPct}%`} label={`dues paid (${duesPaid} of ${total})`} />
					<Kpi value={orgStats.data?.officers ?? 0} label="officers" />
				</Group>
				<Group title="Event operations">
					<Kpi value={upcomingWeek} label="events in the next 7 days" />
					<Kpi
						value={alerts.data?.length ?? 0}
						label="room reservations needing attention"
						warn={(alerts.data?.length ?? 0) > 0}
					/>
					<Kpi value={totalCheckIns} label="check-ins today" />
				</Group>
				<Group title="Records">
					<Kpi
						value={resumesOnFile}
						label={`résumés on file · ${resumesThisWeek} this week`}
					/>
					<Kpi value={activeOrgs} label="active committees / projects" />
					<Kpi
						value={pendingPhotos.data ?? 0}
						label="event photos still private"
						warn={(pendingPhotos.data ?? 0) > 0}
					/>
				</Group>
			</Card>

			{(alerts.data?.length ?? 0) > 0 && (
				<Card className="gap-3 rounded-xl border-border bg-card/60 p-5 shadow-lg shadow-black/40 lg:p-6">
					<h3 className="font-heading text-xs tracking-[0.14em] text-muted-foreground-dim uppercase">
						Needs attention
					</h3>
					<ul className="flex flex-col gap-2">
						{alerts.data!.map((a) => (
							<li
								key={a.eventId}
								className="flex items-center justify-between gap-2 text-sm"
							>
								<span className="text-foreground">
									{a.eventTitle} — room reservation {a.status}
								</span>
								<span className="font-mono text-xs text-muted-foreground-dim">
									{a.startTime}
								</span>
							</li>
						))}
					</ul>
				</Card>
			)}
		</div>
	);
}
