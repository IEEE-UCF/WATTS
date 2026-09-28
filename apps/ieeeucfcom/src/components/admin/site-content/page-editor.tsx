'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import {
	AssetPreview,
	Banner,
	buttonClass,
	fieldClass,
	HistoryPanel,
	primaryButtonClass,
	StatusTag,
	UploadButton,
} from './shared';

interface FormState {
	tagline: string;
	body: string;
	applyUrl: string;
	heroAssetId: string | null;
	galleryAssetIds: string[];
	published: boolean;
}

/**
 * Editor for one committee/project page. Staff (manage_site_content) publish
 * directly; chairs, leads and assigned editors submit to the review queue.
 */
export function PageEditor({ type, slug }: { type: 'committee' | 'project'; slug: string }) {
	const utils = trpc.useUtils();
	const page = trpc.siteContent.pageForEdit.useQuery({ type, slug }, { retry: false });
	const refresh = () => void utils.siteContent.invalidate();
	const submitCommittee = trpc.siteContent.submitCommitteePage.useMutation({
		onSuccess: refresh,
	});
	const submitProject = trpc.siteContent.submitProjectPage.useMutation({ onSuccess: refresh });
	const [form, setForm] = useState<FormState | null>(null);
	const [urls, setUrls] = useState<Record<string, string>>({});
	const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	useEffect(() => {
		if (!page.data || form) return;
		const s = page.data.snapshot;
		setForm({
			tagline: s.tagline ?? '',
			body: 'about' in s ? s.about : s.overview,
			applyUrl: 'applyUrl' in s ? (s.applyUrl ?? '') : '',
			heroAssetId: s.heroAssetId,
			galleryAssetIds: s.galleryAssetIds,
			published: s.published,
		});
		setUrls(Object.fromEntries(page.data.assets.map((a) => [a.id, a.url])));
	}, [page.data, form]);

	if (page.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
	if (page.error) return <p className="text-sm text-red-400">{page.error.message}</p>;
	if (!page.data || !form) return null;

	const data = page.data;
	const scope = { scopeType: type, scopeId: data.id } as const;
	const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
		setForm((f) => (f ? { ...f, [k]: v } : f));
	const addUrl = (a: { id: string; url: string }) => setUrls((u) => ({ ...u, [a.id]: a.url }));

	function moveGallery(i: number, delta: number) {
		setForm((f) => {
			if (!f) return f;
			const ids = [...f.galleryAssetIds];
			const j = i + delta;
			if (j < 0 || j >= ids.length) return f;
			[ids[i], ids[j]] = [ids[j], ids[i]];
			return { ...f, galleryAssetIds: ids };
		});
	}

	// draft: staff only — save to the review queue instead of publishing, to preview first.
	async function save(e: React.FormEvent | null, draft = false) {
		e?.preventDefault();
		if (!form) return;
		try {
			const res =
				type === 'committee'
					? await submitCommittee.mutateAsync({
							id: data.id,
							snapshot: {
								tagline: form.tagline || null,
								about: form.body,
								applyUrl: form.applyUrl || null,
								heroAssetId: form.heroAssetId,
								galleryAssetIds: form.galleryAssetIds,
								published: form.published,
							},
							draft,
						})
					: await submitProject.mutateAsync({
							id: data.id,
							snapshot: {
								tagline: form.tagline || null,
								overview: form.body,
								heroAssetId: form.heroAssetId,
								galleryAssetIds: form.galleryAssetIds,
								published: form.published,
							},
							draft,
						});
			setBanner({
				kind: 'ok',
				text:
					res?.status === 'published'
						? 'Saved and published.'
						: draft
							? 'Saved as a draft. Preview it below, then approve it in the Review queue to publish.'
							: 'Submitted for review — it will go live once a website editor approves it.',
			});
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
		}
	}

	const publicPath = `/${type === 'committee' ? 'committees' : 'projects'}/${slug}`;
	const previewPath = `/pages/${type}/${slug}/preview`;
	const pending = submitCommittee.isPending || submitProject.isPending;

	return (
		<div className="text-foreground">
			{banner && <Banner {...banner} onClose={() => setBanner(null)} />}

			<div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
				<span className="text-muted-foreground">Public page:</span>
				{data.snapshot.published ? (
					<Link href={publicPath} className="text-ieee-bright-yellow underline">
						{publicPath}
					</Link>
				) : (
					<span className="text-muted-foreground">not published yet</span>
				)}
				<Link
					href={previewPath}
					target="_blank"
					className="text-ieee-bright-yellow underline"
					title="Opens the last saved version. Unsaved edits aren't included."
				>
					Preview saved page ↗
				</Link>
			</div>

			{data.myLatest && data.myLatest.status !== 'published' && (
				<div className="mb-4 rounded-md border border-border p-3 text-sm">
					Your last submission: <StatusTag status={data.myLatest.status} />{' '}
					<span className="text-muted-foreground">
						({new Date(data.myLatest.createdAt).toLocaleString()})
					</span>{' '}
					<Link
						href={`${previewPath}?revision=${data.myLatest.id}`}
						target="_blank"
						className="text-ieee-bright-yellow underline"
					>
						Preview it ↗
					</Link>
					{data.myLatest.reviewNote && (
						<p className="mt-1 text-muted-foreground">
							Reviewer note: {data.myLatest.reviewNote}
						</p>
					)}
				</div>
			)}

			{!data.canPublish && (
				<p className="mb-4 text-sm text-muted-foreground">
					Your changes are sent to the website editors for review before they appear on
					the site.
				</p>
			)}

			<form
				onSubmit={save}
				className="space-y-5 rounded-lg border border-border bg-card/50 p-5"
			>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">
						Tagline (one line)
					</span>
					<input
						value={form.tagline}
						onChange={(e) => set('tagline', e.target.value)}
						className={fieldClass}
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">
						Description (blank line = new paragraph)
					</span>
					<textarea
						required
						rows={8}
						value={form.body}
						onChange={(e) => set('body', e.target.value)}
						className={fieldClass}
					/>
				</label>
				{type === 'committee' && (
					<label className="block">
						<span className="mb-1 block text-xs text-muted-foreground">
							Apply link (a form URL, or a site path like /connect)
						</span>
						<input
							value={form.applyUrl}
							onChange={(e) => set('applyUrl', e.target.value)}
							className={fieldClass}
							placeholder="/connect"
						/>
					</label>
				)}

				<div>
					<span className="mb-2 block text-xs text-muted-foreground">
						Header image (optional)
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<AssetPreview
							asset={form.heroAssetId ? { url: urls[form.heroAssetId] ?? '' } : null}
							className="h-20 w-36"
						/>
						<UploadButton
							label="Upload header image"
							options={{ mediaKind: 'image', ...scope }}
							onUploaded={(a) => {
								addUrl(a);
								set('heroAssetId', a.id);
							}}
						/>
						{form.heroAssetId && (
							<button
								type="button"
								className={buttonClass}
								onClick={() => set('heroAssetId', null)}
							>
								Remove
							</button>
						)}
					</div>
				</div>

				<div>
					<span className="mb-2 block text-xs text-muted-foreground">Photo carousel</span>
					<div className="mb-3 flex flex-wrap gap-3">
						{form.galleryAssetIds.length === 0 && (
							<p className="text-sm text-muted-foreground">No photos yet.</p>
						)}
						{form.galleryAssetIds.map((id, i) => (
							<div key={id} className="flex flex-col items-center gap-1">
								<AssetPreview
									asset={{ url: urls[id] ?? '' }}
									className="h-20 w-28"
								/>
								<div className="flex gap-1">
									<button
										type="button"
										className={buttonClass}
										onClick={() => moveGallery(i, -1)}
										disabled={i === 0}
									>
										←
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => moveGallery(i, 1)}
										disabled={i === form.galleryAssetIds.length - 1}
									>
										→
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() =>
											set(
												'galleryAssetIds',
												form.galleryAssetIds.filter((x) => x !== id),
											)
										}
									>
										✕
									</button>
								</div>
							</div>
						))}
					</div>
					<UploadButton
						label="Add photos"
						multiple
						options={{ mediaKind: 'image', ...scope }}
						onUploaded={(a) => {
							addUrl(a);
							setForm((f) =>
								f ? { ...f, galleryAssetIds: [...f.galleryAssetIds, a.id] } : f,
							);
						}}
					/>
				</div>

				{data.canPublish && (
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={form.published}
							onChange={(e) => set('published', e.target.checked)}
						/>
						Published (visible at {publicPath})
					</label>
				)}

				<div className="flex flex-wrap gap-2">
					<button type="submit" className={primaryButtonClass} disabled={pending}>
						{data.canPublish ? 'Save & publish' : 'Submit for review'}
					</button>
					{data.canPublish && (
						<button
							type="button"
							className={buttonClass}
							disabled={pending}
							onClick={() => void save(null, true)}
						>
							Save as draft
						</button>
					)}
					{data.canPublish && (
						<button
							type="button"
							className={buttonClass}
							onClick={() => setShowHistory((v) => !v)}
						>
							History
						</button>
					)}
				</div>
			</form>

			{showHistory && data.canPublish && (
				<div className="mt-6">
					<HistoryPanel
						entityType={type === 'committee' ? 'committee_page' : 'project_page'}
						entityId={data.id}
					/>
				</div>
			)}
		</div>
	);
}

/** "Pages you can edit" — shown on /dashboard to chairs, leads and assigned editors. */
export function EditablePagesCard() {
	const pages = trpc.siteContent.editablePages.useQuery();
	const list = (pages.data ?? []).filter((p) => p.via !== 'staff');
	if (list.length === 0) return null;
	return (
		<div className="rounded-lg border border-border bg-card/50 p-4">
			<h2 className="mb-2 text-sm font-semibold text-foreground">Pages you can edit</h2>
			<ul className="space-y-1 text-sm">
				{list.map((p) => (
					<li key={`${p.type}:${p.id}`} className="flex flex-wrap items-center gap-2">
						<span>{p.title}</span>
						<span className="text-xs text-muted-foreground">
							({p.via === 'assigned' ? 'assigned' : p.via})
						</span>
						{p.slug && (
							<Link
								href={`/pages/${p.type}/${p.slug}/edit`}
								className="text-xs text-ieee-bright-yellow underline"
							>
								Edit
							</Link>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
