import { DashboardShell } from '@/components/shell/dashboard-shell';
import { Storefront } from '@/components/merch/storefront';

// Signed-in only (middleware protectedRoutes): orders are tied to the account.
export const metadata = { title: 'Merch store · IEEE UCF' };

export default function MerchPage() {
	return (
		<DashboardShell>
			<div className="mx-auto w-full max-w-6xl">
				<Storefront />
			</div>
		</DashboardShell>
	);
}
