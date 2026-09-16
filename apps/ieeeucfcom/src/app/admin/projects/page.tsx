import { redirect } from 'next/navigation';
import { ProjectManager } from '@/components/admin/project-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_projects.
export default async function AdminProjectsPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_projects')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">PROJECT MANAGEMENT</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Assign members to a project as a lead or plain member, review self-service join
				requests, and manage each project&apos;s photos, category, and Discord linkage.
			</p>
			<ProjectManager />
		</div>
	);
}
