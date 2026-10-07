'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, History, QrCode } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import {
	isShortLinkLive,
	normalizeShortLinkSlug,
	shortLinkSlugProblem,
	shortLinkTargetProblem,
	shortLinkUrl,
} from '@watts/core/short-link-rules';
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
import {
	QR_LOGO_URL,
	renderBrandedQr,
	renderBrandedQrBlob,
	saveQrPng,
} from '@/components/qr/render-branded-qr';

type ShortLink = RouterOutputs['shortLink']['list'][number];

const field = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground';
const btnPrimary =
	'inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const btnOutline =
	'inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50';

// Print-quality export: spec quiet zone (4 modules), level H so the logo can't break it.
const DOWNLOAD_PX = 1024;
const qrOptions = (size: number) => ({
	size,
	logoUrl: QR_LOGO_URL,
	logoSize: Math.round(size * 0.2),
	logoPadding: Math.max(4, Math.round(size * 0.014)),
	errorCorrectionLevel: 'H' as const,
	margin: 4,
});

function fmtDate(d: Date | string | null): string {
	if (!d) return '—';
	return new Date(d).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

/** yyyy-mm-dd for <input type="date">, in local time. */
function toDateInput(d: Date | string | null): string {
	if (!d) return '';
	const x = new Date(d);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			title={`Copy ${text}`}
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setDone(true);
				setTimeout(() => setDone(false), 1500);
			}}
			className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
		>
			<Copy className="size-3" />
			{done ? 'Copied' : label}
		</button>
	);
}

/** Live preview of the branded QR, rendered with the same settings as the download. */
function QrPreview({ text, size = 240 }: { text: string; size?: number }) {
	const [src, setSrc] = useState('');
	useEffect(() => {
		let cancelled = false;
		renderBrandedQr(text, qrOptions(size * 2)) // 2× for sharp rendering on retina screens
			.then((url) => !cancelled && setSrc(url))
			.catch(() => !cancelled && setSrc(''));
		return () => {
			cancelled = true;
		};
	}, [text, size]);
	return (
		<div
			className="flex items-center justify-center rounded-lg bg-white"
			style={{ width: size, height: size }}
		>
			{src ? (
				// eslint-disable-next-line @next/next/no-img-element -- a generated data: URL
				<img
					src={src}
					alt={`QR code for ${text}`}
					width={size}
					height={size}
					data-testid="link-qr-image"
				/>
			) : (
				<span className="text-xs text-neutral-500">Generating…</span>
			)}
		</div>
	);
}

function DownloadQrButton({ slug, origin }: { slug: string; origin: string }) {
	const [busy, setBusy] = useState(false);
	return (
		<button
			type="button"
			disabled={busy}
			className={btnPrimary}
			onClick={async () => {
				setBusy(true);
				try {
					const blob = await renderBrandedQrBlob(
						shortLinkUrl(origin, slug, { qr: true }),
						qrOptions(DOWNLOAD_PX),
					);
					await saveQrPng(blob, `ieee-ucf-${slug}-qr.png`);
				} finally {
					setBusy(false);
				}
			}}
		>
			<Download className="size-4" />
			{busy ? 'Preparing…' : 'Download PNG'}
		</button>
	);
}

function QrDialog({
	link,
	origin,
	onClose,
}: {
	link: ShortLink;
	origin: string;
	onClose: () => void;
}) {
	const short = shortLinkUrl(origin, link.slug);
	return (
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{link.title}</DialogTitle>
				<DialogDescription>
					Scans go to <span className="text-foreground">{short}</span>, then on to the
					destination.
				</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col items-center gap-4">
				<QrPreview text={shortLinkUrl(origin, link.slug, { qr: true })} size={256} />
				<div className="flex flex-wrap items-center justify-center gap-3">
					<DownloadQrButton slug={link.slug} origin={origin} />
					<CopyButton text={short} label="Copy link" />
				</div>
				<p className="text-center text-xs text-muted-foreground-dim">
					{DOWNLOAD_PX}×{DOWNLOAD_PX} PNG. Print it at least 2.5 cm (1 in) wide, dark on a
					light background, and leave the white border around it.
				</p>
				<button type="button" onClick={onClose} className={btnOutline}>
					Done
				</button>
			</div>
		</DialogContent>
	);
}

const FIELD_LABEL: Record<string, string> = {
	created: 'Created',
	title: 'Title',
	targetUrl: 'Destination',
	slug: 'Short address',
	owner: 'Owner',
	expiresAt: 'Expiry',
	notes: 'Notes',
	active: 'Status',
};

function historyValue(name: string, v: string | null): string {
	if (v == null || v === '') return '—';
	if (name === 'active') return v === 'true' ? 'active' : 'archived';
	if (name === 'expiresAt') return fmtDate(v);
	return v;
}

