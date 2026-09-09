'use client';

import { useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import { uploadEventFlyer } from '@watts/storage/client';

type AdminEvent = RouterOutputs['event']['getAllForAdmin'][number];
type Label = RouterOutputs['eventLabel']['list'][number];

const GOOGLE_COLOR_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] as const;

const SYNC_BADGE: Record<string, string> = {
	synced: 'bg-green-900/70 text-green-300',
	pending: 'bg-gray-800 text-gray-300',
	error: 'bg-red-900/70 text-red-300',
	skipped: 'bg-gray-800 text-gray-400',
};

const COMMON_TZ = [
	'America/New_York',
	'America/Chicago',
	'America/Denver',
	'America/Los_Angeles',
	'UTC',
];

/** Postgres wire string → value for a <input type="datetime-local"> in the browser's local tz. */
function toLocalInput(raw: string | null | undefined): string {
	if (!raw) return '';
	const d = new Date(raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
	if (Number.isNaN(d.getTime())) return '';
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
	allDay: boolean;
	requiresDues: boolean;
	rsvpLink: string;
	slug: string;
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
		allDay: false,
		requiresDues: false,
		rsvpLink: '',
		slug: '',
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
		allDay: ev.allDay,
		requiresDues: ev.requiresDues,
		rsvpLink: ev.rsvpLink ?? '',
		slug: ev.slug ?? '',
	};
}

