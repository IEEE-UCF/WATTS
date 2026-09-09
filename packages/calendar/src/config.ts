// Reads the Google Calendar service-account config from the root .env.
//
//   GOOGLE_SERVICE_ACCOUNT_JSON — the service-account key, either raw JSON or
//                                 base64-encoded JSON (base64 avoids newline/quote
//                                 escaping in .env files and the Vercel dashboard).
//   GOOGLE_CALENDAR_ID          — the target calendar id, e.g. "ieee.ucf@gmail.com"
//                                 or "...@group.calendar.google.com". The calendar
//                                 must be shared with the service-account email with
//                                 "Make changes to events".
//
// When either is unset the sync client degrades to a no-op (see createCalendarClient).

import { loadRootEnv } from '@watts/config/load-env';

export interface CalendarConfig {
	serviceAccountJson: string | null;
	calendarId: string | null;
}

export function getCalendarConfig(): CalendarConfig {
	loadRootEnv();
	return {
		serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || null,
		calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || null,
	};
}
