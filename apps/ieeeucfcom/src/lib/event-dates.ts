// Display + calendar helpers for public event pages. Times are always shown in the
// event's own time zone (almost always Eastern), not the viewer's.

export interface EventTiming {
	title?: string;
	startTime: string;
	endTime: string | null;
	allDay: boolean;
	timeZone: string;
}

function parts(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).format(new Date(iso));
}

function sameDay(a: string, b: string, timeZone: string) {
	const d = (iso: string) =>
		parts(iso, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
	return d(a) === d(b);
}

/** "Thursday, October 2" */
export function longDate(e: EventTiming): string {
	return parts(e.startTime, e.timeZone, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Thu, Oct 2" */
export function shortDate(e: EventTiming): string {
	return parts(e.startTime, e.timeZone, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** { month: "OCT", day: "2" } for date blocks. */
export function dateBlock(e: EventTiming): { month: string; day: string } {
	return {
		month: parts(e.startTime, e.timeZone, { month: 'short' }).toUpperCase(),
		day: parts(e.startTime, e.timeZone, { day: 'numeric' }),
	};
}

/** "7:00 – 8:30 PM", "7:00 PM", or "All day". Multi-day events show the end date too. */
export function timeRange(e: EventTiming): string {
	if (e.allDay) return 'All day';
	const t = (iso: string) => parts(iso, e.timeZone, { hour: 'numeric', minute: '2-digit' });
	const start = t(e.startTime);
	if (!e.endTime) return start;
	if (!sameDay(e.startTime, e.endTime, e.timeZone)) {
		return `${start} – ${shortDate({ ...e, startTime: e.endTime })}, ${t(e.endTime)}`;
	}
	const end = t(e.endTime);
	const [sTime, sMer] = start.split(' ');
	const [, eMer] = end.split(' ');
	// "7:00 – 8:30 PM" when both halves share AM/PM.
	return sMer === eMer ? `${sTime} – ${end}` : `${start} – ${end}`;
}

/** Short zone label for the time, e.g. "Eastern". */
export function zoneLabel(timeZone: string): string {
	return timeZone === 'America/New_York'
		? 'Eastern'
		: (new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
				.formatToParts(new Date())
				.find((p) => p.type === 'timeZoneName')?.value ?? timeZone);
}

/** "Today", "Tomorrow", "In 3 days", or null when it's further out or already past. */
export function relativeDay(e: EventTiming, now = new Date()): string | null {
	const day = (d: Date) =>
		new Date(
			parts(d.toISOString(), e.timeZone, {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}),
		).getTime();
	const diff = Math.round((day(new Date(e.startTime)) - day(now)) / 86_400_000);
	if (diff < 0) return null;
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Tomorrow';
	if (diff <= 14) return `In ${diff} days`;
	return null;
}

function utcStamp(iso: string) {
	return new Date(iso)
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

function dayStamp(iso: string, timeZone: string, addDays = 0) {
	const d = new Date(new Date(iso).getTime() + addDays * 86_400_000);
	return parts(d.toISOString(), timeZone, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3$1$2');
}

/** The event's end for calendar files: its end time, else start + 1 hour. */
function calendarEnd(e: EventTiming) {
	return e.endTime ?? new Date(new Date(e.startTime).getTime() + 3_600_000).toISOString();
}

/** "Add to Google Calendar" link. */
export function googleCalendarUrl(
	e: EventTiming & { title: string; location: string; details?: string },
): string {
	const dates = e.allDay
		? `${dayStamp(e.startTime, e.timeZone)}/${dayStamp(calendarEnd(e), e.timeZone, 1)}`
		: `${utcStamp(e.startTime)}/${utcStamp(calendarEnd(e))}`;
	const q = new URLSearchParams({
		action: 'TEMPLATE',
		text: e.title,
		dates,
		location: e.location,
		details: e.details ?? '',
		ctz: e.timeZone,
	});
	return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function icsEscape(text: string) {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/\n/g, '\\n')
		.replace(/([,;])/g, '\\$1');
}

/** A one-event iCalendar file (Apple Calendar, Outlook). */
export function icsFile(
	e: EventTiming & {
		id: string;
		title: string;
		location: string;
		description: string;
		url: string;
	},
): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//IEEE UCF//Events//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${e.id}@ieeeucf.com`,
		`DTSTAMP:${utcStamp(new Date().toISOString())}`,
		...(e.allDay
			? [
					`DTSTART;VALUE=DATE:${dayStamp(e.startTime, e.timeZone)}`,
					`DTEND;VALUE=DATE:${dayStamp(calendarEnd(e), e.timeZone, 1)}`,
				]
			: [`DTSTART:${utcStamp(e.startTime)}`, `DTEND:${utcStamp(calendarEnd(e))}`]),
		`SUMMARY:${icsEscape(e.title)}`,
		`LOCATION:${icsEscape(e.location)}`,
		`DESCRIPTION:${icsEscape(`${e.description}\n\n${e.url}`)}`,
		`URL:${e.url}`,
		'END:VEVENT',
		'END:VCALENDAR',
	];
	return lines.join('\r\n') + '\r\n';
}
