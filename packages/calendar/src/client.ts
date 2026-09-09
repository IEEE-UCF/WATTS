// Google Calendar sync client.
//
// createCalendarClient() returns EITHER a real client backed by the service
// account, OR a no-op client (enabled === false) when GOOGLE_SERVICE_ACCOUNT_JSON
// / GOOGLE_CALENDAR_ID are unset — local dev, CI, and any deploy that hasn't been
// given calendar credentials. The no-op path lets `@watts/core` call the client
// unconditionally: a create still succeeds, it just records syncStatus 'skipped'.
//
// The REST shapes mirror playground/Calendar Sync/service_account_manager.py.
//
// Colour: this chapter's calendar uses NATIVE event labels (Calendar Settings →
// "Event labels", eventLabelVersion=1). When a calendar has them, per-event
// `colorId` writes are ignored on update — the colour is driven by `eventLabelId`.
// We send BOTH: `eventLabelId` (native-label calendars) and `colorId` (fallback
// for calendars without labels; also honoured on create everywhere). Every event
// request carries ?eventLabelVersion=1 so the label field round-trips.

import { createJwtClient, resolveServiceAccountKey } from './auth';
import { getCalendarConfig } from './config';
import { toGoogleColorId } from './labels';

const API_BASE = 'https://www.googleapis.com/calendar/v3';
/** Default event length when the caller gives no end time. Google requires an end. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export interface CalendarEventInput {
	summary: string;
	description?: string;
	location?: string;
	/** ISO timestamp (or "YYYY-MM-DD..." — only the date part is used when allDay). */
	start: string;
	/** ISO timestamp. Defaults to start + 1h. */
	end?: string | null;
	timeZone: string;
	allDay?: boolean;
	/** Stored label colorId ("1".."11") or null — fallback for label-less calendars. */
	colorId?: string | null;
	/** Native Google Calendar event-label id (UUID) or null — the real colour driver here. */
	googleLabelId?: string | null;
	/** Our `events.id` — the durable link, written to extendedProperties.private. */
	wattsEventId: string;
	/** Label slug — written to extendedProperties.shared for Google-side filtering. */
	wattsLabel?: string | null;
}

export interface GoogleEvent {
	id: string;
	status?: string;
	summary?: string;
	description?: string;
	location?: string;
	htmlLink?: string;
	colorId?: string;
	eventLabelId?: string;
	updated?: string;
	start?: { date?: string; dateTime?: string; timeZone?: string };
	end?: { date?: string; dateTime?: string; timeZone?: string };
	extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}

/** A native event label configured on the calendar (Settings → Event labels). */
export interface NativeCalendarLabel {
	id: string;
	name: string;
	backgroundColor?: string;
}

export interface CalendarWriteResult {
	status: 'synced' | 'skipped';
	googleCalendarEventId?: string;
	htmlLink?: string;
}

export interface CalendarDeleteResult {
	status: 'deleted' | 'skipped';
}

export interface CalendarClient {
	readonly enabled: boolean;
	createEvent(input: CalendarEventInput): Promise<CalendarWriteResult>;
	updateEvent(googleEventId: string, input: CalendarEventInput): Promise<CalendarWriteResult>;
	deleteEvent(googleEventId: string): Promise<CalendarDeleteResult>;
	getEvent(googleEventId: string): Promise<GoogleEvent | null>;
	listEvents(opts?: { timeMinIso?: string; maxResults?: number }): Promise<GoogleEvent[]>;
	/** The native event labels configured on the calendar. Empty if none / no creds. */
	listNativeLabels(): Promise<NativeCalendarLabel[]>;
}

function dateOnly(iso: string): string {
	return iso.slice(0, 10);
}

function buildBody(input: CalendarEventInput): Record<string, unknown> {
	const body: Record<string, unknown> = {
		summary: input.summary,
		description: input.description ?? '',
		location: input.location ?? '',
		extendedProperties: {
			private: { wattsEventId: input.wattsEventId },
			shared: input.wattsLabel ? { wattsLabel: input.wattsLabel } : {},
		},
	};

	if (input.allDay) {
		const startDate = dateOnly(input.start);
		const endDate = input.end ? dateOnly(input.end) : startDate;
		body.start = { date: startDate };
		body.end = { date: endDate };
	} else {
		const startMs = new Date(input.start).getTime();
		const endMs = input.end ? new Date(input.end).getTime() : startMs + DEFAULT_DURATION_MS;
		body.start = { dateTime: new Date(startMs).toISOString(), timeZone: input.timeZone };
		body.end = { dateTime: new Date(endMs).toISOString(), timeZone: input.timeZone };
	}

	const colorId = toGoogleColorId(input.colorId);
	if (colorId) body.colorId = colorId;
	// null clears any existing label; undefined leaves it untouched on PATCH.
	if (input.googleLabelId !== undefined) body.eventLabelId = input.googleLabelId ?? null;
	return body;
}

