import { notFound, redirect } from 'next/navigation';
import { EventReview } from '@/components/admin/event-review';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One event's review page: wrap-up checklist, photo upload, check-in scanner, reminders.
// Addressed by the event's number (/admin/events/42 — the same number as its public page
// /events/42/…) or, for older links, its id. admin/layout.tsx requires admin-or-officer;
// middleware + this page need manage_events (same as /admin/events). The photo and
// scanner sections also check their own capability.
export default async function AdminEventReviewPage({ params }: { params: Promise<{ ref: string }> }) {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_events')) redirect('/dashboard');
	const { ref } = await params;
	const eventRef = /^\d{1,9}$/.test(ref) ? { number: Number(ref) } : UUID.test(ref) ? { id: ref } : null;
	if (!eventRef) notFound();

	return (
		<div className="mx-auto w-full max-w-6xl">
			<EventReview eventRef={eventRef} />
		</div>
	);
}
