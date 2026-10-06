import { getPublicEventPage } from '@watts/core/event-page';
import { db } from '@/lib/database/client';
import { icsFile } from '@/lib/event-dates';

export const revalidate = 300;

/** GET /events/[slug]/calendar.ics — the event as a calendar file (Apple Calendar, Outlook). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const event = await getPublicEventPage(db, slug);
	if (!event) return new Response('Event not found', { status: 404 });
	const body = icsFile({
		...event,
		location: event.room ? `${event.room}, ${event.location}` : event.location,
		url: `https://www.ieeeucf.com/events/${slug}`,
	});
	return new Response(body, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${slug}.ics"`,
		},
	});
}
