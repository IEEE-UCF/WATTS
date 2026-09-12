import { Card, CardTitle } from '@watts/ui/card';

export interface AttendanceSummaryProps {
	attendance: { eventId: string; title: string; startTime: string; attendedAt: Date }[];
}

const MONTH_LABELS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

/** Count + a 6-month bar chart, bucketed client-side — per-member attendance volume is
 * small enough that this doesn't need date-bucketing SQL. */
export function AttendanceSummary({ attendance }: AttendanceSummaryProps) {
	const now = new Date();
	const months: { key: string; label: string; count: number }[] = [];
	for (let i = 5; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		months.push({
			key: `${d.getFullYear()}-${d.getMonth()}`,
			label: MONTH_LABELS[d.getMonth()],
			count: 0,
		});
	}
	const byKey = new Map(months.map((m) => [m.key, m]));
	for (const a of attendance) {
		const d = new Date(a.attendedAt);
		const key = `${d.getFullYear()}-${d.getMonth()}`;
		const bucket = byKey.get(key);
		if (bucket) bucket.count += 1;
	}

	const semesterCount = months.reduce((sum, m) => sum + m.count, 0);
	const max = Math.max(1, ...months.map((m) => m.count));

	return (
		<Card className="gap-4 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">Attendance</CardTitle>
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-3xl font-semibold text-foreground">
					{semesterCount}
				</span>
				<span className="text-xs text-muted-foreground">
					events attended, last 6 months
				</span>
			</div>
			<div className="flex h-16 items-end gap-2.5">
				{months.map((m) => (
					<div
						key={m.key}
						className="flex h-full flex-1 flex-col items-center justify-end gap-1"
					>
						<span className="font-mono text-[10px] text-muted-foreground-dim">
							{m.count}
						</span>
						<div
							className="w-full max-w-6 rounded-t-sm bg-secondary"
							style={{ height: `${Math.max(6, (m.count / max) * 100)}%` }}
						/>
						<span className="font-mono text-[10px] text-muted-foreground-dim">
							{m.label}
						</span>
					</div>
				))}
			</div>
		</Card>
	);
}
