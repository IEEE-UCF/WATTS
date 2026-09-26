import { redirect } from 'next/navigation';
import { SiteContentManager } from '@/components/admin/site-content/site-content-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_site_content.
export default async function AdminSiteContentPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_site_content')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">SITE CONTENT</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Photos, the officer roster, sponsors and documents on the public site, plus
				committee and project pages. Your edits publish immediately; edits from chairs,
				project leads and assigned editors wait in the review queue. Every change is kept in
				History and can be restored.
			</p>
			<SiteContentManager />
		</div>
	);
}
