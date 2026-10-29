// Pure (no database imports), so client components can build event links too.

/** "/events/42/gbm-3-industry-night" — the one canonical address of an event page. */
export function eventPath(e: { number: number; slug: string | null }): string {
	return `/events/${e.number}/${e.slug || 'event'}`;
}

/** "/admin/events/42" — the officer/admin review page for an event. */
export function adminEventPath(e: { number: number }): string {
	return `/admin/events/${e.number}`;
}