const NOOP_CLIENT: CalendarClient = {
	enabled: false,
	async createEvent() {
		return { status: 'skipped' };
	},
	async updateEvent() {
		return { status: 'skipped' };
	},
	async deleteEvent() {
		return { status: 'skipped' };
	},
	async getEvent() {
		return null;
	},
	async listEvents() {
		return [];
	},
	async listNativeLabels() {
		return [];
	},
};

class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly body: string,
	) {
		super(`Google Calendar API ${status}: ${body.slice(0, 500)}`);
		this.name = 'CalendarHttpError';
	}
}

/** Append ?eventLabelVersion=1 (or &…) so the native-label field round-trips. */
function withLabelVersion(url: string): string {
	return url + (url.includes('?') ? '&' : '?') + 'eventLabelVersion=1';
}

/**
 * Build the sync client. Reads env each call but the JWT client caches its token
 * internally, so repeated calls are cheap.
 */
export function createCalendarClient(): CalendarClient {
	const { serviceAccount, serviceAccountFile, calendarId } = getCalendarConfig();
	const key = resolveServiceAccountKey(serviceAccount, serviceAccountFile);
	if (!key || !calendarId) return NOOP_CLIENT;

	const jwt = createJwtClient(key);
	const calPath = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}`;

	async function authHeaders(): Promise<Record<string, string>> {
		const { token } = await jwt.getAccessToken();
		if (!token) throw new Error('Failed to obtain a Google access token');
		return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
	}

	async function request<T>(url: string, init: RequestInit): Promise<T | null> {
		const res = await fetch(url, { ...init, headers: { ...(await authHeaders()), ...init.headers } });
		if (res.status === 404) return null;
		if (res.status === 204) return null;
		const text = await res.text();
		if (!res.ok) throw new HttpError(res.status, text);
		return text ? (JSON.parse(text) as T) : null;
	}

	return {
		enabled: true,

		async createEvent(input) {
			const created = await request<GoogleEvent>(withLabelVersion(`${calPath}/events`), {
				method: 'POST',
				body: JSON.stringify(buildBody(input)),
			});
			if (!created?.id) throw new Error('Google Calendar create returned no event id');
			return { status: 'synced', googleCalendarEventId: created.id, htmlLink: created.htmlLink };
		},

		async updateEvent(googleEventId, input) {
			// PATCH is a merge — leaves fields we don't send (attendees, reminders…) intact.
			const updated = await request<GoogleEvent>(
				withLabelVersion(`${calPath}/events/${encodeURIComponent(googleEventId)}`),
				{ method: 'PATCH', body: JSON.stringify(buildBody(input)) },
			);
			if (!updated?.id) {
				// The linked event vanished on Google's side — recreate it.
				return this.createEvent(input);
			}
			return { status: 'synced', googleCalendarEventId: updated.id, htmlLink: updated.htmlLink };
		},

		async deleteEvent(googleEventId) {
			await request(`${calPath}/events/${encodeURIComponent(googleEventId)}`, { method: 'DELETE' });
			return { status: 'deleted' };
		},

		async getEvent(googleEventId) {
			return request<GoogleEvent>(
				withLabelVersion(`${calPath}/events/${encodeURIComponent(googleEventId)}`),
				{ method: 'GET' },
			);
		},

		async listEvents(opts) {
			const params = new URLSearchParams({
				singleEvents: 'true',
				orderBy: 'startTime',
				maxResults: String(opts?.maxResults ?? 250),
				eventLabelVersion: '1',
			});
			if (opts?.timeMinIso) params.set('timeMin', opts.timeMinIso);
			const page = await request<{ items?: GoogleEvent[] }>(`${calPath}/events?${params.toString()}`, {
				method: 'GET',
			});
			return page?.items ?? [];
		},

		async listNativeLabels() {
			const cal = await request<{
				labelProperties?: { eventLabels?: NativeCalendarLabel[] };
			}>(withLabelVersion(calPath), { method: 'GET' });
			return cal?.labelProperties?.eventLabels ?? [];
		},
	};
}
