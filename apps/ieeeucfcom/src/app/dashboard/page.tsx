import { EventList } from '@/components/dashboard/event-list';
import { Member_QR_Code } from '@/components/dashboard/member-qr-code';
import { Card, CardHeader, CardTitle } from '@watts/ui/card';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export default function Dashboard() {
	return (
		<DashboardShell>
			<div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
				<Card className="flex-1 rounded-xl border border-border bg-ieee-black p-4 shadow-lg shadow-black/40 lg:p-6">
					<CardHeader>
						<CardTitle className="mb-1 text-lg font-semibold text-foreground lg:text-xl">
							Your Check-In QR
						</CardTitle>
					</CardHeader>
					<div className="flex justify-center">
						<Member_QR_Code />
					</div>
				</Card>

				<Card className="flex-1 rounded-xl border border-border bg-ieee-dark-grey p-4 shadow-lg shadow-black/40 lg:p-6">
					<CardTitle className="-mb-4 text-lg font-semibold text-foreground lg:text-xl">
						Upcoming Events
					</CardTitle>
					<EventList />
				</Card>
			</div>
		</DashboardShell>
	);
}
