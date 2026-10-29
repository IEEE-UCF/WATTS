import { notFound, redirect } from 'next/navigation';
import { EventReview } from '@/components/admin/event-review';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One event's review page: wrap-up checklist, photo upload, check-in scanner, reminders.
// admin/layout.tsx requires admin-or-officer; middleware + this page need manage_events
// (same as /admin/events). The photo and scanner sections also check their own capability.
export default async function AdminEventReviewPage({ params }: { params: Promise<{ id: string }> }) {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_events')) redirect('/dashboard');
	const { id } = await params;
	if (!UUID.test(id)) notFound();

	return (
		<div className="mx-auto w-full max-w-6xl">
			<EventReview eventId={id} />
		</div>
	);
}
