import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicEventPage, type PublicEventPage } from '@watts/core/event-page';
import { db } from '@/lib/database/client';

// Public event pages are cached under one tag. The tRPC event mutations refresh it
// (revalidateTag('events')) whenever an event, its flyer or its photos change, so
// edits and renamed addresses show up at once. The 5-minute refresh is still needed:
// a page switches from "upcoming" to "past" as time passes, with no edit involved.
export const EVENTS_TAG = 'events';
export const EVENTS_REVALIDATE = 300;

const cachedEventPage = unstable_cache(
	(number: number) => getPublicEventPage(db, number),
	['event-page'],
	{ tags: [EVENTS_TAG], revalidate: EVENTS_REVALIDATE },
);

/** The event page data for /events/[number]/…, or null. DB errors propagate (not cached). */
export function getEventPage(number: number): Promise<PublicEventPage | null> {
	return cachedEventPage(number);
}
