'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Calendar } from '@/components/calendar';
import { trpc } from '@/lib/trpc/client';

// The countdown targets the next event categorised "GBM" in the Events system
// (/admin/events). This manual date is only the fallback shown before that
// event exists.
const GBM_LABEL_SLUG = 'gbm';
const STORAGE_KEY = 'ieee_ucf_gbm_date';
const DEFAULT_GBM_DATE = '2026-04-01T19:30:00-04:00'; // fallback only

function loadGBMDate(): string {
	if (typeof window === 'undefined') return DEFAULT_GBM_DATE;
	return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_GBM_DATE;
}

function saveGBMDate(iso: string) {
	localStorage.setItem(STORAGE_KEY, iso);
}

function pad(n: number) {
	return String(n).padStart(2, '0');
}

function calcTimeLeft(target: number) {
	const distance = target - Date.now();
	if (distance <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
	return {
		days: Math.floor(distance / (1000 * 60 * 60 * 24)),
		hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
		minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
		seconds: Math.floor((distance % (1000 * 60)) / 1000),
	};
}

function isoToInputValue(iso: string): string {
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const Timer: React.FC = () => {
	// Lazy init from localStorage — no stale-default flash on first render
	const [gbmDate, setGbmDate] = useState<string>(() => loadGBMDate());
	const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(new Date(loadGBMDate()).getTime()));
	const [isEditing, setIsEditing] = useState(false);
	const [inputValue, setInputValue] = useState(() => isoToInputValue(loadGBMDate()));
	const [saveMsg, setSaveMsg] = useState('');
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const { data: authStatus } = trpc.auth.getAuthStatus.useQuery();
	const isAdmin = authStatus?.isAdmin ?? false;

	// The next event categorised "GBM" in the Events system. When present it drives
	// the countdown; the manual localStorage date is the fallback.
	const { data: nextGbm } = trpc.event.next.useQuery({ labelSlug: GBM_LABEL_SLUG });
	const eventIso = nextGbm?.startTimeRaw ?? null;
	const targetIso = eventIso ?? gbmDate;

	// Countdown tick — re-runs whenever the effective target changes
	useEffect(() => {
		if (intervalRef.current) clearInterval(intervalRef.current);
		const target = new Date(targetIso).getTime();
		setTimeLeft(calcTimeLeft(target));
		intervalRef.current = setInterval(() => setTimeLeft(calcTimeLeft(target)), 1000);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [targetIso]);

	const handleSave = () => {
		if (!inputValue) return;
		const newIso = new Date(inputValue).toISOString();
		saveGBMDate(newIso);
		setGbmDate(newIso);
		setInputValue(isoToInputValue(newIso));
		setIsEditing(false);
		setSaveMsg('✓ Saved');
		setTimeout(() => setSaveMsg(''), 3000);
	};

	const handleCancel = () => {
		setInputValue(isoToInputValue(gbmDate));
		setIsEditing(false);
	};

	return (
		<div className="relative mx-auto h-fit w-full content-center overflow-hidden rounded-sm bg-transparent p-4 drop-shadow-none sm:p-10 lg:p-20">
			<Image
				src="/gbms/gbmgif.gif"
				alt="Photo"
				fill
				className="-z-10 rounded-sm object-cover object-center opacity-50"
				priority
			/>

			<div className="flex flex-col flex-wrap items-center justify-between gap-8 lg:flex-row">
				{/* ── Left: countdown ── */}
				<div className="flex w-full flex-col items-center justify-center py-4 text-center lg:w-1/2">
					<div className="w-full p-4">
						<h2 className="font-[subheading-font] text-4xl text-white">
							{nextGbm ? nextGbm.title.toUpperCase() : 'NEXT GENERAL BODY MEETING'}
						</h2>
						<p className="mt-2 font-[body-font] text-2xl text-white">
							{nextGbm
								? `Join IEEE @ UCF — ${nextGbm.location}`
								: 'Join IEEE @ UCF for the upcoming GBM in Room TBD!'}
						</p>

						{/* When a GBM event exists it drives the countdown; admins manage it in
						    the Events system. The manual date editor below is the fallback. */}
						{isAdmin && nextGbm && (
							<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
								<span className="font-[body-font] text-sm text-muted-foreground">
									{new Date(nextGbm.startTimeRaw ?? '').toLocaleString('en-US', {
										month: 'long',
										day: 'numeric',
										year: 'numeric',
										hour: 'numeric',
										minute: '2-digit',
										timeZoneName: 'short',
									})}
								</span>
								<Link
									href="/admin/events"
									className="rounded border border-ieee-bright-yellow px-3 py-1 font-[heading-font] text-xs text-ieee-bright-yellow transition-all hover:bg-ieee-bright-yellow hover:text-black"
								>
									MANAGE IN EVENTS
								</Link>
							</div>
						)}

						{isAdmin && !nextGbm && (
							<div className="mt-4">
								{!isEditing ? (
									<div className="flex flex-wrap items-center justify-center gap-3">
										<span className="font-[body-font] text-sm text-muted-foreground">
											{new Date(gbmDate).toLocaleString('en-US', {
												month: 'long',
												day: 'numeric',
												year: 'numeric',
												hour: 'numeric',
												minute: '2-digit',
												timeZoneName: 'short',
											})}
										</span>
										<button
											onClick={() => setIsEditing(true)}
											className="cursor-pointer rounded border border-ieee-bright-yellow px-3 py-1 font-[heading-font] text-xs text-ieee-bright-yellow transition-all hover:bg-ieee-bright-yellow hover:text-black"
										>
											EDIT DATE
										</button>
										{saveMsg && (
											<span className="font-[body-font] text-xs text-green-400">
												{saveMsg}
											</span>
										)}
									</div>
								) : (
									<div className="mt-2 flex flex-col items-center justify-center gap-2 sm:flex-row">
										<input
											type="datetime-local"
											value={inputValue}
											onChange={(e) => setInputValue(e.target.value)}
											className="rounded border border-white/30 bg-black px-3 py-2 font-[body-font] text-sm text-white focus:border-ieee-bright-yellow focus:outline-none"
										/>
										<div className="flex gap-2">
											<button
												onClick={handleSave}
												className="cursor-pointer rounded bg-ieee-bright-yellow px-3 py-2 font-[heading-font] text-xs text-black transition-all hover:opacity-90"
											>
												SAVE
											</button>
											<button
												onClick={handleCancel}
												className="cursor-pointer rounded border border-white/30 px-3 py-2 font-[heading-font] text-xs text-white transition-all hover:border-white"
											>
												CANCEL
											</button>
										</div>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Countdown digits — always shows numbers, freezes at 00 when past */}
					<div className="m-3 h-fit w-full rounded-sm border p-3 backdrop-blur-lg">
						<div className="flex flex-row items-center justify-around">
							{(
								[
									{ value: timeLeft.days, label: 'DAYS' },
									{ value: timeLeft.hours, label: 'HOURS' },
									{ value: timeLeft.minutes, label: 'MINUTES' },
									{ value: timeLeft.seconds, label: 'SECONDS' },
								] as const
							).map((unit, i, arr) => (
								<React.Fragment key={unit.label}>
									<div className="text-center text-white">
										<span className="font-[heading-font] text-5xl">
											{pad(unit.value)}
										</span>
										<br />
										<span className="font-[body-font] text-sm text-white">
											{unit.label}
										</span>
									</div>
									{i < arr.length - 1 && (
										<span className="font-[subheading-font] text-3xl text-white">
											:
										</span>
									)}
								</React.Fragment>
							))}
						</div>
					</div>
				</div>

				{/* ── Right: calendar ── */}
				<div className="w-full rounded-sm border border-white px-2 py-4 lg:w-5/12">
					<Calendar className="h-[350px] w-full opacity-87 sm:h-[400px] lg:h-[400px]" />
				</div>
			</div>
		</div>
	);
};

export { Timer };
