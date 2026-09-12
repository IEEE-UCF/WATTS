'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, CalendarIcon as Calendar1, X } from 'lucide-react';
import { Button } from '@watts/ui/button';
import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';

interface Event {
	eventName: string;
	eventDate: string;
	eventDesc: string;
	eventAddress: string;
	eventFlyer: string | null;
	_sortDate: number;
}

export default function EventSidebar() {
	const monthNames = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];
	const currentMonthName = monthNames[new Date().getMonth()];
	const [currentMonth] = useState(currentMonthName);
	const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
	const [showEventOnMobile, setShowEventOnMobile] = useState(false);
	const featuredRef = useRef<HTMLDivElement>(null);
	const [featuredHeight, setFeaturedHeight] = useState<number | null>(null);

	const now = new Date();

	const { data: rawEvents = [] } = trpc.event.getAll.useQuery();

	const eventData: Event[] = rawEvents
		.filter((e) => {
			const parsed = new Date(e.startTimeRaw);
			return !isNaN(parsed.getTime()) ? parsed > now : true;
		})
		.map((e) => ({
			eventName: e.title,
			eventDate: e.startTime,
			eventDesc: e.description,
			eventAddress: e.location,
			eventFlyer: e.flyerUrl ?? null,
			_sortDate: new Date(e.startTimeRaw).getTime(),
		}))
		.sort((a, b) => a._sortDate - b._sortDate);

	useEffect(() => {
		if (!currentEvent && eventData.length > 0) {
			setCurrentEvent(eventData[0]);
		}
	}, [eventData, currentEvent]);

	// Measure featured panel height after render
	useEffect(() => {
		if (!featuredRef.current) return;
		const observer = new ResizeObserver(() => {
			if (featuredRef.current) {
				setFeaturedHeight(featuredRef.current.offsetHeight);
			}
		});
		observer.observe(featuredRef.current);
		return () => observer.disconnect();
	}, [currentEvent]);

	const handleEventSelect = (event: Event) => {
		setCurrentEvent(event);
		setShowEventOnMobile(true);
	};

	const handleBackToSidebar = () => {
		setShowEventOnMobile(false);
	};

	return (
		<div className="">
			<div className="flex h-fit w-full flex-col items-center bg-black px-10">
				<div className="items-center place-self-center bg-black p-20 text-center lg:items-start lg:place-self-start lg:text-left">
					<div className="py-3 text-center font-[heading-font] text-4xl text-white lg:text-left lg:text-5xl">
						UPCOMING EVENTS
					</div>
					<div className="text-center font-[body-font] text-xl text-white lg:text-left lg:text-2xl">
						Experience IEEE @ UCF&rsquo;s exciting lineup of events this
						<span className="font-[subheading-font] text-ieee-bright-yellow">
							{' '}
							{currentMonth}{' '}
						</span>
						and beyond. Click on each event to learn more.
					</div>
				</div>
				<div className="flex h-fit w-full flex-row items-start justify-between">
					{/* Main event display */}
					<div
						ref={featuredRef}
						className={`w-3/4 lg:block ${showEventOnMobile ? 'hidden' : 'hidden lg:block'}`}
					>
						{currentEvent ? (
							<div className="group relative h-fit">
								<div className="absolute -inset-1 rounded-sm bg-gradient-to-r from-ieee-bright-yellow to-ieee-bright-yellow opacity-50 blur"></div>
								<div className="relative flex h-full items-start justify-start space-x-6 rounded-sm bg-[#0c0a09] leading-none ring-1 ring-gray-900/5">
									<div className="flex h-full w-[70vw] flex-row gap-x-10 rounded-sm p-10 xl:w-full">
										<Image
											className="h-screen w-[40vh] rounded-sm object-cover sm:w-[50vh]"
											src={currentEvent.eventFlyer ?? '/larry.png'}
											alt="Event Flyer"
											width={2000}
											height={2000}
										/>
										<div className="m-5 flex flex-col gap-y-3">
											<div className="text-3xl font-bold text-white">
												{currentEvent.eventName}
											</div>
											<div className="text-xl text-white">
												{currentEvent.eventDesc}
											</div>
											<div className="flex flex-col justify-between">
												<div className="flex flex-row gap-x-2 text-lg text-white">
													<Calendar1 />
													{currentEvent.eventDate}
												</div>
												<div className="flex flex-row gap-x-2 text-lg text-white">
													<MapPin />
													{currentEvent.eventAddress}
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						) : (
							<div className="flex h-64 flex-col items-center justify-center">
								<span className="text-white">No event selected.</span>
							</div>
						)}
					</div>

					{/* Mobile event detail */}
					{showEventOnMobile && currentEvent && (
						<div className="w-full lg:hidden">
							<div className="group relative h-fit">
								<Button
									onClick={handleBackToSidebar}
									className="absolute top-4 right-4 z-20 cursor-pointer bg-transparent text-white transition-transform hover:scale-150 hover:bg-transparent"
								>
									<X size={24} />
								</Button>
								<div className="absolute -inset-1 rounded-sm bg-gradient-to-r from-ieee-bright-yellow to-ieee-bright-yellow opacity-50 blur"></div>
								<div className="relative flex h-full items-start justify-start space-x-6 rounded-sm bg-[#0c0a09] leading-none ring-1 ring-gray-900/5">
									<div className="flex h-full flex-col gap-6 rounded-sm p-6 lg:flex-row lg:gap-x-10 lg:p-10">
										<Image
											className="mt-15 h-fit w-full rounded-sm object-cover lg:h-screen lg:w-[50vh]"
											src={currentEvent.eventFlyer ?? '/larry.png'}
											alt="Event Flyer"
											width={2000}
											height={2000}
										/>
										<div className="flex flex-col gap-y-3">
											<div className="text-2xl font-bold text-white lg:text-3xl">
												{currentEvent.eventName}
											</div>
											<div className="text-lg text-white lg:text-xl">
												{currentEvent.eventDesc}
											</div>
											<div className="flex flex-col justify-between gap-y-2">
												<div className="flex flex-row gap-x-2 text-base text-white lg:text-lg">
													<Calendar1 />
													{currentEvent.eventDate}
												</div>
												<div className="flex flex-row gap-x-2 text-base text-white lg:text-lg">
													<MapPin />
													{currentEvent.eventAddress}
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Sidebar list — height locked to featured panel, scrollable */}
					<div
						className={`flex flex-col overflow-y-auto p-6 ${showEventOnMobile ? 'hidden lg:flex' : 'w-full lg:w-auto'}`}
						style={
							featuredHeight ? { height: `${featuredHeight}px` } : { height: 'auto' }
						}
					>
						{eventData.map((item, idx) => (
							<div
								className="transition hover:z-100 hover:scale-102 hover:opacity-80"
								key={`${idx}-${item.eventName}`}
							>
								<div
									className="group relative w-full cursor-pointer overflow-hidden rounded-sm bg-transparent p-[3px] transition-transform hover:scale-102"
									onMouseEnter={(e) => {
										const el =
											e.currentTarget.querySelector<HTMLDivElement>(
												'.animated-border',
											);
										if (el) el.style.animationPlayState = 'running';
									}}
									onMouseLeave={(e) => {
										const el =
											e.currentTarget.querySelector<HTMLDivElement>(
												'.animated-border',
											);
										if (el) el.style.animationPlayState = 'paused';
									}}
								>
									<div
										className="animated-border pointer-events-none absolute inset-0 z-0 scale-95 animate-spin rounded-sm bg-[conic-gradient(var(--ieee-bright-yellow)_20deg,transparent_120deg)] opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
										style={{
											animationPlayState: 'paused',
											animationDuration: '6s',
										}}
									/>
									<button
										onClick={() => handleEventSelect(item)}
										className="relative z-10 flex w-full cursor-pointer flex-row rounded-sm bg-black text-white hover:text-ieee-bright-yellow"
									>
										<div className="m-5 flex flex-col justify-center">
											<div className="flex flex-col justify-between">
												<div className="text-left text-lg font-bold">
													{item.eventName}
												</div>
												<div className="flex gap-x-2 text-left text-base">
													{item.eventDate}
												</div>
												<div className="flex text-left text-base">
													{item.eventAddress}
												</div>
											</div>
										</div>
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
