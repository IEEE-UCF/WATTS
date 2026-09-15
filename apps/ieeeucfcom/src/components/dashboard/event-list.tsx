'use client';
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardTitle } from '@watts/ui/card';
import { ScrollArea, ScrollBar } from '@watts/ui/scroll-area';
import { trpc } from '@/lib/trpc/client';

type Tab = 'upcoming' | 'past';

export const EventList = () => {
	const { data: events = [], isLoading } = trpc.event.getAll.useQuery();
	const [tab, setTab] = useState<Tab>('upcoming');

	// event.getAll already excludes hidden events; split the rest by start time.
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
		<Card className="mx-auto mt-8 flex w-full max-w-4xl flex-col rounded-xl bg-black p-6 text-card-foreground shadow-[0_0_20px_rgba(250,204,21,0.5)] shadow-sm">
			<CardTitle className="-mb-2 font-subheading text-2xl text-white">Events</CardTitle>
			<CardContent>
				<div className="mx-auto w-full max-w-4xl">
					<div className="mb-3 flex gap-2">
						{(['upcoming', 'past'] as const).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={`rounded-md px-3 py-1 font-body text-sm capitalize transition-colors ${
									tab === t
										? 'bg-ieee-bright-yellow text-black'
										: 'border border-ieee-grey text-ieee-white hover:border-ieee-bright-yellow'
								}`}
							>
								{t} ({t === 'upcoming' ? upcoming.length : past.length})
							</button>
						))}
					</div>

					<ScrollArea
						className={`${list.length > 3 ? 'h-80' : ''} rounded-md border-ieee-grey`}
					>
						{isLoading ? (
							<p className="p-4 text-center text-ieee-white">Loading events...</p>
						) : list.length === 0 ? (
							<p className="p-4 text-center text-ieee-white">
								{tab === 'upcoming' ? 'No upcoming events.' : 'No past events.'}
							</p>
						) : (
							list.map((event) => (
								<Card
									key={event.id}
									className={`mb-4 rounded-md border-ieee-grey ${
										tab === 'past' ? 'opacity-70' : ''
									}`}
								>
									<div className="p-4">
										<h3 className="text-xl font-semibold text-white">
											{event.title}
										</h3>
										<p className="text-ieee-light-grey">{event.location}</p>
										<p className="text-muted-foreground-dim">
											{event.startTime}
										</p>
									</div>
								</Card>
							))
						)}
						<ScrollBar orientation="vertical" />
					</ScrollArea>
				</div>
			</CardContent>
		</Card>
	);
};
