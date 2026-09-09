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
		<Card className="w-full max-w-4xl mx-auto mt-8 rounded-xl bg-black shadow-sm shadow-[0_0_20px_rgba(250,204,21,0.5)] text-card-foreground flex flex-col p-6">
			<CardTitle className="text-2xl font-[subheading-font] -mb-2 text-white">Events</CardTitle>
			<CardContent>
				<div className="w-full max-w-4xl mx-auto">
					<div className="mb-3 flex gap-2">
						{(['upcoming', 'past'] as const).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={`rounded-md px-3 py-1 text-sm font-[body-font] capitalize transition-colors ${
									tab === t
										? 'bg-[var(--ieee-bright-yellow)] text-black'
										: 'border border-[var(--ieee-grey)] text-[var(--ieee-white)] hover:border-[var(--ieee-bright-yellow)]'
								}`}
							>
								{t} ({t === 'upcoming' ? upcoming.length : past.length})
							</button>
						))}
					</div>

					<ScrollArea
						className={`${list.length > 3 ? 'h-80' : ''} rounded-md border-[var(--ieee-grey)]`}
					>
						{isLoading ? (
							<p className="p-4 text-center text-[var(--ieee-white)]">Loading events...</p>
						) : list.length === 0 ? (
							<p className="p-4 text-center text-[var(--ieee-white)]">
								{tab === 'upcoming' ? 'No upcoming events.' : 'No past events.'}
							</p>
						) : (
							list.map((event) => (
								<Card
									key={event.id}
									className={`rounded-md border-[var(--ieee-grey)] mb-4 ${
										tab === 'past' ? 'opacity-70' : ''
									}`}
								>
									<div className="p-4">
										<h3 className="text-xl font-semibold text-white">{event.title}</h3>
										<p className="text-[var(--ieee-light-grey)]">{event.location}</p>
										<p className="text-gray-600">{event.startTime}</p>
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
