import { notFound, permanentRedirect } from 'next/navigation';
import { eventPath, getPublicEventPage, resolveLegacyEventSlug } from '@watts/core/event-page';
import { db } from '@/lib/database/client';

// Not a page of its own, only forwards to /events/[number]/[name]:
// - /events/42 (number only, e.g. typed or from a QR code)
// - /events/gbm-3-industry-night-2026-10-02 (links shared before numbered URLs, and
//   any old name kept in page_redirects)
export const dynamic = 'force-dynamic';

export default async function EventRedirect({ params }: { params: Promise<{ ref: string }> }) {
	const { ref } = await params;
	if (/^\d{1,9}$/.test(ref)) {
		const event = await getPublicEventPage(db, Number(ref));
		if (event) permanentRedirect(eventPath(event));
		notFound();
	}
	const target = await resolveLegacyEventSlug(db, decodeURIComponent(ref));
	if (target) permanentRedirect(eventPath(target));
	notFound();
}