function HistoryDialog({ link }: { link: ShortLink }) {
	const { data, isLoading } = trpc.shortLink.history.useQuery({ id: link.id });
	return (
		<DialogContent className="sm:max-w-2xl">
			<DialogHeader>
				<DialogTitle>History — {link.title}</DialogTitle>
				<DialogDescription>Every change to this link, newest first.</DialogDescription>
			</DialogHeader>
			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : (
				<ul className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
					{(data ?? []).map((h) => (
						<li key={h.id} className="rounded-md border border-border p-3">
							<div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground">
								<span className="font-semibold text-foreground">
									{FIELD_LABEL[h.field] ?? h.field}
								</span>
								<span>
									{h.changedByName ?? 'Unknown'} ·{' '}
									{new Date(h.changedAt).toLocaleString()}
								</span>
							</div>
							{h.field === 'created' ? (
								<p className="break-all text-muted-foreground">→ {h.newValue}</p>
							) : (
								<p className="break-all text-muted-foreground">
									<span className="line-through opacity-70">
										{historyValue(h.field, h.oldValue)}
									</span>
									{' → '}
									<span className="text-foreground">
										{historyValue(h.field, h.newValue)}
									</span>
								</p>
							)}
						</li>
					))}
				</ul>
			)}
		</DialogContent>
	);
}

interface FormState {
	title: string;
	targetUrl: string;
	slug: string;
	owner: string;
	expiresAt: string;
	notes: string;
}

