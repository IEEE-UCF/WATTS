import { Navbar } from '@/components/navbar';
import { MembersManager } from '@/components/admin/members-manager';

// /admin/members — admins and officers. The admin-or-officer gate is admin/layout.tsx
// (server-side) plus src/middleware.ts (edge); this page's own requirement matches that
// floor exactly, so it adds no further check. Admins manage all roles/capabilities;
// officers see the roster and can toggle only admin-delegated capabilities.
export default function AdminMembersPage() {
	return (
		<div className="flex min-h-screen flex-col bg-black">
			<div className="w-full px-5">
				<Navbar />
			</div>
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
				<h1 className="mb-2 text-3xl font-[heading-font] text-[var(--ieee-dark-yellow)]">MEMBERS</h1>
				<p className="mb-6 text-sm text-gray-400">
					View the member roster with role, capability, résumé, and committee status. Admins can
					grant or revoke <strong>administrator</strong> / <strong>officer</strong> status and any
					capability; officers can toggle admin-delegated capabilities for regular members.
				</p>
				<MembersManager />
			</main>
		</div>
	);
}
