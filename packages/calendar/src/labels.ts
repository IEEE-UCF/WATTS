// Pure helpers for the label ↔ Google Calendar mapping.
//
// Google Calendar events carry a single-select `colorId` from a fixed set of 11.
// Our `event_labels` rows store that colorId directly, so the mapping is a
// pass-through with validation. The label slug is additionally written to the
// Google event's `extendedProperties.shared.wattsLabel` for human-readable
// filtering on the Google side.

/** Google Calendar's 11 built-in event colour ids. */
export const GOOGLE_COLOR_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] as const;
export type GoogleColorId = (typeof GOOGLE_COLOR_IDS)[number];

export function isGoogleColorId(v: string | null | undefined): v is GoogleColorId {
	return !!v && (GOOGLE_COLOR_IDS as readonly string[]).includes(v);
}

/** Normalise a stored label colorId to something Google will accept, or undefined. */
export function toGoogleColorId(colorId: string | null | undefined): GoogleColorId | undefined {
	return isGoogleColorId(colorId) ? colorId : undefined;
}

/**
 * The 6 categories the chapter already uses, ported from
 * playground/Calendar Sync/categories.py. Used to seed `event_labels`; after that
 * the table is the source of truth and staff edit it in the admin UI.
 */
export const SEED_EVENT_LABELS = [
	{ name: 'General Body Meeting', slug: 'gbm', colorId: '1', hex: '#a4bdfc', sortOrder: 10 },
	{ name: 'Technical Workshop', slug: 'workshop', colorId: '6', hex: '#ffb878', sortOrder: 20 },
	{ name: 'Social', slug: 'social', colorId: '5', hex: '#fbd75b', sortOrder: 30 },
	{ name: 'Professional Development', slug: 'pro-dev', colorId: '3', hex: '#dbadff', sortOrder: 40 },
	{ name: 'Service', slug: 'service', colorId: '2', hex: '#7ae7bf', sortOrder: 50 },
	{ name: 'Other', slug: 'other', colorId: '8', hex: '#e1e1e1', sortOrder: 60 },
] as const;