function LinkForm({
	editing,
	origin,
	onDone,
}: {
	editing: ShortLink | null;
	origin: string;
	onDone: (saved?: { slug: string; id: string }) => void;
}) {
	const utils = trpc.useUtils();
	const create = trpc.shortLink.create.useMutation();
	const update = trpc.shortLink.update.useMutation();
	const events = trpc.shortLink.eventOptions.useQuery();
	const [form, setForm] = useState<FormState>({
		title: editing?.title ?? '',
		targetUrl: editing?.targetUrl ?? '',
		slug: editing?.slug ?? '',
		owner: editing?.owner ?? '',
		expiresAt: toDateInput(editing?.expiresAt ?? null),
		notes: editing?.notes ?? '',
	});
	// New links follow the title until the officer types their own short address.
	const [slugTouched, setSlugTouched] = useState(Boolean(editing));
	const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
		setForm((f) => ({ ...f, [k]: v }));

	const used = editing ? editing.qrScans + editing.linkClicks > 0 : false;
	const slug = slugTouched
		? normalizeShortLinkSlug(form.slug)
		: normalizeShortLinkSlug(form.title).slice(0, 40).replace(/-+$/, '');
	const slugProblem = slug ? shortLinkSlugProblem(slug) : null;
	const targetProblem = form.targetUrl ? shortLinkTargetProblem(form.targetUrl, origin) : null;
	const pending = create.isPending || update.isPending;
	const error = create.error?.message ?? update.error?.message;
	const slugChanged = editing && slug !== editing.slug;

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (targetProblem || (slug && slugProblem)) return;
		const payload = {
			title: form.title,
			targetUrl: form.targetUrl,
			// Untouched → let the server pick a free address (it adds -2 etc. if taken).
			slug: slugTouched ? slug || null : null,
			owner: form.owner || null,
			notes: form.notes || null,
			// End of the chosen day, local time.
			expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`) : null,
		};
		let saved: { id: string; slug: string } | undefined;
		try {
			saved = editing
				? await update.mutateAsync({ id: editing.id, ...payload })
				: await create.mutateAsync(payload);
		} catch {
			return; // shown from create.error / update.error
		}
		await utils.shortLink.list.invalidate();
		onDone(saved ?? undefined);
	}

	return (
		<DialogContent
			className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
			onInteractOutside={(e) => e.preventDefault()}
			onEscapeKeyDown={(e) => pending && e.preventDefault()}
		>
			<DialogHeader className="border-b border-border px-6 py-4">
				<DialogTitle>{editing ? `Edit “${editing.title}”` : 'New QR link'}</DialogTitle>
				<DialogDescription>
					{editing
						? 'Changing the destination keeps every printed QR working. All changes are logged.'
						: 'Save first, then download the QR code.'}
				</DialogDescription>
			</DialogHeader>

			<form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
				<div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[1fr_220px]">
					<div className="min-w-0 space-y-4">
						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">Title</span>
							<input
								required
								maxLength={120}
								placeholder="Career Fair RSVP"
								value={form.title}
								onChange={(e) => set('title', e.target.value)}
								className={field}
							/>
						</label>

						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">
								Destination
							</span>
							<input
								required
								type="url"
								placeholder="https://forms.gle/…"
								value={form.targetUrl}
								onChange={(e) => set('targetUrl', e.target.value)}
								className={field}
								aria-invalid={Boolean(targetProblem)}
							/>
							{targetProblem && (
								<span className="mt-1 block text-xs text-red-400">
									{targetProblem}
								</span>
							)}
						</label>

						{(events.data?.length ?? 0) > 0 && (
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									…or link to an event page
								</span>
								<select
									value=""
									onChange={(e) => {
										const ev = events.data!.find(
											(x) => x.id === e.target.value,
										);
										if (!ev) return;
										set('targetUrl', `${origin}/events/${ev.number}`);
										if (!form.title) set('title', ev.title);
									}}
									className={field}
								>
									<option value="">Pick an event…</option>
									{events.data!.map((ev) => (
										<option key={ev.id} value={ev.id}>
											{ev.title} — {fmtDate(ev.startTime)}
										</option>
									))}
								</select>
							</label>
						)}

						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">
								Short address
							</span>
							<div className="flex items-center rounded-md border border-input bg-card text-sm">
								<span className="pl-3 text-muted-foreground-dim">
									{origin.replace(/^https?:\/\//, '')}/go/
								</span>
								<input
									value={slugTouched ? form.slug : slug}
									disabled={used}
									placeholder="career-fair"
									onChange={(e) => {
										setSlugTouched(true);
										set('slug', e.target.value);
									}}
									className="w-full min-w-0 bg-transparent py-2 pr-3 text-foreground outline-none disabled:opacity-60"
								/>
							</div>
							{used ? (
								<span className="mt-1 block text-xs text-muted-foreground-dim">
									Locked — this link has been used, so printed QR codes depend on
									it.
								</span>
							) : slug && slugProblem ? (
								<span className="mt-1 block text-xs text-red-400">
									{slugProblem}
								</span>
							) : slugChanged ? (
								<span className="mt-1 block text-xs text-amber-400">
									The old address will keep redirecting here.
								</span>
							) : null}
						</label>

						<div className="grid gap-4 sm:grid-cols-2">
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Owner (optional)
								</span>
								<input
									maxLength={80}
									placeholder="Software committee"
									value={form.owner}
									onChange={(e) => set('owner', e.target.value)}
									className={field}
								/>
							</label>
							<label className="block">
								<span className="mb-1 block text-xs text-muted-foreground">
									Expires (optional)
								</span>
								<input
									type="date"
									value={form.expiresAt}
									onChange={(e) => set('expiresAt', e.target.value)}
									className={field}
								/>
							</label>
						</div>

						<label className="block">
							<span className="mb-1 block text-xs text-muted-foreground">
								Notes (optional)
							</span>
							<textarea
								rows={2}
								maxLength={2000}
								value={form.notes}
								onChange={(e) => set('notes', e.target.value)}
								className={field}
							/>
						</label>
					</div>

					<div className="flex flex-col items-center gap-2 md:sticky md:top-0 md:self-start">
						{slug && !slugProblem ? (
							<QrPreview text={shortLinkUrl(origin, slug, { qr: true })} size={200} />
						) : (
							<div className="flex size-[200px] items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground-dim">
								Add a title to preview the QR
							</div>
						)}
						<span className="text-center text-xs break-all text-muted-foreground">
							{slug ? shortLinkUrl(origin, slug) : ''}
						</span>
					</div>
				</div>

				<div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
					{error && <span className="mr-auto text-sm text-red-400">{error}</span>}
					<button
						type="button"
						disabled={pending}
						onClick={() => onDone()}
						className={btnOutline}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={pending || Boolean(targetProblem) || Boolean(slug && slugProblem)}
						className={btnPrimary}
					>
						{pending ? 'Saving…' : editing ? 'Save changes' : 'Create link'}
					</button>
				</div>
			</form>
		</DialogContent>
	);
}

type Modal =
	| { kind: 'form'; editing: ShortLink | null; key: number }
	| { kind: 'qr'; link: ShortLink }
	| { kind: 'history'; link: ShortLink }
	| null;

export function LinksManager({ origin }: { origin: string }) {
	const utils = trpc.useUtils();
	const { data: links, isLoading } = trpc.shortLink.list.useQuery();
	const setActive = trpc.shortLink.setActive.useMutation({
		onSuccess: () => utils.shortLink.list.invalidate(),
	});
	const [modal, setModal] = useState<Modal>(null);
	const [query, setQuery] = useState('');
	const [showArchived, setShowArchived] = useState(false);
	// Links made on localhost / a preview deploy are saved in *that* database, but the QR
	// always encodes the production address.
	const [offProduction, setOffProduction] = useState(false);
	useEffect(() => setOffProduction(window.location.origin !== origin), [origin]);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (links ?? []).filter(
			(l) =>
				(showArchived || l.active) &&
				(!q ||
					[l.title, l.slug, l.targetUrl, l.owner ?? ''].some((s) =>
						s.toLowerCase().includes(q),
					)),
		);
	}, [links, query, showArchived]);

	async function onFormDone(saved?: { slug: string; id: string }) {
		setModal(null);
		if (!saved) return;
		// Jump straight to the QR for a link that was just made.
		const fresh = (await utils.shortLink.list.fetch()).find((l) => l.id === saved.id);
		if (fresh) setModal({ kind: 'qr', link: fresh });
	}

	return (
		<div>
			{offProduction && (
				<div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">
					You&apos;re not on {origin.replace(/^https?:\/\//, '')}. QR codes still point
					there, but links saved here go into this environment&apos;s database — they
					won&apos;t work in print unless this <em>is</em> production.
				</div>
			)}

			<div className="mb-4 flex flex-wrap items-center gap-3">
				<button
					type="button"
					className={btnPrimary}
					onClick={() => setModal({ kind: 'form', editing: null, key: Date.now() })}
				>
					<QrCode className="size-4" /> New QR link
				</button>
				<input
					type="search"
					placeholder="Search links…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className={`${field} max-w-xs`}
				/>
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={showArchived}
						onChange={(e) => setShowArchived(e.target.checked)}
					/>
					Show archived
				</label>
			</div>

			<Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
				{modal?.kind === 'form' && (
					<LinkForm
						key={modal.key}
						editing={modal.editing}
						origin={origin}
						onDone={onFormDone}
					/>
				)}
				{modal?.kind === 'qr' && (
					<QrDialog link={modal.link} origin={origin} onClose={() => setModal(null)} />
				)}
				{modal?.kind === 'history' && <HistoryDialog link={modal.link} />}
			</Dialog>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : (
				<Table>
					<TableHeader className="bg-card/60 text-xs uppercase">
						<TableRow>
							<TableHead>Link</TableHead>
							<TableHead>Destination</TableHead>
							<TableHead title="QR scans / link clicks (bots not counted)">
								Scans · Clicks
							</TableHead>
							<TableHead>Last used</TableHead>
							<TableHead>Changed</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{visible.length === 0 && (
							<TableEmpty colSpan={6}>
								{(links?.length ?? 0) === 0
									? 'No links yet — make the first one.'
									: 'No links match.'}
							</TableEmpty>
						)}
						{visible.map((l) => {
							const live = isShortLinkLive(l);
							const short = shortLinkUrl(origin, l.slug);
							return (
								<TableRow key={l.id} inactive={!live}>
									<TableCell>
										<div className="font-medium">
											{l.title}
											{!l.active ? (
												<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
													archived
												</span>
											) : !live ? (
												<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-amber-400 uppercase">
													expired
												</span>
											) : null}
										</div>
										<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-dim">
											<span className="font-mono">/go/{l.slug}</span>
											<CopyButton text={short} />
										</div>
										{(l.owner || l.expiresAt) && (
											<div className="text-xs text-muted-foreground-dim">
												{l.owner}
												{l.owner && l.expiresAt && ' · '}
												{l.expiresAt && `expires ${fmtDate(l.expiresAt)}`}
											</div>
										)}
									</TableCell>
									<TableCell className="max-w-[260px]">
										<a
											href={l.targetUrl}
											target="_blank"
											rel="noreferrer"
											title={l.targetUrl}
											className="block truncate text-xs text-blue-400 hover:underline"
										>
											{l.targetUrl.replace(/^https?:\/\//, '')}
										</a>
									</TableCell>
									<TableCell className="font-mono text-xs">
										{l.qrScans} · {l.linkClicks}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{fmtDate(l.lastClickedAt)}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{fmtDate(l.updatedAt)}
										<div className="text-muted-foreground-dim">
											{l.updatedByName ?? l.createdByName ?? ''}
										</div>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap justify-end gap-2">
											<button
												type="button"
												className={btnOutline}
												onClick={() => setModal({ kind: 'qr', link: l })}
											>
												<QrCode className="size-3.5" /> QR
											</button>
											{l.canEdit && (
												<button
													type="button"
													className={btnOutline}
													onClick={() =>
														setModal({
															kind: 'form',
															editing: l,
															key: Date.now(),
														})
													}
												>
													Edit
												</button>
											)}
											<button
												type="button"
												title="History"
												className={btnOutline}
												onClick={() =>
													setModal({ kind: 'history', link: l })
												}
											>
												<History className="size-3.5" />
											</button>
											{l.canEdit && (
												<button
													type="button"
													disabled={setActive.isPending}
													className={btnOutline}
													onClick={() =>
														setActive.mutate({
															id: l.id,
															active: !l.active,
														})
													}
												>
													{l.active ? 'Archive' : 'Restore'}
												</button>
											)}
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
			{setActive.error && (
				<p className="mt-2 text-sm text-red-400">{setActive.error.message}</p>
			)}
		</div>
	);
}
