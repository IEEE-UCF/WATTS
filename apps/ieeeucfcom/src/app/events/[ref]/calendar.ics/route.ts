import { eventPath, getPublicEventPage } from '@watts/core/event-page';
import { db } from '@/lib/database/client';
import { icsFile } from '@/lib/event-dates';

export const revalidate = 300;

/** GET /events/[number]/calendar.ics — the event as a calendar file (Apple Calendar, Outlook). */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
	const { ref } = await params;
	const event = /^\d{1,9}$/.test(ref) ? await getPublicEventPage(db, Number(ref)) : null;
	if (!event) return new Response('Event not found', { status: 404 });
	const body = icsFile({
		...event,
		location: event.room ? `${event.room}, ${event.location}` : event.location,
		url: `https://www.ieeeucf.com${eventPath(event)}`,
	});
	return new Response(body, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
		},
	});
}
