'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageUp, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import { eventPath } from '@watts/core/event-path';
import { uploadEventFlyer } from '@watts/storage/client';
import { EventAttendeesSheet } from './event-attendees-sheet';
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	TableEmpty,
} from '@watts/ui/table';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@watts/ui/dialog';

type AdminEvent = RouterOutputs['event']['getAllForAdmin'][number];
type Label = RouterOutputs['eventLabel']['list'][number];

const GOOGLE_COLOR_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] as const;

const SYNC_BADGE: Record<string, string> = {
	synced: 'bg-green-900/70 text-green-300',
	pending: 'bg-secondary text-muted-foreground',
	error: 'bg-red-900/70 text-red-300',
	skipped: 'bg-secondary text-muted-foreground',
};

const COMMON_TZ = [
	'America/New_York',
	'America/Chicago',
	'America/Denver',
	'America/Los_Angeles',
	'UTC',
];

const ROOM_RESERVATION_STATUSES = [
	'none',
	'unsubmitted',
	'pending',
	'confirmed',
	'rejected',
] as const;
type RoomReservationStatus = (typeof ROOM_RESERVATION_STATUSES)[number];
const ROOM_RESERVATION_LABELS: Record<RoomReservationStatus, string> = {
	none: 'Not needed',
	unsubmitted: 'Unsubmitted',
	pending: 'Pending',
	confirmed: 'Confirmed',
	rejected: 'Rejected',
};

const FLYER_ACCEPT = 'image/jpeg,image/png,image/webp';
/** An upcoming event with no flyer this close to its start gets the loud "missing" badge. */
const FLYER_URGENT_DAYS = 7;

/** Upload to storage, then record it on the event — shared by the form and the table row. */
function useFlyerUpload() {
	const confirmFlyer = trpc.event.confirmFlyer.useMutation();
	return async (eventId: string, file: File) => {
		await uploadEventFlyer(eventId, file);
		await confirmFlyer.mutateAsync({ eventId, filename: file.name });
	};
}

/** What the form reports back after a save, so the page can nag about a missing flyer. */
interface SavedEvent {
	title: string;
	hasFlyer: boolean;
	flyerError?: string;
}

/** Postgres wire string ("2026-09-30 18:00:00+00") → Date; Safari rejects the raw form. */
function parseWire(raw: string): Date {
	return new Date(raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}

/** Postgres wire string → value for a <input type="datetime-local"> in the browser's local tz. */
function toLocalInput(raw: string | null | undefined): string {
	if (!raw) return '';
	const d = parseWire(raw);
	if (Number.isNaN(d.getTime())) return '';
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ─────────────────────────── flyer drop zone ───────────────────────────

/**
 * Big poster-shaped click-or-drop target. Shows the picked file (or the event's current
 * flyer) so officers can read dates/rooms off it while filling in the rest of the form.
 */
function FlyerDrop({
	file,
	currentUrl,
	onPick,
}: {
	file: File | null;
	currentUrl: string | null;
	onPick: (file: File | null) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [rejected, setRejected] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) {
			setPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(file);
		setPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	function take(f: File | undefined) {
		if (!f) return;
		const ok = FLYER_ACCEPT.split(',').includes(f.type);
		setRejected(!ok);
		if (ok) onPick(f);
	}

	const shown = previewUrl ?? currentUrl;

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">
				Flyer{' '}
				{currentUrl && !file ? '(click or drop to replace)' : '(click or drop to upload)'}
			</span>
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					take(e.dataTransfer.files?.[0]);
				}}
				className={`group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors md:aspect-[4/5] ${
					dragging
						? 'border-ieee-dark-yellow bg-ieee-dark-yellow/10'
						: shown
							? 'border-border bg-black/40 hover:border-ieee-dark-yellow'
							: 'border-ieee-dark-yellow/60 bg-ieee-dark-yellow/5 hover:border-ieee-dark-yellow hover:bg-ieee-dark-yellow/10'
				}`}
			>
				{shown ? (
					<>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={shown}
							alt="Flyer preview"
							className="h-full w-full object-contain"
						/>
						<span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/70 py-2 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
							<RefreshCw className="size-3.5" /> Replace flyer
						</span>
					</>
				) : (
					<span className="flex flex-col items-center gap-3 px-4 text-center">
						<span className="flex size-14 items-center justify-center rounded-full bg-ieee-dark-yellow text-black">
							<ImageUp className="size-7" />
						</span>
						<span className="text-sm font-semibold text-foreground">Upload flyer</span>
						<span className="text-xs text-muted-foreground">
							Click to browse or drag an image here
							<br />
							JPG, PNG or WebP
						</span>
					</span>
				)}
			</button>
			<input
				ref={inputRef}
				id="flyer"
				type="file"
				accept={FLYER_ACCEPT}
				className="hidden"
				onChange={(e) => {
					take(e.target.files?.[0]);
					e.target.value = '';
				}}
			/>
			{file && (
				<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
					<span className="truncate" title={file.name}>
						{file.name}
					</span>
					<button
						type="button"
						onClick={() => onPick(null)}
						className="shrink-0 text-red-400 hover:underline"
					>
						remove
					</button>
				</div>
			)}
			{rejected && (
				<p className="text-xs text-red-400">That file type isn&apos;t supported.</p>
			)}
			{!currentUrl && !file && (
				<p className="text-xs text-amber-400">
					No flyer yet — you can add one later, but don&apos;t forget.
				</p>
			)}
		</div>
	);
}

