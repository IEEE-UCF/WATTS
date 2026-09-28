'use client';

import { useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { uploadSiteMedia, type SiteMediaUploadOptions } from '@watts/storage/client';

export const fieldClass =
	'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground';
export const buttonClass =
	'rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:border-foreground disabled:opacity-50';
export const primaryButtonClass =
	'rounded-md bg-ieee-dark-yellow px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50';

export interface AssetLike {
	id?: string;
	url: string;
	kind?: 'image' | 'animated' | 'document';
}

const ACCEPT: Record<SiteMediaUploadOptions['mediaKind'], string> = {
	image: 'image/jpeg,image/png,image/webp',
	animated: 'image/webp',
	document: 'application/pdf',
};

/**
 * Pick a file → upload to the media library → confirm. Returns the new asset; the
 * caller decides what to attach it to (nothing goes live from the upload alone).
 */
export function UploadButton({
	label,
	options,
	onUploaded,
	multiple = false,
	disabled,
}: {
	label: string;
	options: SiteMediaUploadOptions;
	onUploaded: (asset: { id: string; url: string }) => void;
	multiple?: boolean;
	disabled?: boolean;
}) {
	const input = useRef<HTMLInputElement>(null);
	const confirm = trpc.siteContent.confirmMedia.useMutation();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		e.target.value = '';
		if (files.length === 0) return;
		setBusy(true);
		setError(null);
		try {
			for (const file of files) {
				const confirmInput = await uploadSiteMedia(file, options);
				onUploaded(await confirm.mutateAsync(confirmInput));
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Upload failed');
		} finally {
			setBusy(false);
		}
	}

	return (
		<span className="inline-flex flex-col gap-1">
			<button
				type="button"
				className={buttonClass}
				disabled={disabled || busy}
				onClick={() => input.current?.click()}
			>
				{busy ? 'Uploading…' : label}
			</button>
			<input
				ref={input}
				type="file"
				hidden
				multiple={multiple}
				accept={ACCEPT[options.mediaKind]}
				onChange={onFiles}
			/>
			{error && <span className="text-xs text-red-400">{error}</span>}
		</span>
	);
}

/** Small preview for an image/animation/PDF (plain <img>: admin-only, no optimizer cost). */
export function AssetPreview({
	asset,
	className = 'h-16 w-24',
}: {
	asset: AssetLike | null | undefined;
	className?: string;
}) {
	if (!asset) {
		return (
			<div
				className={`${className} flex items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground`}
			>
				none
			</div>
		);
	}
	if (asset.kind === 'document' || asset.url.endsWith('.pdf')) {
		return (
			<a
				href={asset.url}
				target="_blank"
				rel="noreferrer"
				className="text-xs text-ieee-bright-yellow underline"
			>
				Open PDF
			</a>
		);
	}
	// eslint-disable-next-line @next/next/no-img-element
	return <img src={asset.url} alt="" className={`${className} rounded object-cover`} />;
}

export function Banner({
	kind,
	text,
	onClose,
}: {
	kind: 'ok' | 'err';
	text: string;
	onClose: () => void;
}) {
	return (
		<div
			className={`mb-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
				kind === 'ok'
					? 'border-green-800 bg-green-900/30 text-green-200'
					: 'border-red-800 bg-red-900/30 text-red-200'
			}`}
		>
			<span>{text}</span>
			<button
				type="button"
				onClick={onClose}
				className="text-xs opacity-70 hover:opacity-100"
			>
				dismiss
			</button>
		</div>
	);
}

const STATUS_STYLE: Record<string, string> = {
	published: 'text-green-400',
	pending: 'text-amber-300',
	rejected: 'text-red-400',
	superseded: 'text-muted-foreground',
};

export function StatusTag({ status }: { status: string }) {
	return (
		<span className={`text-xs font-semibold uppercase ${STATUS_STYLE[status] ?? ''}`}>
			{status}
		</span>
	);
}

type EntityType = 'officer_profile' | 'sponsor' | 'slot' | 'committee_page' | 'project_page';

/** Revision history for one item, with Restore (staff only — the router enforces it). */
export function HistoryPanel({
	entityType,
	entityId,
}: {
	entityType: EntityType;
	entityId: string;
}) {
	const utils = trpc.useUtils();
	const history = trpc.siteContent.history.useQuery({ entityType, entityId });
	const restore = trpc.siteContent.restore.useMutation({
		onSuccess: () => {
			void utils.siteContent.invalidate();
		},
	});
	const data = history.data;

	if (history.isLoading) return <p className="text-xs text-muted-foreground">Loading history…</p>;
	if (!data || data.items.length === 0)
		return <p className="text-xs text-muted-foreground">No history yet.</p>;

	return (
		<ul className="space-y-2">
			{data.items.map((r) => (
				<li key={r.id} className="rounded border border-border p-2 text-xs">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span>
							<StatusTag status={r.status} /> ·{' '}
							{new Date(r.createdAt).toLocaleString()} ·{' '}
							{r.authorFirstName
								? `${r.authorFirstName} ${r.authorLastName}`
								: 'unknown'}
						</span>
						{(r.status === 'superseded' || r.status === 'rejected') && (
							<button
								type="button"
								className={buttonClass}
								disabled={restore.isPending}
								onClick={() => restore.mutate({ revisionId: r.id })}
							>
								Restore this version
							</button>
						)}
					</div>
					{r.reviewNote && (
						<p className="mt-1 text-muted-foreground">Note: {r.reviewNote}</p>
					)}
					<SnapshotView snapshot={r.snapshot} assets={data.assets} />
				</li>
			))}
			{restore.error && <li className="text-xs text-red-400">{restore.error.message}</li>}
		</ul>
	);
}

/** Readable key/value dump of a snapshot; asset ids render as thumbnails. */
export function SnapshotView({
	snapshot,
	assets,
	compareTo,
}: {
	snapshot: unknown;
	assets: Record<string, AssetLike>;
	/** When given, only fields that differ are shown (review diff). */
	compareTo?: unknown;
}) {
	if (!snapshot || typeof snapshot !== 'object') return null;
	const before = (compareTo && typeof compareTo === 'object' ? compareTo : null) as Record<
		string,
		unknown
	> | null;
	const entries = Object.entries(snapshot as Record<string, unknown>).filter(
		([k, v]) => !before || JSON.stringify(before[k]) !== JSON.stringify(v),
	);
	if (entries.length === 0) return <p className="mt-1 text-muted-foreground">No changes.</p>;

	const render = (k: string, v: unknown) => {
		if (k.endsWith('AssetId'))
			return typeof v === 'string' ? (
				<AssetPreview asset={assets[v]} className="h-12 w-16" />
			) : (
				'—'
			);
		if (k.endsWith('AssetIds') && Array.isArray(v)) {
			return (
				<span className="flex flex-wrap gap-1">
					{v.length === 0
						? '—'
						: v.map((id) => (
								<AssetPreview
									key={String(id)}
									asset={assets[String(id)]}
									className="h-12 w-16"
								/>
							))}
				</span>
			);
		}
		if (v === null || v === '') return '—';
		return String(v);
	};

	return (
		<dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
			{entries.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-muted-foreground">{k}</dt>
					<dd className="break-words">
						{before ? (
							<span className="flex flex-wrap items-center gap-2">
								<span className="text-muted-foreground line-through">
									{render(k, before[k])}
								</span>
								<span>→</span>
								<span>{render(k, v)}</span>
							</span>
						) : (
							render(k, v)
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}
