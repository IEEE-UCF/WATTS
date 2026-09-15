import { redirect } from 'next/navigation';
import { AdminOverview } from '@/components/admin/overview';
import { getSessionRoles } from '@/lib/auth-guards';

export default async function Dashboard() {
	// admin/layout.tsx already required admin-or-officer; this page is admin-only.
	const { roles } = await getSessionRoles();
	if (!roles?.administrator) redirect('/dashboard');

	return (
		<div className="mx-auto max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">OVERVIEW</h1>
			<AdminOverview />
		</div>
	);
}