// ─────────────────────────── event create / edit form ───────────────────────────

interface FormState {
	title: string;
	location: string;
	description: string;
	startTime: string;
	endTime: string;
	labelId: string;
	timeZone: string;
	isGlobal: boolean;
	hidden: boolean;
	allDay: boolean;
	requiresDues: boolean;
	rsvpLink: string;
	roomReservationStatus: RoomReservationStatus;
	roomReservationRoom: string;
	roomReservationNumber: string;
	pingCreatorOnUpdate: boolean;
}

function emptyForm(): FormState {
	return {
		title: '',
		location: '',
		description: '',
		startTime: '',
		endTime: '',
		labelId: '',
		timeZone: 'America/New_York',
		isGlobal: false,
		hidden: false,
		allDay: false,
		requiresDues: false,
		rsvpLink: '',
		roomReservationStatus: 'none',
		roomReservationRoom: '',
		roomReservationNumber: '',
		pingCreatorOnUpdate: false,
	};
}

function fromEvent(ev: AdminEvent): FormState {
	return {
		title: ev.title,
		location: ev.location,
		description: ev.description,
		startTime: toLocalInput(ev.startTimeRaw),
		endTime: toLocalInput(ev.endTimeRaw),
		labelId: ev.labelId ?? '',
		timeZone: ev.timeZone ?? 'America/New_York',
		isGlobal: ev.isGlobal,
		hidden: ev.hidden,
		allDay: ev.allDay,
		requiresDues: ev.requiresDues,
		rsvpLink: ev.rsvpLink ?? '',
		roomReservationStatus: (ev.roomReservation?.status ?? 'none') as RoomReservationStatus,
		roomReservationRoom: ev.roomReservation?.room ?? '',
		roomReservationNumber: ev.roomReservation?.reservationNumber ?? '',
		pingCreatorOnUpdate: ev.pingCreatorOnUpdate ?? false,
	};
}

