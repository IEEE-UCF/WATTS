// Display + calendar helpers for public event pages. Times are always shown in the
// event's own time zone (almost always Eastern), not the viewer's.
//
// All-day events are the exception: they're stored Google-style as UTC midnights with an
// exclusive end (Veterans Day = Nov 11 00:00Z → Nov 12 00:00Z), and the Google sync reads
// their date in UTC. Reading them in Eastern lands on the evening before, so their dates
// are read in UTC (dayZone) and the end is the day after the last day.

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

/** The zone to read an event's *date* in — see the note at the top. */
function dayZone(e: EventTiming): string {
	return e.allDay ? 'UTC' : e.timeZone;
}

const DAY_MS = 86_400_000;

/** An all-day event's last day (its end is exclusive), or null when it's a single day. */
function allDayLastDay(e: EventTiming): string | null {
	if (!e.endTime) return null;
	const last = new Date(new Date(e.endTime).getTime() - DAY_MS).toISOString();
	// yyyymmdd strings compare correctly, across year boundaries too.
	return dayStamp(last, 'UTC') > dayStamp(e.startTime, 'UTC') ? last : null;
}

function sameDay(a: string, b: string, timeZone: string) {
	const d = (iso: string) =>
		parts(iso, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
	return d(a) === d(b);
}

/** "Thursday, October 2" */
export function longDate(e: EventTiming): string {
	return parts(e.startTime, dayZone(e), { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Thu, Oct 2" */
export function shortDate(e: EventTiming): string {
	return parts(e.startTime, dayZone(e), { weekday: 'short', month: 'short', day: 'numeric' });
}

/** { month: "OCT", day: "2" } for date blocks. */
export function dateBlock(e: EventTiming): { month: string; day: string } {
	return {
		month: parts(e.startTime, dayZone(e), { month: 'short' }).toUpperCase(),
		day: parts(e.startTime, dayZone(e), { day: 'numeric' }),
	};
}

/**
 * "7:00 – 8:30 PM", "7:00 PM", "All day", or "All day, through Fri, Nov 27".
 * Multi-day events show the end date too.
 */
export function timeRange(e: EventTiming): string {
	if (e.allDay) {
		const last = allDayLastDay(e);
		return last ? `All day, through ${shortDate({ ...e, startTime: last })}` : 'All day';
	}
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
	const day = (d: Date, timeZone: string) =>
		new Date(
			parts(d.toISOString(), timeZone, {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}),
		).getTime();
	const diff = Math.round(
		(day(new Date(e.startTime), dayZone(e)) - day(now, e.timeZone)) / DAY_MS,
	);
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

/** All-day DTSTART / DTEND (exclusive) as yyyymmdd, read in UTC like Google does. */
function allDayStamps(e: EventTiming): [string, string] {
	const start = dayStamp(e.startTime, 'UTC');
	const end = e.endTime ? dayStamp(e.endTime, 'UTC') : '';
	// No end, or an end on/before the start day → a single day.
	return [start, end > start ? end : dayStamp(e.startTime, 'UTC', 1)];
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
		? allDayStamps(e).join('/')
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
			? [`DTSTART;VALUE=DATE:${allDayStamps(e)[0]}`, `DTEND;VALUE=DATE:${allDayStamps(e)[1]}`]
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
