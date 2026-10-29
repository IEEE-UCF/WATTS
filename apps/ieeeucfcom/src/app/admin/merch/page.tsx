import { redirect } from 'next/navigation';
import { MerchManager } from '@/components/admin/merch-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_merch.
export default async function AdminMerchPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_merch')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">MERCH</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Approve shirt requests, record payments and hand-offs, and edit what&apos;s in the
				store. Buyers pay in person; each step records who did it and when.
			</p>
			<MerchManager />
		</div>
	);
}
