import { notFound, redirect } from 'next/navigation';
import { getSessionRoles } from '@/lib/auth-guards';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { PageEditor } from '@/components/admin/site-content/page-editor';

// Committee/project page editor. Middleware requires a session; who may edit which page
// (staff, the chair/lead, or an assigned editor) is enforced by the siteContent router.
export const dynamic = 'force-dynamic';

interface Props {
	params: Promise<{ type: string; slug: string }>;
}

export default async function EditContentPage({ params }: Props) {
	const { type, slug } = await params;
	if (type !== 'committee' && type !== 'project') notFound();

	const { session } = await getSessionRoles();
	if (!session) redirect(`/auth/signin?callbackUrl=/pages/${type}/${slug}/edit`);

	return (
		<DashboardShell>
			<div className="mx-auto w-full max-w-4xl">
				<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">
					EDIT {type === 'committee' ? 'COMMITTEE' : 'PROJECT'} PAGE
				</h1>
				<PageEditor type={type} slug={slug} />
			</div>
		</DashboardShell>
	);
}
