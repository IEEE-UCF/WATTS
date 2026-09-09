import { redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { ResumeDashboard } from '@/components/admin/resume-dashboard';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs review_resumes (PII).
export default async function AdminResumesPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'review_resumes')) redirect('/dashboard');

	return (
		<div className="flex min-h-screen flex-col bg-black">
			<div className="w-full px-5">
				<Navbar />
			</div>
			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
				<h1 className="mb-6 text-3xl font-[heading-font] text-[var(--ieee-dark-yellow)]">
					RÉSUMÉS
				</h1>
				<ResumeDashboard />
			</main>
		</div>
	);
}
