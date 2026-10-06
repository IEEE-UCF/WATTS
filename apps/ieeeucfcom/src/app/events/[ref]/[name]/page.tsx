import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { eventPath, getPublicEventPage, listRecentEventRefs } from '@watts/core/event-page';
import { EventPageView } from '@/components/pg/event-page';
import { db } from '@/lib/database/client';
import { longDate, timeRange } from '@/lib/event-dates';

// /events/[number]/[name] — the event page. The number decides which event; the name
// is the readable part. Rendered on first visit, refreshed every 5 minutes so edits to
// the event (time, room, flyer) and new photos show up without a deploy.
export const revalidate = 300;

const SITE = 'https://www.ieeeucf.com';

// One DB read per request, shared by generateMetadata and the page.
const loadEvent = cache((number: number) => getPublicEventPage(db, number));

/** "42" → 42; anything else (old-style slugs) isn't handled here. */
function parseNumber(ref: string): number | null {
	return /^\d{1,9}$/.test(ref) ? Number(ref) : null;
}

export async function generateStaticParams() {
	try {
		return (await listRecentEventRefs(db)).map((e) => ({
			ref: String(e.number),
			name: e.slug,
		}));
	} catch {
		// CI builds with a placeholder DATABASE_URL: pages render on first request instead.
		return [];
	}
}

interface Props {
	params: Promise<{ ref: string; name: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { ref } = await params;
	const number = parseNumber(ref);
	const event = number ? await loadEvent(number) : null;
	if (!event) return { title: 'Event | IEEE UCF' };
	const title = `${event.title} | IEEE UCF`;
	const description =
		`${longDate(event)}, ${timeRange(event)} · ${event.location}. ${event.description}`.slice(
			0,
			200,
		);
	return {
		title,
		description,
		alternates: { canonical: `${SITE}${eventPath(event)}` },
		openGraph: {
			title,
			description,
			url: `${SITE}${eventPath(event)}`,
			type: 'website',
			images: event.flyerUrl ? [{ url: event.flyerUrl }] : undefined,
		},
	};
}

export default async function EventPage({ params }: Props) {
	const { ref, name } = await params;
	const number = parseNumber(ref);
	const event = number ? await loadEvent(number) : null;
	if (!event) notFound();
	// A renamed event (or a typo in the name part) goes to the current address.
	if (decodeURIComponent(name) !== event.slug) permanentRedirect(eventPath(event));
	return <EventPageView event={event} pageUrl={`${SITE}${eventPath(event)}`} />;
}
