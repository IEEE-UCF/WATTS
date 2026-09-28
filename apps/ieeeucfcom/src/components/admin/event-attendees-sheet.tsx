'use client';

import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@watts/ui/sheet';
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	TableEmpty,
} from '@watts/ui/table';

type AttendeeReport = NonNullable<RouterOutputs['event']['getAttendees']>;

function csvCell(value: string | number | boolean): string {
	const s = String(value);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Built in the browser from the query result — the list is small and already loaded. */
function downloadCsv(report: AttendeeReport) {
	const header = [
		'first_name',
		'last_name',
		'ucf_email',
		'major',
		'graduation_year',
		'dues_paid',
		'first_time',
		'checked_in_at',
	];
	const rows = report.attendees.map((a) => [
		a.firstName,
		a.lastName,
		a.ucfEmail,
		a.major,
		a.graduationYear,
		a.duesPaid,
		a.firstTime,
		new Date(a.checkedInAt).toISOString(),
	]);
	const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
	const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = `${report.event.title.replace(/[^\w-]+/g, '_')}_attendees.csv`;
	link.click();
	URL.revokeObjectURL(url);
}

function formatTime(at: Date): string {
	return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Post-event summary: who checked in to one event, with a CSV export. */
export function EventAttendeesSheet({
	eventId,
	onClose,
}: {
	eventId: string | null;
	onClose: () => void;
}) {
	const { data, isLoading, error } = trpc.event.getAttendees.useQuery(
		{ eventId: eventId ?? '' },
		{ enabled: Boolean(eventId) },
	);

	return (
		<Sheet open={Boolean(eventId)} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{data ? data.event.title : 'Attendees'}</SheetTitle>
					<SheetDescription>Everyone checked in with the scanner.</SheetDescription>
				</SheetHeader>

				<div className="space-y-4 px-4 pb-6">
					{isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
					{error && <p className="text-sm text-red-400">{error.message}</p>}

					{data && (
						<>
							<div className="grid grid-cols-3 gap-3 text-center">
								{[
									['Checked in', data.stats.total],
									['Dues paid', data.stats.duesPaid],
									['First-timers', data.stats.firstTimers],
								].map(([label, value]) => (
									<div
										key={label}
										className="rounded-lg border border-border bg-card/60 p-3"
									>
										<div className="text-2xl font-semibold text-foreground">
											{value}
										</div>
										<div className="text-xs text-muted-foreground">{label}</div>
									</div>
								))}
							</div>

							<button
								type="button"
								disabled={data.attendees.length === 0}
								onClick={() => downloadCsv(data)}
								className="rounded-md border border-input px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
							>
								Download CSV
							</button>

							<Table>
								<TableHeader className="bg-card/60 text-xs uppercase">
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Major</TableHead>
										<TableHead>Grad</TableHead>
										<TableHead>Dues</TableHead>
										<TableHead>Time</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.attendees.map((a) => (
										<TableRow key={a.memberId}>
											<TableCell>
												<div className="font-medium">
													{a.firstName} {a.lastName}
													{a.firstTime && (
														<span className="ml-2 rounded bg-blue-900/60 px-1.5 py-0.5 text-[10px] text-blue-300 uppercase">
															first time
														</span>
													)}
												</div>
												<div className="text-xs text-muted-foreground-dim">
													{a.ucfEmail}
												</div>
											</TableCell>
											<TableCell className="text-xs">{a.major}</TableCell>
											<TableCell className="text-xs">
												{a.graduationYear}
											</TableCell>
											<TableCell className="text-xs">
												{a.duesPaid ? '✓' : ''}
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{formatTime(a.checkedInAt)}
											</TableCell>
										</TableRow>
									))}
									{data.attendees.length === 0 && (
										<TableEmpty colSpan={5}>No one checked in.</TableEmpty>
									)}
								</TableBody>
							</Table>
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