function EventForm({
	labels,
	editing,
	onDone,
}: {
	labels: Label[];
	editing: AdminEvent | null;
	onDone: (saved?: SavedEvent) => void;
}) {
	const [form, setForm] = useState<FormState>(editing ? fromEvent(editing) : emptyForm());
	const [flyerFile, setFlyerFile] = useState<File | null>(null);
	const [uploadingFlyer, setUploadingFlyer] = useState(false);
	const utils = trpc.useUtils();
	const uploadFlyer = useFlyerUpload();

	const invalidate = () => {
		void utils.event.getAllForAdmin.invalidate();
		void utils.event.getAll.invalidate();
	};

	const create = trpc.event.create.useMutation();
	const update = trpc.event.update.useMutation();
	const pending = create.isPending || update.isPending || uploadingFlyer;
	const error = create.error?.message ?? update.error?.message ?? null;

	function set<K extends keyof FormState>(key: K, value: FormState[K]) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		const payload = {
			title: form.title,
			location: form.location,
			description: form.description,
			startTime: new Date(form.startTime).toISOString(),
			endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
			labelId: form.labelId || null,
			timeZone: form.timeZone,
			isGlobal: form.isGlobal,
			hidden: form.hidden,
			allDay: form.allDay,
			requiresDues: form.requiresDues,
			rsvpLink: form.rsvpLink || undefined,
			roomReservationStatus: form.roomReservationStatus,
			roomReservationRoom:
				form.roomReservationStatus === 'none'
					? undefined
					: form.roomReservationRoom || undefined,
			roomReservationNumber:
				form.roomReservationStatus === 'none'
					? undefined
					: form.roomReservationNumber || undefined,
			pingCreatorOnUpdate: form.pingCreatorOnUpdate,
		};
		let eventId: string | undefined;
		try {
			if (editing) {
				await update.mutateAsync({ id: editing.id, data: payload });
				eventId = editing.id;
			} else {
				eventId = (await create.mutateAsync(payload))?.event.id;
			}
		} catch {
			return; // shown via create.error / update.error
		}

		// The event exists now, so the flyer has an id to attach to.
		const saved: SavedEvent = { title: form.title, hasFlyer: Boolean(editing?.flyerUrl) };
		if (flyerFile && eventId) {
			setUploadingFlyer(true);
			try {
				await uploadFlyer(eventId, flyerFile);
				saved.hasFlyer = true;
			} catch (err) {
				saved.flyerError = err instanceof Error ? err.message : 'Flyer upload failed';
			} finally {
				setUploadingFlyer(false);
			}
		}
		invalidate();
		onDone(saved);
	}

	const field = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground';

	return (
		<DialogContent
			className="gap-0 overflow-hidden p-0 sm:max-w-4xl"
			// A stray click outside shouldn't throw away a half-filled form.
			onInteractOutside={(e) => e.preventDefault()}
			onEscapeKeyDown={(e) => pending && e.preventDefault()}
		>
			<DialogHeader className="border-b border-border px-6 py-4">
				<DialogTitle>{editing ? `Edit “${editing.title}”` : 'New event'}</DialogTitle>
				<DialogDescription>
					{editing
						? 'Changes sync to Google Calendar (and Discord, if global) on save.'
						: 'Mirrors to the chapter Google Calendar once created.'}
				</DialogDescription>
			</DialogHeader>

			<form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
				<div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[240px_1fr]">
					<div className="md:sticky md:top-0 md:self-start">
						<FlyerDrop
							file={flyerFile}
							currentUrl={editing?.flyerUrl ?? null}
							onPick={setFlyerFile}
						/>
					</div>

					<div className="min-w-0 space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Title
								</span>
								<input
									id="title"
									required
									value={form.title}
									onChange={(e) => set('title', e.target.value)}
									className={field}
								/>
							</label>
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Location
								</span>
								<input
									id="location"
									required
									value={form.location}
									onChange={(e) => set('location', e.target.value)}
									className={field}
								/>
							</label>
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Start
								</span>
								<input
									id="startTime"
									type="datetime-local"
									required
									value={form.startTime}
									onChange={(e) => set('startTime', e.target.value)}
									className={field}
								/>
							</label>
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									End
								</span>
								<input
									id="endTime"
									type="datetime-local"
									value={form.endTime}
									onChange={(e) => set('endTime', e.target.value)}
									className={field}
								/>
							</label>
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Category
								</span>
								<select
									id="labelId"
									value={form.labelId}
									onChange={(e) => set('labelId', e.target.value)}
									className={field}
								>
									<option value="">— none —</option>
									{labels
										.filter((l) => l.active || l.id === form.labelId)
										.map((l) => (
											<option key={l.id} value={l.id}>
												{l.name}
											</option>
										))}
								</select>
							</label>
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Time zone
								</span>
								<select
									id="timeZone"
									value={form.timeZone}
									onChange={(e) => set('timeZone', e.target.value)}
									className={field}
								>
									{COMMON_TZ.map((tz) => (
										<option key={tz} value={tz}>
											{tz}
										</option>
									))}
								</select>
							</label>
						</div>

						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">
								Description
							</span>
							<textarea
								id="description"
								required
								rows={3}
								value={form.description}
								onChange={(e) => set('description', e.target.value)}
								className={field}
							/>
						</label>

						<div className="grid gap-4 sm:grid-cols-2">
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									RSVP link (optional)
								</span>
								<input
									id="rsvpLink"
									value={form.rsvpLink}
									onChange={(e) => set('rsvpLink', e.target.value)}
									className={field}
								/>
							</label>
							<div className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Public page
								</span>
								<p className="py-2 text-sm text-muted-foreground">
									{editing ? (
										<a
											href={eventPath(editing)}
											target="_blank"
											rel="noreferrer"
											className="text-blue-400 hover:underline"
										>
											ieeeucf.com{eventPath(editing)}
										</a>
									) : (
										'Made from the title once saved.'
									)}{' '}
									The name part follows the title; old links keep working.
								</p>
							</div>
						</div>

						<div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
							<label className="flex items-center gap-2">
								<input
									id="isGlobal"
									type="checkbox"
									checked={form.isGlobal}
									onChange={(e) => set('isGlobal', e.target.checked)}
								/>
								Global (also post to Discord)
							</label>
							<label className="flex items-center gap-2">
								<input
									id="hidden"
									type="checkbox"
									checked={form.hidden}
									onChange={(e) => set('hidden', e.target.checked)}
								/>
								Hidden (keep in the calendar, hide from the events feed)
							</label>
							<label className="flex items-center gap-2">
								<input
									id="allDay"
									type="checkbox"
									checked={form.allDay}
									onChange={(e) => set('allDay', e.target.checked)}
								/>
								All-day
							</label>
							<label className="flex items-center gap-2">
								<input
									id="pingCreatorOnUpdate"
									type="checkbox"
									checked={form.pingCreatorOnUpdate}
									onChange={(e) => set('pingCreatorOnUpdate', e.target.checked)}
								/>
								Ping Creator on Discord for updates
							</label>
							<label className="flex items-center gap-2">
								<input
									id="requiresDues"
									type="checkbox"
									checked={form.requiresDues}
									onChange={(e) => set('requiresDues', e.target.checked)}
								/>
								Requires dues
							</label>
						</div>

						<div className="grid gap-4 sm:grid-cols-3">
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									SU Room Reservation
								</span>
								<select
									id="roomReservationStatus"
									value={form.roomReservationStatus}
									onChange={(e) =>
										set(
											'roomReservationStatus',
											e.target.value as RoomReservationStatus,
										)
									}
									className={field}
								>
									{ROOM_RESERVATION_STATUSES.map((s) => (
										<option key={s} value={s}>
											{ROOM_RESERVATION_LABELS[s]}
										</option>
									))}
								</select>
							</label>
							{form.roomReservationStatus !== 'none' && (
								<>
									<label className="block">
										<span className="mb-1 block text-xs text-muted-foreground">
											Room (optional)
										</span>
										<input
											id="roomReservationRoom"
											value={form.roomReservationRoom}
											onChange={(e) =>
												set('roomReservationRoom', e.target.value)
											}
											className={field}
										/>
									</label>
									<label className="block">
										<span className="mb-1 block text-xs text-muted-foreground">
											Reservation # (optional)
										</span>
										<input
											id="roomReservationNumber"
											value={form.roomReservationNumber}
											onChange={(e) =>
												set('roomReservationNumber', e.target.value)
											}
											className={field}
										/>
									</label>
								</>
							)}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-4">
					{error && <p className="mr-auto text-sm text-red-400">{error}</p>}
					<button
						type="button"
						disabled={pending}
						onClick={() => onDone()}
						className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={pending}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
					>
						{uploadingFlyer
							? 'Uploading flyer…'
							: pending
								? 'Saving…'
								: editing
									? 'Save changes'
									: 'Create event'}
					</button>
				</div>
			</form>
		</DialogContent>
	);
}

