import { EventShowcase } from '@/components/dashboard/event-showcase';
import { Member_QR_Code } from '@/components/dashboard/member-qr-code';
import { DashboardWidgets } from '@/components/dashboard/dashboard-widgets';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export default function Dashboard() {
	return (
		<DashboardShell>
			<div className="mx-auto flex max-w-6xl flex-col gap-6">
				<div className="flex flex-col gap-6 lg:flex-row">
					<div className="flex lg:w-[340px] lg:flex-none">
						<Member_QR_Code />
					</div>
					<div className="flex-1">
						<EventShowcase />
					</div>
				</div>
				<DashboardWidgets />
			</div>
		</DashboardShell>
	);
}
