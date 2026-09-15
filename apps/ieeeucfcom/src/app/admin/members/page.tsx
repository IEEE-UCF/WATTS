import { MembersManager } from '@/components/admin/members-manager';

// /admin/members — admins and officers. The admin-or-officer gate is admin/layout.tsx
// (server-side) plus src/middleware.ts (edge); this page's own requirement matches that
// floor exactly, so it adds no further check. Admins manage all roles/capabilities;
// officers see the roster and can toggle only admin-delegated capabilities.
export default function AdminMembersPage() {
	return (
		<div className="mx-auto w-full max-w-7xl">
			<h1 className="mb-2 font-heading text-3xl text-ieee-dark-yellow">MEMBERS</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				View the member roster with role, capability, résumé, and committee status. Admins
				can grant or revoke <strong>administrator</strong> / <strong>officer</strong> status
				and any capability; officers can toggle admin-delegated capabilities for regular
				members.
			</p>
			<MembersManager />
		</div>
	);
}