function EventForm({
	labels,
	editing,
	onDone,
}: {
	labels: Label[];
	editing: AdminEvent | null;
	onDone: () => void;
}) {
	const [form, setForm] = useState<FormState>(editing ? fromEvent(editing) : emptyForm());
	const utils = trpc.useUtils();

	const invalidate = () => {
		void utils.event.getAllForAdmin.invalidate();
		void utils.event.getAll.invalidate();
	};

	const finish = () => {
		invalidate();
		onDone();
	};
	const create = trpc.event.create.useMutation({ onSuccess: finish });
	const update = trpc.event.update.useMutation({ onSuccess: finish });
	const pending = create.isPending || update.isPending;
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
			allDay: form.allDay,
			requiresDues: form.requiresDues,
			rsvpLink: form.rsvpLink || undefined,
			slug: form.slug || undefined,
		};
		if (editing) await update.mutateAsync({ id: editing.id, data: payload });
		else await create.mutateAsync(payload);
	}

	const field = 'w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100';

	return (
		<form
			onSubmit={submit}
			className="mb-8 space-y-4 rounded-lg border border-gray-800 bg-gray-900/50 p-5"
		>
			<h3 className="text-sm font-semibold text-gray-200">
				{editing ? `Edit “${editing.title}”` : 'New event'}
			</h3>

			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block">
					<span className="mb-1 block text-xs text-gray-400">Title</span>
					<input
						id="title"
						required
						value={form.title}
						onChange={(e) => set('title', e.target.value)}
						className={field}
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-gray-400">Location</span>
					<input
						id="location"
						required
						value={form.location}
						onChange={(e) => set('location', e.target.value)}
						className={field}
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-gray-400">Start</span>
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
					<span className="mb-1 block text-xs text-gray-400">End</span>
					<input
						id="endTime"
						type="datetime-local"
						value={form.endTime}
						onChange={(e) => set('endTime', e.target.value)}
						className={field}
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-gray-400">Category</span>
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
					<span className="mb-1 block text-xs text-gray-400">Time zone</span>
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
				<span className="mb-1 block text-xs text-gray-400">Description</span>
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
					<span className="mb-1 block text-xs text-gray-400">RSVP link (optional)</span>
					<input
						id="rsvpLink"
						value={form.rsvpLink}
						onChange={(e) => set('rsvpLink', e.target.value)}
						className={field}
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-gray-400">Slug (optional)</span>
					<input
						id="slug"
						value={form.slug}
						onChange={(e) => set('slug', e.target.value)}
						className={field}
					/>
				</label>
			</div>

			<div className="flex flex-wrap gap-6 text-sm text-gray-300">
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
						id="allDay"
						type="checkbox"
						checked={form.allDay}
						onChange={(e) => set('allDay', e.target.checked)}
					/>
					All-day
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

			{error && <p className="text-sm text-red-400">{error}</p>}

			<div className="flex gap-3">
				<button
					type="submit"
					disabled={pending}
					className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
				>
					{pending ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
				</button>
				<button
					type="button"
					onClick={onDone}
					className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300"
				>
					Cancel
				</button>
			</div>
		</form>
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
		<div className="mb-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="text-sm font-semibold text-gray-300"
				>
					Categories ({labels.filter((l) => l.active).length}) {open ? '▾' : '▸'}
				</button>
				{open && (
					<button
						type="button"
						disabled={pull.isPending}
						onClick={() => pull.mutate()}
						className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 disabled:opacity-50"
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
								title={l.googleLabelId ? 'Linked to a Google event label' : 'Not linked to Google'}
								className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
									l.active ? 'border-gray-700 text-gray-200' : 'border-gray-800 text-gray-500 line-through'
								}`}
							>
								<span
									className="h-3 w-3 rounded-full"
									style={{ backgroundColor: l.hex ?? '#888' }}
								/>
								{l.name}
								{l.googleLabelId && <span className="text-[10px] text-green-400">G</span>}
								<button
									type="button"
									onClick={() => setActive.mutate({ id: l.id, active: !l.active })}
									className="text-gray-500 hover:text-gray-300"
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
							className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
						/>
						<input
							placeholder="slug"
							required
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
						/>
						<select
							value={colorId}
							onChange={(e) => setColorId(e.target.value)}
							className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
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
							className="rounded bg-gray-700 px-3 py-1 text-gray-100 disabled:opacity-50"
						>
							Add
						</button>
						{create.error && <span className="text-red-400">{create.error.message}</span>}
					</form>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────── main ───────────────────────────

export function EventManager() {
	const utils = trpc.useUtils();
	const { data: events, isLoading } = trpc.event.getAllForAdmin.useQuery();
	const { data: labels } = trpc.eventLabel.list.useQuery();

	const [showForm, setShowForm] = useState(false);
	const [editing, setEditing] = useState<AdminEvent | null>(null);
	const [flyerBusy, setFlyerBusy] = useState<string | null>(null);
	const flyerRef = useRef<HTMLInputElement>(null);
	const flyerTarget = useRef<string | null>(null);

	const invalidate = () => {
		void utils.event.getAllForAdmin.invalidate();
		void utils.event.getAll.invalidate();
	};

	const del = trpc.event.delete.useMutation({ onSuccess: invalidate });
	const resync = trpc.event.resync.useMutation({ onSuccess: invalidate });
	const confirmFlyer = trpc.event.confirmFlyer.useMutation();

	const sorted = useMemo(
		() => (events ?? []).slice().sort((a, b) => (a.startTimeRaw < b.startTimeRaw ? 1 : -1)),
		[events],
	);

	function openCreate() {
		setEditing(null);
		setShowForm(true);
	}
	function openEdit(ev: AdminEvent) {
		setEditing(ev);
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
			await uploadEventFlyer(eventId, file);
			await confirmFlyer.mutateAsync({ eventId, filename: file.name });
			invalidate();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Flyer upload failed');
		} finally {
			setFlyerBusy(null);
		}
	}

	return (
		<div className="text-gray-100">
			<LabelBar labels={labels ?? []} />

			<div className="mb-4">
				<button
					type="button"
					onClick={openCreate}
					className="rounded-md bg-[var(--ieee-dark-yellow)] px-4 py-2 text-sm font-semibold text-black"
				>
					+ New event
				</button>
			</div>

			{showForm && (
				<EventForm
					labels={labels ?? []}
					editing={editing}
					onDone={() => setShowForm(false)}
				/>
			)}

			<input
				ref={flyerRef}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				onChange={onFlyerFile}
			/>

			{isLoading ? (
				<p className="text-sm text-gray-400">Loading…</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-gray-800">
					<table className="w-full text-left text-sm">
						<thead className="bg-gray-900/60 text-xs uppercase text-gray-400">
							<tr>
								<th className="px-3 py-2">Event</th>
								<th className="px-3 py-2">Start</th>
								<th className="px-3 py-2">Category</th>
								<th className="px-3 py-2">Global</th>
								<th className="px-3 py-2">Sync</th>
								<th className="px-3 py-2">Flyer</th>
								<th className="px-3 py-2" />
							</tr>
						</thead>
						<tbody>
							{sorted.map((ev) => (
								<tr
									key={ev.id}
									className={`border-t border-gray-800 ${ev.active ? '' : 'opacity-40'}`}
								>
									<td className="px-3 py-2">
										<div className="font-medium">{ev.title}</div>
										<div className="text-xs text-gray-500">{ev.location}</div>
									</td>
									<td className="px-3 py-2 text-xs text-gray-300">{ev.startTime}</td>
									<td className="px-3 py-2">
										{ev.label ? (
											<span className="inline-flex items-center gap-1 text-xs">
												<span
													className="h-2.5 w-2.5 rounded-full"
													style={{ backgroundColor: ev.label.hex ?? '#888' }}
												/>
												{ev.label.name}
											</span>
										) : (
											<span className="text-xs text-gray-600">—</span>
										)}
									</td>
									<td className="px-3 py-2 text-xs">{ev.isGlobal ? '✓' : ''}</td>
									<td className="px-3 py-2">
										<span
											className={`rounded px-2 py-0.5 text-xs ${SYNC_BADGE[ev.syncStatus] ?? SYNC_BADGE.pending}`}
										>
											{ev.syncStatus}
										</span>
									</td>
									<td className="px-3 py-2">
										{ev.flyerUrl ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={ev.flyerUrl}
												alt="flyer"
												className="h-10 w-10 rounded object-cover"
											/>
										) : (
											<span className="text-xs text-gray-600">none</span>
										)}
									</td>
									<td className="px-3 py-2">
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
											{ev.active && (
												<button
													type="button"
													onClick={() => {
														if (
															confirm(
																`Delete “${ev.title}”? This also removes it from Google Calendar.`,
															)
														) {
															del.mutate({ id: ev.id });
														}
													}}
													className="text-red-400 hover:underline"
												>
													delete
												</button>
											)}
										</div>
									</td>
								</tr>
							))}
							{sorted.length === 0 && (
								<tr>
									<td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
										No events yet.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
