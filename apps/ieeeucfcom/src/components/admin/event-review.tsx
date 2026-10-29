'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import { adminEventPath, eventPath } from '@watts/core/event-path';
import { Button } from '@watts/ui/button';
import { Card } from '@watts/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@watts/ui/dialog';
import { EventAttendeesSheet } from './event-attendees-sheet';
import { EventPhotoManager } from './event-photo-manager';
import { QREventScanner } from './qr_event_scanner';

type Review = RouterOutputs['event']['reviewSummary'];
type Reminder = Review['reminders'][number];

const when = (value: string | number) =>
	new Date(value).toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<Card className="gap-4 rounded-xl border-border bg-card/60 p-5 shadow-lg shadow-black/40 lg:p-6">
			<h2 className="font-heading text-xs tracking-[0.14em] text-muted-foreground-dim uppercase">{title}</h2>
			{children}
		</Card>
	);
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
	return <span className={ok ? 'text-green-400' : 'text-amber-400'}>{ok ? '✓' : '○'} {children}</span>;
}

function reminderText(r: Reminder): string {
	switch (r.state) {
		case 'sent':
			return `sent ${when(r.at)}`;
		case 'skipped':
			return `skipped ${when(r.at)}${r.detail ? ` — ${r.detail}` : ''}`;
		case 'failed':
			return `failed ${when(r.at)}${r.detail ? ` — ${r.detail}` : ''}`;
		case 'scheduled':
			return `scheduled for ${when(r.at)}`;
		case 'due':
			return `due ${when(r.at)} — the bot sends it when it next plans`;
		case 'off':
			return 'off for this event';
		case 'not-global':
			return 'only for global, visible events';
	}
}

/**
 * Officer/admin review page for one event (/admin/events/<number>): wrap-up checklist,
 * photo upload and check-in scanner already set to this event, and the state of its
 * Discord reminders. The bot's reminders link here.
 */
export function EventReview({ eventRef }: { eventRef: { id: string } | { number: number } }) {
	const { data, isLoading, error } = trpc.event.reviewSummary.useQuery(eventRef, {
		// A wrong number in the address won't appear on retry.
		retry: (count, err) => err.data?.code !== 'NOT_FOUND' && count < 2,
	});
	const [scannerOpen, setScannerOpen] = useState(false);
	const [attendeesOpen, setAttendeesOpen] = useState(false);
	const utils = trpc.useUtils();

	// Reached by id (an older link)? Show the short /admin/events/<number> address instead.
	const canonical = data ? adminEventPath(data.event) : null;
	useEffect(() => {
		if (canonical && window.location.pathname !== canonical) window.history.replaceState(null, '', canonical);
	}, [canonical]);

	if (isLoading) return <p className="text-muted-foreground">Loading event…</p>;
	if (error || !data) return <p className="text-red-400">{error?.message ?? 'Event not found.'}</p>;

	const { event, counts, reminders, can } = data;
	const ended = Date.now() > Date.parse(event.endTime ?? event.startTime);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-xs text-muted-foreground">
						<Link href="/admin/events" className="hover:underline">
							← Event management
						</Link>
					</p>
					<h1 className="mt-1 font-heading text-3xl text-ieee-dark-yellow">{event.title}</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{when(event.startTime)} · {event.location}
						{event.isGlobal && ' · Global'}
						{!event.active && ' · Archived'}
						{event.hidden && ' · Hidden'}
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline" size="sm">
						<Link href={`/admin/events?event=${event.id}`}>Edit event</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<a href={eventPath(event)} target="_blank" rel="noreferrer">
							Public page ↗
						</a>
					</Button>
				</div>
			</div>

			<Section title={ended ? 'Wrap-up checklist' : 'Checklist'}>
				<div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
					<Check ok={counts.attendeeCount > 0}>
						{counts.attendeeCount > 0 ? `${counts.attendeeCount} checked in` : 'no check-ins yet'}
					</Check>
					<Check ok={counts.photoCount > 0}>
						{counts.photoCount > 0
							? `${counts.photoCount} photo${counts.photoCount === 1 ? '' : 's'}`
							: 'no photos yet'}
					</Check>
				</div>
			</Section>

			{can.scanAttendance && (
				<Section title="🎟️ Check-ins">
					<div className="flex flex-wrap items-center gap-3">
						<Button size="sm" onClick={() => setScannerOpen(true)}>
							Open check-in scanner
						</Button>
						<Button variant="outline" size="sm" onClick={() => setAttendeesOpen(true)}>
							View attendees ({counts.attendeeCount})
						</Button>
					</div>
				</Section>
			)}

			{can.managePhotos && (
				<Section title="📸 Photos">
					<EventPhotoManager initialEventId={event.id} lockEvent />
				</Section>
			)}

			<Section title="Discord reminders">
				<ul className="flex flex-col gap-2 text-sm">
					{reminders.map((r) => (
						<li key={r.kind} className="flex flex-wrap justify-between gap-2">
							<span className="text-foreground">{r.label}</span>
							<span className="text-muted-foreground">{reminderText(r)}</span>
						</li>
					))}
				</ul>
				<p className="text-xs text-muted-foreground-dim">
					Change these under <span className="text-foreground">Discord reminders</span> when editing
					the event.
				</p>
			</Section>

			<Dialog
				open={scannerOpen}
				onOpenChange={(open) => {
					setScannerOpen(open);
					// Refresh the counts once the door closes.
					if (!open) void utils.event.reviewSummary.invalidate(eventRef);
				}}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Check-in: {event.title}</DialogTitle>
						<DialogDescription>Scans are recorded for this event only.</DialogDescription>
					</DialogHeader>
					{scannerOpen && <QREventScanner lockedEventId={event.id} />}
				</DialogContent>
			</Dialog>

			<EventAttendeesSheet eventId={attendeesOpen ? event.id : null} onClose={() => setAttendeesOpen(false)} />
		</div>
	);
}
