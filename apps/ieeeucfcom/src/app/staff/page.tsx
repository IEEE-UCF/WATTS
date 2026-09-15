import { redirect } from 'next/navigation';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasStaffCapability } from '@watts/permissions';
import { StaffHub } from '@/components/staff/staff-hub';
import { DashboardShell } from '@/components/shell/dashboard-shell';

// /staff — reachable by admins, officers, or anyone with a granted staff capability.
// src/middleware.ts is the fast gate; this is the authoritative backstop so an
// unauthorised hit never silently renders (or lands on the marketing home).
// Roles come from resolveMemberRoles (via getSessionRoles) — its permission set is
// already filtered to active AND non-expired grants.
export default async function StaffPage() {
	const { session, roles } = await getSessionRoles();
	if (!session) redirect('/auth/signin?callbackUrl=/staff');

	if (!roles?.administrator && !roles?.officerStatus && !hasStaffCapability(roles?.permissions)) {
		redirect('/dashboard');
	}

	return (
		<DashboardShell>
			<div className="mx-auto w-full max-w-6xl">
				<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">STAFF</h1>
				<StaffHub />
			</div>
		</DashboardShell>
	);
}
