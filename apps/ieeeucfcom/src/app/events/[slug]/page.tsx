import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicEventPage, listRecentEventSlugs } from '@watts/core/event-page';
import { EventPageView } from '@/components/pg/event-page';
import { db } from '@/lib/database/client';
import { longDate, timeRange } from '@/lib/event-dates';

// Rendered on first visit and refreshed every 5 minutes, so edits to the event
// (time, room, flyer) and new photos show up without a deploy.
export const revalidate = 300;

const SITE = 'https://www.ieeeucf.com';

// One DB read per request, shared by generateMetadata and the page.
const loadEvent = cache((slug: string) => getPublicEventPage(db, slug));

export async function generateStaticParams() {
	try {
		return (await listRecentEventSlugs(db)).map((slug) => ({ slug }));
	} catch {
		// CI builds with a placeholder DATABASE_URL: pages render on first request instead.
		return [];
	}
}

interface Props {
	params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const event = await loadEvent(slug);
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
		openGraph: {
			title,
			description,
			url: `${SITE}/events/${slug}`,
			type: 'website',
			images: event.flyerUrl ? [{ url: event.flyerUrl }] : undefined,
		},
	};
}

export default async function EventPage({ params }: Props) {
	const { slug } = await params;
	const event = await loadEvent(slug);
	if (!event) notFound();
	return <EventPageView event={event} pageUrl={`${SITE}/events/${slug}`} />;
}
