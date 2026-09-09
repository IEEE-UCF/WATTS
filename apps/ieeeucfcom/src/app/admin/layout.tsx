import { redirect } from 'next/navigation';
import { getSessionRoles } from '@/lib/auth-guards';

// Server-side gate for every /admin/* route — the authoritative backstop, not just
// src/middleware.ts. Common floor: signed in + (administrator OR officer). Each page
// tightens this to its own requirement (dashboard → admin only; photos → manage_event_photos;
// resumes → review_resumes). Reading the session here also forces the whole /admin
// subtree to render dynamically, so there are no statically-cached admin shells.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	const { session, roles } = await getSessionRoles();

	if (!session) redirect('/auth/signin?callbackUrl=/admin');
	if (!roles?.administrator && !roles?.officerStatus) redirect('/dashboard');

	return <>{children}</>;
}
