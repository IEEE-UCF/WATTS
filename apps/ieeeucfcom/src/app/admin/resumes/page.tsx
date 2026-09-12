import { redirect } from 'next/navigation';
import { ResumeDashboard } from '@/components/admin/resume-dashboard';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs review_resumes (PII).
export default async function AdminResumesPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'review_resumes')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">RÉSUMÉS</h1>
			<ResumeDashboard />
		</div>
	);
}
