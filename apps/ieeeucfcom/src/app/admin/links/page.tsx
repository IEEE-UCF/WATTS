import { redirect } from 'next/navigation';
import { LinksManager } from '@/components/admin/links-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';
import { shortLinkOrigin } from '@watts/core/short-link-rules';

// admin/layout.tsx requires admin-or-officer; this page needs manage_links.
export default async function AdminLinksPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_links')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">QR LINKS</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Make a short <span className="text-foreground">/go/</span> link and a QR code with
				the IEEE logo for flyers, slides and tabling. The QR points at the short link, so
				you can change where it goes after it&apos;s printed.
			</p>
			<LinksManager origin={shortLinkOrigin(process.env.SHORT_LINK_ORIGIN)} />
		</div>
	);
}
