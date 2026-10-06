import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { eventPath, type EventSummary } from '@watts/core/event-page';
import { dateBlock, shortDate, timeRange } from '@/lib/event-dates';

/** Wraps an event in a link to its page. */
function EventLink({
	event,
	className,
	children,
}: {
	event: EventSummary;
	className: string;
	children: ReactNode;
}) {
	return (
		<Link href={eventPath(event)} className={`group ${className}`}>
			{children}
		</Link>
	);
}

/** Dated rows: big date block, title, time and place, "Details →". For upcoming lists. */
export function EventRows({ events }: { events: EventSummary[] }) {
	return (
		<ul className="flex flex-col border-t border-ieee-dark-grey">
			{events.map((e) => {
				const d = dateBlock(e);
				return (
					<li key={e.id} className="border-b border-ieee-dark-grey">
						<EventLink
							event={e}
							className="flex items-center gap-5 py-5 text-white md:gap-8"
						>
							<div className="flex w-14 shrink-0 flex-col items-center md:w-18">
								<span className="font-subheading text-xs tracking-[0.14em] text-ieee-bright-yellow">
									{d.month}
								</span>
								<span className="font-display text-3xl leading-none md:text-4xl">
									{d.day}
								</span>
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="font-heading text-lg group-hover:text-ieee-bright-yellow md:text-xl">
									{e.title}
								</span>
								<span className="truncate font-body text-sm text-ieee-light-grey md:text-base">
									{timeRange(e)} · {e.location}
								</span>
							</div>
							<span className="hidden shrink-0 font-heading text-sm text-ieee-bright-yellow sm:block">
								Details →
							</span>
						</EventLink>
					</li>
				);
			})}
		</ul>
	);
}

/** Flyer cards, three across. `showAttendance` adds "N attended" to past events. */
export function EventCards({
	events,
	showAttendance = false,
}: {
	events: EventSummary[];
	showAttendance?: boolean;
}) {
	return (
		<ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{events.map((e) => (
				<li key={e.id}>
					<EventLink
						event={e}
						className="flex h-full flex-col overflow-hidden rounded-sm border border-ieee-dark-grey bg-ieee-near-black text-white transition-colors hover:border-ieee-bright-yellow"
					>
						<div className="relative aspect-[16/10] w-full bg-ieee-dark-grey">
							{e.flyerUrl ? (
								<Image
									src={e.flyerUrl}
									alt=""
									fill
									sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
									className="object-cover"
								/>
							) : (
								<div className="flex h-full items-center justify-center font-display text-3xl text-ieee-grey">
									IEEE
								</div>
							)}
						</div>
						<div className="flex flex-col gap-1.5 px-5 py-4">
							<span className="font-subheading text-xs tracking-[0.14em] text-ieee-bright-yellow uppercase">
								{shortDate(e)}
								{e.label ? ` · ${e.label.name}` : ''}
							</span>
							<span className="font-heading text-lg leading-snug">{e.title}</span>
							<span className="font-body text-sm text-ieee-light-grey">
								{showAttendance && e.attendanceCount
									? `${e.attendanceCount} attended`
									: e.location}
							</span>
						</div>
					</EventLink>
				</li>
			))}
		</ul>
	);
}
