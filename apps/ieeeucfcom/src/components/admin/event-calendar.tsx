'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import type { RouterOutputs } from '@watts/api';

type AdminEvent = RouterOutputs['event']['getAllForAdmin'][number];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Chips shown per day cell before "+N more". */
const MAX_PER_DAY = 3;
/** Don't let a mis-entered end date paint an event across months. */
const MAX_SPAN_DAYS = 31;
const DEFAULT_TZ = 'America/New_York';

// Days are handled as "yyyy-mm-dd" keys and calendar maths runs in UTC, so DST and the
// viewer's own time zone can't shift an event onto the wrong square.

function addDays(key: string, n: number): string {
	const d = new Date(`${key}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** yyyy-mm-dd of an instant as seen in a time zone ('en-CA' formats exactly that way). */
function dayKeyIn(d: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(d);
}

export function monthKeyOf(d: Date, timeZone = DEFAULT_TZ): string {
	return dayKeyIn(d, timeZone).slice(0, 7);
}

function shiftMonth(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number);
	const d = new Date(Date.UTC(y, m - 1 + n, 1));
	return d.toISOString().slice(0, 7);
}

interface Placed {
	ev: AdminEvent;
	start: Date;
	end: Date;
	days: string[];
	time: string;
}

/**
 * Which calendar days an event covers. All-day events are stored Google-style: UTC
 * midnights with an exclusive end, so they're read in UTC. Timed events are read in
 * the event's own time zone, the same way the public event pages show them.
 */
function place(ev: AdminEvent, parse: (raw: string) => Date): Placed {
	const start = parse(ev.startTimeRaw);
	const rawEnd = ev.endTimeRaw ? parse(ev.endTimeRaw) : null;
	const tz = ev.timeZone ?? DEFAULT_TZ;
	let first: string;
	let last: string;
	if (ev.allDay) {
		first = start.toISOString().slice(0, 10);
		last = rawEnd ? addDays(rawEnd.toISOString().slice(0, 10), -1) : first;
	} else {
		first = dayKeyIn(start, tz);
		// An event ending exactly at midnight belongs to the day before.
		last = rawEnd ? dayKeyIn(new Date(rawEnd.getTime() - 1), tz) : first;
	}
	if (last < first) last = first;
	const days: string[] = [];
	for (let k = first; k <= last && days.length < MAX_SPAN_DAYS; k = addDays(k, 1)) days.push(k);

	const time = ev.allDay
		? 'All day'
		: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
				.format(start)
				.replace(':00', '')
				.replace(' AM', 'a')
				.replace(' PM', 'p');
	// No end time → treat as an hour long for clash checks.
	const end = rawEnd && rawEnd > start ? rawEnd : new Date(start.getTime() + 3_600_000);
	return { ev, start, end, days, time };
}

/** Live, public, timed events whose times overlap: id → titles it clashes with. */
function findClashes(placed: Placed[]): Map<string, string[]> {
	const timed = placed.filter((p) => !p.ev.allDay && p.ev.active && !p.ev.hidden);
	const clashes = new Map<string, string[]>();
	for (let i = 0; i < timed.length; i++) {
		for (let j = i + 1; j < timed.length; j++) {
			const a = timed[i];
			const b = timed[j];
			if (a.start < b.end && b.start < a.end) {
				clashes.set(a.ev.id, [...(clashes.get(a.ev.id) ?? []), b.ev.title]);
				clashes.set(b.ev.id, [...(clashes.get(b.ev.id) ?? []), a.ev.title]);
			}
		}
	}
	return clashes;
}

function EventChip({
	p,
	day,
	clashWith,
	onOpen,
	wide = false,
}: {
	p: Placed;
	day: string;
	clashWith?: string[];
	onOpen: (ev: AdminEvent) => void;
	wide?: boolean;
}) {
	const { ev } = p;
	const continued = p.days.length > 1 && day !== p.days[0];
	const title = [
		`${ev.title} — ${p.time}`,
		ev.location,
		p.days.length > 1 ? `${p.days.length} days` : '',
		ev.hidden ? 'Hidden from the events feed' : '',
		!ev.active ? 'Archived' : '',
		clashWith ? `Overlaps with: ${clashWith.join(', ')}` : '',
	]
		.filter(Boolean)
		.join('\n');

	return (
		<button
			type="button"
			title={title}
			onClick={(e) => {
				e.stopPropagation();
				onOpen(ev);
			}}
			style={{ borderLeftColor: ev.label?.hex ?? '#888' }}
			className={`flex w-full items-center gap-1 rounded border-l-[3px] bg-secondary/70 px-1.5 py-0.5 text-left transition-colors hover:bg-secondary ${
				wide ? 'text-sm' : 'text-[11px]'
			} ${clashWith ? 'ring-1 ring-red-500/80' : ''} ${ev.hidden ? 'italic opacity-60' : ''} ${
				!ev.active ? 'line-through opacity-50' : ''
			}`}
		>
			{clashWith && <TriangleAlert className="size-3 shrink-0 text-red-400" />}
			<span className="shrink-0 text-muted-foreground">{continued ? '↳' : p.time}</span>
			<span className="truncate text-foreground">{ev.title}</span>
		</button>
	);
}

export function EventCalendar({
	events,
	parse,
	month,
	onMonthChange,
	onOpen,
	onCreate,
}: {
	/** Already filtered by the filter bar / archived toggle. */
	events: AdminEvent[];
	/** The manager's Safari-safe Postgres timestamp parser. */
	parse: (raw: string) => Date;
	/** "yyyy-mm" */
	month: string;
	onMonthChange: (month: string) => void;
	onOpen: (ev: AdminEvent) => void;
	/** Create an event on this day (yyyy-mm-dd). */
	onCreate: (day: string) => void;
}) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const today = dayKeyIn(new Date(), DEFAULT_TZ);

	const { byDay, clashes } = useMemo(() => {
		const placed = events.map((ev) => place(ev, parse));
		const map = new Map<string, Placed[]>();
		for (const p of placed) {
			for (const d of p.days) map.set(d, [...(map.get(d) ?? []), p]);
		}
		// All-day first, then by start time.
		for (const list of map.values()) {
			list.sort(
				(a, b) =>
					Number(b.ev.allDay) - Number(a.ev.allDay) ||
					a.start.getTime() - b.start.getTime(),
			);
		}
		return { byDay: map, clashes: findClashes(placed) };
	}, [events, parse]);

	// Sunday-start grid covering the whole month.
	const firstOfMonth = `${month}-01`;
	const lead = new Date(`${firstOfMonth}T00:00:00Z`).getUTCDay();
	const gridStart = addDays(firstOfMonth, -lead);
	const daysInMonth = new Date(
		Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
	).getUTCDate();
	const weeks = Math.ceil((lead + daysInMonth) / 7);
	const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

	const monthLabel = new Date(`${firstOfMonth}T12:00:00Z`).toLocaleString('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
	const inMonth = (day: string) => day.startsWith(month);
	const monthDaysWithEvents = cells.filter((d) => inMonth(d) && byDay.has(d));
	const monthClashes = new Set(
		monthDaysWithEvents.flatMap((d) =>
			(byDay.get(d) ?? []).filter((p) => clashes.has(p.ev.id)).map((p) => p.ev.id),
		),
	).size;

	const navButton =
		'inline-flex h-8 items-center justify-center rounded-md border border-input px-2 text-sm text-foreground hover:border-ieee-dark-yellow';

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					aria-label="Previous month"
					onClick={() => onMonthChange(shiftMonth(month, -1))}
					className={navButton}
				>
					<ChevronLeft className="size-4" />
				</button>
				<button
					type="button"
					aria-label="Next month"
					onClick={() => onMonthChange(shiftMonth(month, 1))}
					className={navButton}
				>
					<ChevronRight className="size-4" />
				</button>
				<h2 className="min-w-40 px-1 text-lg font-semibold text-foreground">
					{monthLabel}
				</h2>
				<button
					type="button"
					onClick={() => onMonthChange(today.slice(0, 7))}
					disabled={month === today.slice(0, 7)}
					className={`${navButton} text-xs disabled:opacity-40`}
				>
					Today
				</button>
				<div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
					{monthClashes > 0 && (
						<span className="inline-flex items-center gap-1 text-red-300">
							<TriangleAlert className="size-3.5" /> {monthClashes} events overlap
						</span>
					)}
					<span className="hidden sm:inline">Click a day to add an event</span>
				</div>
			</div>

			{/* Month grid — tablets and up. */}
			<div className="hidden overflow-hidden rounded-lg border border-border md:block">
				<div className="grid grid-cols-7 border-b border-border bg-card/60 text-xs font-semibold text-muted-foreground uppercase">
					{WEEKDAYS.map((d) => (
						<div key={d} className="px-2 py-1.5">
							{d}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{cells.map((day, i) => {
						const list = byDay.get(day) ?? [];
						const open = expanded === day;
						const shown = open ? list : list.slice(0, MAX_PER_DAY);
						return (
							<div
								key={day}
								role="button"
								tabIndex={0}
								aria-label={`Add an event on ${day}`}
								onClick={() => onCreate(day)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && e.target === e.currentTarget)
										onCreate(day);
								}}
								className={`group relative min-h-28 cursor-pointer space-y-1 border-border p-1.5 transition-colors hover:bg-card/80 ${
									i % 7 !== 6 ? 'border-r' : ''
								} ${i < cells.length - 7 ? 'border-b' : ''} ${
									inMonth(day) ? 'bg-card/30' : 'bg-black/30'
								}`}
							>
								<div className="flex items-center justify-between">
									<span
										className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
											day === today
												? 'bg-ieee-dark-yellow font-bold text-black'
												: inMonth(day)
													? 'text-foreground'
													: 'text-muted-foreground-dim'
										}`}
									>
										{Number(day.slice(8))}
									</span>
									<Plus className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
								</div>
								{shown.map((p) => (
									<EventChip
										key={p.ev.id}
										p={p}
										day={day}
										clashWith={clashes.get(p.ev.id)}
										onOpen={onOpen}
									/>
								))}
								{list.length > MAX_PER_DAY && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											setExpanded(open ? null : day);
										}}
										className="w-full rounded px-1.5 text-left text-[11px] text-blue-400 hover:underline"
									>
										{open ? 'show less' : `+${list.length - MAX_PER_DAY} more`}
									</button>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* Agenda list — phones, where seven columns don't fit. */}
			<div className="space-y-3 md:hidden">
				{monthDaysWithEvents.length === 0 && (
					<p className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
						No events this month.
					</p>
				)}
				{monthDaysWithEvents.map((day) => (
					<div key={day} className="rounded-lg border border-border bg-card/30 p-2">
						<div className="mb-1.5 flex items-center justify-between">
							<span
								className={`text-sm font-semibold ${day === today ? 'text-ieee-dark-yellow' : 'text-foreground'}`}
							>
								{new Date(`${day}T12:00:00Z`).toLocaleString('en-US', {
									weekday: 'short',
									month: 'short',
									day: 'numeric',
									timeZone: 'UTC',
								})}
							</span>
							<button
								type="button"
								aria-label={`Add an event on ${day}`}
								onClick={() => onCreate(day)}
								className="text-muted-foreground hover:text-foreground"
							>
								<Plus className="size-4" />
							</button>
						</div>
						<div className="space-y-1">
							{(byDay.get(day) ?? []).map((p) => (
								<EventChip
									key={p.ev.id}
									p={p}
									day={day}
									clashWith={clashes.get(p.ev.id)}
									onOpen={onOpen}
									wide
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
