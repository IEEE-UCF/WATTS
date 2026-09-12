'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import type { RouterOutputs } from '@watts/api';
import { Card, CardContent, CardTitle } from '@watts/ui/card';
import { ScrollArea, ScrollBar } from '@watts/ui/scroll-area';
import { cn } from '@watts/ui/cn';
import { trpc } from '@/lib/trpc/client';
import { TogglePill } from '@/components/ui/toggle-pill';

type Tab = 'upcoming' | 'past';
type Event = RouterOutputs['event']['getAll'][number];

/**
 * The member dashboard's event feed — same flyer/description/date-and-place shape
 * as the marketing site's featured-event panel (components/pg/eventsidebar.tsx),
 * just laid out as a compact scrolling list instead of a full-width hero, and with
 * a Past tab so a member can look back at what they've already attended.
 */
export function EventShowcase() {
	const { data: events = [], isLoading } = trpc.event.getAll.useQuery();
	const [tab, setTab] = useState<Tab>('upcoming');

	const { upcoming, past } = useMemo(() => {
		const now = Date.now();
		const withTime = events.map((e) => ({ ...e, _t: new Date(e.startTimeRaw).getTime() }));
		return {
			upcoming: withTime
				.filter((e) => Number.isNaN(e._t) || e._t >= now)
				.sort((a, b) => a._t - b._t),
			past: withTime
				.filter((e) => !Number.isNaN(e._t) && e._t < now)
				.sort((a, b) => b._t - a._t),
		};
	}, [events]);

	const list = tab === 'upcoming' ? upcoming : past;

	return (
		<Card className="flex w-full flex-col gap-4 rounded-xl border border-border bg-ieee-dark-grey p-4 shadow-lg shadow-black/40 lg:p-6">
			<div className="flex items-center justify-between">
				<CardTitle className="font-subheading text-xl text-white">Events</CardTitle>
				<div className="flex gap-2">
					{(['upcoming', 'past'] as const).map((t) => (
						<TogglePill
							key={t}
							selected={tab === t}
							tone="brand"
							size="pill"
							onClick={() => setTab(t)}
						>
							{t === 'upcoming'
								? `Upcoming (${upcoming.length})`
								: `Past (${past.length})`}
						</TogglePill>
					))}
				</div>
			</div>

			<CardContent className="p-0">
				<ScrollArea className={list.length > 2 ? 'h-[420px] pr-3' : ''}>
					{isLoading ? (
						<p className="p-4 text-center text-sm text-muted-foreground">
							Loading events…
						</p>
					) : list.length === 0 ? (
						<p className="p-4 text-center text-sm text-muted-foreground">
							{tab === 'upcoming'
								? 'No upcoming events.'
								: "You haven't been to an event yet."}
						</p>
					) : (
						<div className="flex flex-col gap-3">
							{list.map((event) => (
								<EventRow key={event.id} event={event} past={tab === 'past'} />
							))}
						</div>
					)}
					<ScrollBar orientation="vertical" />
				</ScrollArea>
			</CardContent>
		</Card>
	);
}

function EventRow({ event, past }: { event: Event; past: boolean }) {
	return (
		<div
			className={cn(
				'flex gap-3 rounded-lg border border-border bg-card/60 p-3 transition-colors',
				past ? 'opacity-60' : 'hover:border-ieee-dark-yellow',
			)}
		>
			<div className="h-20 w-20 flex-none overflow-hidden rounded-md bg-secondary">
				{event.flyerUrl ? (
					<Image
						src={event.flyerUrl}
						alt=""
						width={80}
						height={80}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground-dim">
						<Ticket className="h-6 w-6" />
					</div>
				)}
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-start justify-between gap-2">
					<h3 className="truncate text-sm font-semibold text-foreground">
						{event.title}
					</h3>
					{event.label?.hex && (
						<span
							className="flex-none rounded px-1.5 py-0.5 text-[10px] font-medium"
							style={{
								backgroundColor: `${event.label.hex}2a`,
								color: event.label.hex,
							}}
						>
							{event.label.name}
						</span>
					)}
				</div>

				<p className="line-clamp-2 text-xs text-muted-foreground">{event.description}</p>

				<div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground-dim">
					<span className="flex items-center gap-1">
						<CalendarDays className="h-3.5 w-3.5" />
						{event.startTime}
					</span>
					<span className="flex items-center gap-1">
						<MapPin className="h-3.5 w-3.5" />
						{event.location}
					</span>
				</div>
			</div>
		</div>
	);
}