// ─────────────────────────── label manager ───────────────────────────

function LabelBar({ labels }: { labels: Label[] }) {
	const utils = trpc.useUtils();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const [slug, setSlug] = useState('');
	const [colorId, setColorId] = useState('1');

	const invalidate = () => void utils.eventLabel.list.invalidate();
	const create = trpc.eventLabel.create.useMutation({
		onSuccess: () => {
			invalidate();
			setName('');
			setSlug('');
		},
	});
	const setActive = trpc.eventLabel.setActive.useMutation({ onSuccess: invalidate });
	const pull = trpc.eventLabel.pullFromGoogle.useMutation({
		onSuccess: (r) => {
			invalidate();
			alert(
				`Linked ${r.matched.length} label(s) to Google` +
					(r.unmatchedNative.length
						? `. No local match for: ${r.unmatchedNative.join(', ')}`
						: '.'),
			);
		},
	});

	return (
		<div className="mb-6 rounded-lg border border-border bg-card/40 p-4">
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="text-sm font-semibold text-muted-foreground"
				>
					Categories ({labels.filter((l) => l.active).length}) {open ? '▾' : '▸'}
				</button>
				{open && (
					<button
						type="button"
						disabled={pull.isPending}
						onClick={() => pull.mutate()}
						className="rounded border border-input px-2 py-1 text-xs text-muted-foreground disabled:opacity-50"
					>
						{pull.isPending ? 'Pulling…' : 'Pull colours from Google'}
					</button>
				)}
			</div>

			{open && (
				<div className="mt-3 space-y-3">
					<div className="flex flex-wrap gap-2">
						{labels.map((l) => (
							<span
								key={l.id}
								title={
									l.googleLabelId
										? 'Linked to a Google event label'
										: 'Not linked to Google'
								}
								className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
									l.active
										? 'border-input text-foreground'
										: 'border-border text-muted-foreground-dim line-through'
								}`}
							>
								<span
									className="h-3 w-3 rounded-full"
									style={{ backgroundColor: l.hex ?? '#888' }}
								/>
								{l.name}
								{l.googleLabelId && (
									<span className="text-[10px] text-green-400">G</span>
								)}
								<button
									type="button"
									onClick={() =>
										setActive.mutate({ id: l.id, active: !l.active })
									}
									className="text-muted-foreground-dim hover:text-muted-foreground"
								>
									{l.active ? '×' : '↺'}
								</button>
							</span>
						))}
					</div>

					<form
						onSubmit={(e) => {
							e.preventDefault();
							create.mutate({ name, slug, colorId: colorId as never });
						}}
						className="flex flex-wrap items-end gap-2 text-xs"
					>
						<input
							placeholder="Name"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="rounded border border-input bg-card px-2 py-1"
						/>
						<input
							placeholder="slug"
							required
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							className="rounded border border-input bg-card px-2 py-1"
						/>
						<select
							value={colorId}
							onChange={(e) => setColorId(e.target.value)}
							className="rounded border border-input bg-card px-2 py-1"
						>
							{GOOGLE_COLOR_IDS.map((c) => (
								<option key={c} value={c}>
									color {c}
								</option>
							))}
						</select>
						<button
							type="submit"
							disabled={create.isPending}
							className="rounded bg-secondary px-3 py-1 text-foreground disabled:opacity-50"
						>
							Add
						</button>
						{create.error && (
							<span className="text-red-400">{create.error.message}</span>
						)}
					</form>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────── main ───────────────────────────

type ImportPreview = RouterOutputs['event']['importFromGoogle'];
interface PendingDelete {
	ev: AdminEvent;
	mode: 'archive' | 'purge';
}

export function EventManager() {
	const utils = trpc.useUtils();
	const { data: events, isLoading } = trpc.event.getAllForAdmin.useQuery();
	const { data: labels } = trpc.eventLabel.list.useQuery();

	const [showForm, setShowForm] = useState(false);
	const [editing, setEditing] = useState<AdminEvent | null>(null);
	// Bumped on every open so the form remounts with fresh values, while the dialog
	// itself stays mounted long enough to play its close animation.
	const [formKey, setFormKey] = useState(0);
	const [attendeesFor, setAttendeesFor] = useState<string | null>(null);
	const [showArchived, setShowArchived] = useState(false);
	const [showPast, setShowPast] = useState(false);
	const [flyerBusy, setFlyerBusy] = useState<string | null>(null);
	const flyerRef = useRef<HTMLInputElement>(null);
	const flyerTarget = useRef<string | null>(null);

	// In-app confirmation + status — no window.confirm/alert (browsers can suppress
	// those after repeated dialogs, which silently swallows the action).
	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
	const [purgeText, setPurgeText] = useState('');
	const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
	const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
		null,
	);

	const invalidate = () => {
		void utils.event.getAllForAdmin.invalidate();
		void utils.event.getAll.invalidate();
	};

	const del = trpc.event.delete.useMutation();
	const hardDel = trpc.event.hardDelete.useMutation();
	const restore = trpc.event.restore.useMutation({
		onSuccess: () => {
			invalidate();
			setBanner({ kind: 'ok', text: 'Event restored and re-published to Google Calendar.' });
		},
		onError: (e) => setBanner({ kind: 'err', text: e.message }),
	});
	const setHidden = trpc.event.update.useMutation({ onSuccess: invalidate });
	const resync = trpc.event.resync.useMutation({ onSuccess: invalidate });
	const uploadFlyer = useFlyerUpload();
	const importGoogle = trpc.event.importFromGoogle.useMutation();
	const deleteBusy = del.isPending || hardDel.isPending;

	async function confirmDelete() {
		if (!pendingDelete) return;
		const { ev, mode } = pendingDelete;
		try {
			if (mode === 'archive') {
				await del.mutateAsync({ id: ev.id });
				setBanner({ kind: 'ok', text: `Archived “${ev.title}”.` });
			} else {
				await hardDel.mutateAsync({ id: ev.id });
				setBanner({ kind: 'ok', text: `Permanently deleted “${ev.title}”.` });
			}
			invalidate();
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' });
		} finally {
			setPendingDelete(null);
			setPurgeText('');
		}
	}

	async function previewImport() {
		setBanner(null);
		try {
			const preview = await importGoogle.mutateAsync({ dryRun: true });
			if (!preview.enabled) {
				setBanner({
					kind: 'err',
					text: 'Google Calendar is not connected (no service-account credentials).',
				});
				return;
			}
			if (preview.imported === 0) {
				setBanner({
					kind: 'ok',
					text: `Nothing new to import — ${preview.skipped} calendar event(s) already linked.`,
				});
				return;
			}
			setImportPreview(preview);
		} catch (err) {
			setBanner({
				kind: 'err',
				text: err instanceof Error ? err.message : 'Import preview failed',
			});
		}
	}

	async function commitImport() {
		try {
			const done = await importGoogle.mutateAsync({});
			invalidate();
			setBanner({
				kind: 'ok',
				text: `Imported ${done.imported}, updated ${done.updated}, skipped ${done.skipped}.`,
			});
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Import failed' });
		} finally {
			setImportPreview(null);
		}
	}

	const sorted = useMemo(
		() => (events ?? []).slice().sort((a, b) => (a.startTimeRaw < b.startTimeRaw ? 1 : -1)),
		[events],
	);
	const archivedCount = useMemo(() => sorted.filter((e) => !e.active).length, [sorted]);
	const pastCount = useMemo(
		() => sorted.filter((e) => new Date(e.endTimeRaw ?? e.startTimeRaw) < new Date()).length,
		[sorted],
	);
	const visible = sorted
		.filter((e) => showArchived || e.active)
		.filter((e) => showPast || new Date(e.endTimeRaw ?? e.startTimeRaw) >= new Date());

	function openCreate() {
		setEditing(null);
		setFormKey((k) => k + 1);
		setShowForm(true);
	}
	function openEdit(ev: AdminEvent) {
		setEditing(ev);
		setFormKey((k) => k + 1);
		setShowForm(true);
	}

	function pickFlyer(eventId: string) {
		flyerTarget.current = eventId;
		flyerRef.current?.click();
	}

	async function onFlyerFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		const eventId = flyerTarget.current;
		if (!file || !eventId) return;
		setFlyerBusy(eventId);
		try {
			await uploadFlyer(eventId, file);
			invalidate();
			setBanner({ kind: 'ok', text: 'Flyer uploaded.' });
		} catch (err) {
			setBanner({
				kind: 'err',
				text: err instanceof Error ? err.message : 'Flyer upload failed',
			});
		} finally {
			setFlyerBusy(null);
		}
	}

	function onFormDone(saved?: SavedEvent) {
		setShowForm(false);
		if (!saved) return;
		if (saved.flyerError) {
			setBanner({
				kind: 'err',
				text: `Saved “${saved.title}”, but the flyer upload failed: ${saved.flyerError}`,
			});
		} else if (!saved.hasFlyer) {
			setBanner({
				kind: 'warn',
				text: `Saved “${saved.title}”. No flyer yet — upload one before it goes out.`,
			});
		} else {
			setBanner({ kind: 'ok', text: `Saved “${saved.title}”.` });
		}
	}

	/** Upcoming, live events without a flyer get flagged; past ones just say "none". */
	function flyerUrgency(ev: AdminEvent): 'urgent' | 'missing' | null {
		if (ev.flyerUrl || !ev.active) return null;
		const now = Date.now();
		if (parseWire(ev.endTimeRaw ?? ev.startTimeRaw).getTime() < now) return null;
		const daysOut = (parseWire(ev.startTimeRaw).getTime() - now) / 86_400_000;
		return daysOut <= FLYER_URGENT_DAYS ? 'urgent' : 'missing';
	}

	return (
		<div className="text-foreground">
			<LabelBar labels={labels ?? []} />

			{banner && (
				<div
					className={`mb-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
						banner.kind === 'ok'
							? 'border-green-800 bg-green-900/30 text-green-200'
							: banner.kind === 'warn'
								? 'border-amber-800 bg-amber-900/30 text-amber-200'
								: 'border-red-800 bg-red-900/30 text-red-200'
					}`}
				>
					<span>{banner.text}</span>
					<button
						type="button"
						onClick={() => setBanner(null)}
						className="text-xs opacity-70 hover:opacity-100"
					>
						dismiss
					</button>
				</div>
			)}

			<div className="mb-4 flex flex-wrap gap-3">
				<button
					type="button"
					onClick={openCreate}
					className="rounded-md bg-ieee-dark-yellow px-4 py-2 text-sm font-semibold text-black"
				>
					+ New event
				</button>
				<button
					type="button"
					disabled={importGoogle.isPending}
					onClick={previewImport}
					className="rounded-md border border-input px-4 py-2 text-sm text-foreground disabled:opacity-50"
				>
					{importGoogle.isPending ? 'Working…' : 'Import from Google Calendar'}
				</button>
				<div className="ml-auto flex items-center gap-4">
					{pastCount > 0 && (
						<label className="flex items-center gap-2 text-xs text-muted-foreground">
							<input
								type="checkbox"
								checked={showPast}
								onChange={(e) => setShowPast(e.target.checked)}
							/>
							Show past ({pastCount})
						</label>
					)}
					{archivedCount > 0 && (
						<label className="flex items-center gap-2 text-xs text-muted-foreground">
							<input
								type="checkbox"
								checked={showArchived}
								onChange={(e) => setShowArchived(e.target.checked)}
							/>
							Show archived ({archivedCount})
						</label>
					)}
				</div>
			</div>

			{importPreview && (
				<div className="mb-6 rounded-lg border border-input bg-card/60 p-4 text-sm">
					<p className="mb-2 font-semibold text-foreground">
						Import {importPreview.imported} event(s) from Google Calendar?
					</p>
					<p className="mb-2 text-xs text-muted-foreground">
						{importPreview.skipped} already linked and will be left alone.
					</p>
					<ul className="mb-3 max-h-40 overflow-y-auto text-xs text-muted-foreground">
						{importPreview.results
							.filter((r) => r.action === 'imported')
							.map((r) => (
								<li key={r.googleCalendarEventId}>• {r.title}</li>
							))}
					</ul>
					<div className="flex gap-3">
						<button
							type="button"
							disabled={importGoogle.isPending}
							onClick={commitImport}
							className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
						>
							{importGoogle.isPending ? 'Importing…' : 'Confirm import'}
						</button>
						<button
							type="button"
							onClick={() => setImportPreview(null)}
							className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			<Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
				<EventForm
					key={formKey}
					labels={labels ?? []}
					editing={editing}
					onDone={onFormDone}
				/>
			</Dialog>

			<input
				ref={flyerRef}
				type="file"
				accept={FLYER_ACCEPT}
				className="hidden"
				onChange={onFlyerFile}
			/>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : (
				<Table>
					<TableHeader className="bg-card/60 text-xs uppercase">
						<TableRow>
							<TableHead>Event</TableHead>
							<TableHead>Start</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Global</TableHead>
							<TableHead>Sync</TableHead>
							<TableHead>Flyer</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{visible.map((ev) => (
							<TableRow key={ev.id} inactive={!ev.active}>
								<TableCell>
									<div className="font-medium">
										{ev.title}
										{!ev.active && (
											<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
												archived
											</span>
										)}
										{ev.hidden && (
											<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-amber-400 uppercase">
												hidden
											</span>
										)}
									</div>
									<div className="text-xs text-muted-foreground-dim">
										{ev.location}
										{ev.active && !ev.hidden && (
											<a
												href={eventPath(ev)}
												target="_blank"
												rel="noreferrer"
												className="ml-2 text-blue-400 hover:underline"
											>
												View page ↗
											</a>
										)}
									</div>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{ev.startTime}
								</TableCell>
								<TableCell>
									{ev.label ? (
										<span className="inline-flex items-center gap-1 text-xs">
											<span
												className="h-2.5 w-2.5 rounded-full"
												style={{
													backgroundColor: ev.label.hex ?? '#888',
												}}
											/>
											{ev.label.name}
										</span>
									) : (
										<span className="text-xs text-muted-foreground-dim">—</span>
									)}
								</TableCell>
								<TableCell className="text-xs">{ev.isGlobal ? '✓' : ''}</TableCell>
								<TableCell>
									<span
										className={`rounded px-2 py-0.5 text-xs ${SYNC_BADGE[ev.syncStatus] ?? SYNC_BADGE.pending}`}
									>
										{ev.syncStatus}
									</span>
								</TableCell>
								<TableCell>
									{ev.flyerUrl ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											src={ev.flyerUrl}
											alt="flyer"
											className="h-10 w-10 rounded object-cover"
										/>
									) : flyerUrgency(ev) === 'urgent' ? (
										<span
											title={`Starts within ${FLYER_URGENT_DAYS} days and has no flyer`}
											className="rounded bg-red-900/70 px-2 py-0.5 text-xs font-semibold text-red-300"
										>
											missing
										</span>
									) : flyerUrgency(ev) === 'missing' ? (
										<span className="rounded bg-amber-900/50 px-2 py-0.5 text-xs text-amber-300">
											missing
										</span>
									) : (
										<span className="text-xs text-muted-foreground-dim">
											none
										</span>
									)}
								</TableCell>
								<TableCell>
									<div className="flex justify-end gap-3 text-xs">
										<button
											type="button"
											onClick={() => openEdit(ev)}
											className="text-blue-400 hover:underline"
										>
											edit
										</button>
										<button
											type="button"
											onClick={() => setAttendeesFor(ev.id)}
											className="text-blue-400 hover:underline"
										>
											attendees
										</button>
										<button
											type="button"
											disabled={setHidden.isPending}
											onClick={() =>
												setHidden.mutate({
													id: ev.id,
													data: { hidden: !ev.hidden },
												})
											}
											className="text-blue-400 hover:underline disabled:opacity-50"
										>
											{ev.hidden ? 'unhide' : 'hide'}
										</button>
										<button
											type="button"
											disabled={flyerBusy === ev.id}
											onClick={() => pickFlyer(ev.id)}
											className="text-blue-400 hover:underline disabled:opacity-50"
										>
											{flyerBusy === ev.id ? 'uploading…' : 'flyer'}
										</button>
										{ev.syncStatus === 'error' && (
											<button
												type="button"
												disabled={resync.isPending}
												onClick={() => resync.mutate({ id: ev.id })}
												className="text-yellow-400 hover:underline disabled:opacity-50"
											>
												re-sync
											</button>
										)}
										{ev.active ? (
											<button
												type="button"
												onClick={() =>
													setPendingDelete({ ev, mode: 'archive' })
												}
												className="text-red-400 hover:underline"
											>
												delete
											</button>
										) : (
											<>
												<button
													type="button"
													disabled={restore.isPending}
													onClick={() => restore.mutate({ id: ev.id })}
													className="text-green-400 hover:underline disabled:opacity-50"
												>
													restore
												</button>
												<button
													type="button"
													onClick={() => {
														setPurgeText('');
														setPendingDelete({ ev, mode: 'purge' });
													}}
													className="text-red-500 hover:underline"
												>
													delete permanently
												</button>
											</>
										)}
									</div>
								</TableCell>
							</TableRow>
						))}
						{visible.length === 0 && (
							<TableEmpty colSpan={7}>
								{sorted.length === 0 ? 'No events yet.' : 'No active events.'}
							</TableEmpty>
						)}
					</TableBody>
				</Table>
			)}

			<EventAttendeesSheet eventId={attendeesFor} onClose={() => setAttendeesFor(null)} />

			{pendingDelete && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
					<div className="w-full max-w-md rounded-lg border border-input bg-card p-6">
						{pendingDelete.mode === 'archive' ? (
							<>
								<h3 className="mb-2 text-lg font-semibold text-foreground">
									Archive “{pendingDelete.ev.title}”?
								</h3>
								<p className="mb-5 text-sm text-muted-foreground">
									It's removed from the website
									{pendingDelete.ev.googleCalendarEventId
										? ' and Google Calendar'
										: ''}
									, but kept here with its attendee history. You can restore or
									permanently delete it from “Show archived”.
								</p>
								<div className="flex justify-end gap-3">
									<button
										type="button"
										onClick={() => setPendingDelete(null)}
										className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground"
									>
										Cancel
									</button>
									<button
										type="button"
										disabled={deleteBusy}
										onClick={confirmDelete}
										className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
									>
										{deleteBusy ? 'Archiving…' : 'Archive event'}
									</button>
								</div>
							</>
						) : (
							<>
								<h3 className="mb-2 text-lg font-semibold text-red-300">
									Permanently delete “{pendingDelete.ev.title}”?
								</h3>
								<p className="mb-3 text-sm text-muted-foreground">
									This cannot be undone. It removes the event, its attendee
									records
									{pendingDelete.ev.googleCalendarEventId
										? ', and its Google Calendar entry'
										: ''}
									.
								</p>
								<label className="mb-1 block text-xs text-muted-foreground">
									Type{' '}
									<span className="font-mono text-foreground">
										{pendingDelete.ev.title}
									</span>{' '}
									to confirm
								</label>
								<input
									autoFocus
									aria-label="Confirm event title"
									value={purgeText}
									onChange={(e) => setPurgeText(e.target.value)}
									className="mb-5 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm text-foreground"
								/>

								<div className="flex justify-end gap-3">
									<button
										type="button"
										onClick={() => setPendingDelete(null)}
										className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground"
									>
										Cancel
									</button>
									<button
										type="button"
										disabled={
											deleteBusy ||
											purgeText.trim() !== pendingDelete.ev.title.trim()
										}
										onClick={confirmDelete}
										className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
									>
										{deleteBusy ? 'Deleting…' : 'Permanently delete'}
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
