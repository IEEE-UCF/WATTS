import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { eventPath, listRecentEventRefs } from '@watts/core/event-page';
import { EventPageView } from '@/components/pg/event-page';
import { db } from '@/lib/database/client';
import { longDate, timeRange } from '@/lib/event-dates';
import { getEventPage } from '@/lib/events';

// /events/[number]/[name] — the event page. The number decides which event; the name
// is the readable part. Rendered on first visit and refreshed the moment an officer
// saves the event, its flyer or its photos (the `events` cache tag), plus every 5
// minutes so it flips from "upcoming" to "past" on time.
export const revalidate = 300;

const SITE = 'https://www.ieeeucf.com';

// Cached + tagged (lib/events.ts); generateMetadata and the page share the one read.
const loadEvent = getEventPage;

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
