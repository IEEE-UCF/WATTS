// Pure (no database imports), so client components can build event links too.

/** "/events/42/gbm-3-industry-night" — the one canonical address of an event page. */
export function eventPath(e: { number: number; slug: string | null }): string {
	return `/events/${e.number}/${e.slug || 'event'}`;
}
