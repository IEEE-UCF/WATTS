import { redirect } from 'next/navigation';
import { EventManager } from '@/components/admin/event-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_events.
export default async function AdminEventsPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_events')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">EVENT MANAGEMENT</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Events created here are the source of truth. Each one mirrors to the chapter Google
				Calendar; tick <span className="text-foreground">Global</span> to also publish a
				Discord scheduled event.
			</p>
			<EventManager />
		</div>
	);
}
