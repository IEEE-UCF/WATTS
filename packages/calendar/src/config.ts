// Reads the Google Calendar service-account config from the root .env.
//
//   GOOGLE_SERVICE_ACCOUNT_JSON — the service-account key. Accepts THREE forms:
//       • raw JSON            {"type":"service_account", ...}
//       • base64-encoded JSON (easiest for .env / the Vercel dashboard)
//       • a path to the key file, absolute or relative to the repo root
//   GOOGLE_SERVICE_ACCOUNT_FILE — explicit path alternative to the above.
//   GOOGLE_CALENDAR_ID — the target calendar id, e.g. "ieee.ucf@gmail.com" or a
//       "...@group.calendar.google.com" id. The calendar must be shared with the
//       service-account email with "Make changes to events".
//
// When no key resolves the sync client degrades to a no-op (see createCalendarClient).

import { loadRootEnv } from '@watts/config/load-env';

export interface CalendarConfig {
	/** Raw value of GOOGLE_SERVICE_ACCOUNT_JSON (JSON, base64, or a path). */
	serviceAccount: string | null;
	/** Explicit path from GOOGLE_SERVICE_ACCOUNT_FILE. */
	serviceAccountFile: string | null;
	calendarId: string | null;
}

/** dotenv keeps inline `# comments` for quoted values — strip a trailing one defensively. */
function clean(v: string | undefined): string | null {
	if (!v) return null;
	const trimmed = v.trim().replace(/\s+#.*$/, '').trim();
	return trimmed || null;
}

export function getCalendarConfig(): CalendarConfig {
	loadRootEnv();
	return {
		serviceAccount: clean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
		serviceAccountFile: clean(process.env.GOOGLE_SERVICE_ACCOUNT_FILE),
		calendarId: clean(process.env.GOOGLE_CALENDAR_ID),
	};
}
