'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import { TogglePill } from '@/components/ui/toggle-pill';
import {
	AssetPreview,
	Banner,
	buttonClass,
	fieldClass,
	HistoryPanel,
	primaryButtonClass,
	SnapshotView,
	StatusTag,
	UploadButton,
} from './shared';

type Tab = 'review' | 'media' | 'officers' | 'sponsors' | 'documents' | 'editors';

const TABS: { id: Tab; label: string }[] = [
	{ id: 'review', label: 'Review queue' },
	{ id: 'media', label: 'Page media' },
	{ id: 'officers', label: 'Officers' },
	{ id: 'sponsors', label: 'Sponsors' },
	{ id: 'documents', label: 'Documents' },
	{ id: 'editors', label: 'Page editors' },
];

/** /admin/site-content — everything a manage_site_content holder can edit. */
export function SiteContentManager() {
	const [tab, setTab] = useState<Tab>('review');
	const pending = trpc.siteContent.listPending.useQuery();
	const pendingCount = pending.data?.items.length ?? 0;
	const refresh = trpc.siteContent.refreshCache.useMutation();

	return (
		<div className="text-foreground">
			<div className="mb-6 flex flex-wrap items-center gap-2">
				{TABS.map((t) => (
					<TogglePill key={t.id} selected={tab === t.id} onClick={() => setTab(t.id)}>
						{t.label}
						{t.id === 'review' && pendingCount > 0 ? ` (${pendingCount})` : ''}
					</TogglePill>
				))}
				<button
					type="button"
					className={`${buttonClass} ml-auto`}
					disabled={refresh.isPending}
					onClick={() => refresh.mutate()}
					title="Public pages (including event pages) refresh automatically when you save. Use this after a bulk import or a database script."
				>
					{refresh.isSuccess ? 'Public pages refreshed' : 'Refresh public pages'}
				</button>
			</div>
			{tab === 'review' && <ReviewQueue />}
			{tab === 'media' && <PageMedia kind="media" />}
			{tab === 'officers' && <Officers />}
			{tab === 'sponsors' && <Sponsors />}
			{tab === 'documents' && <PageMedia kind="documents" />}
			{tab === 'editors' && <PageEditors />}
		</div>
	);
}

// ─────────────────────────── review queue ───────────────────────────

function ReviewQueue() {
	const utils = trpc.useUtils();
	const pending = trpc.siteContent.listPending.useQuery();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const done = () => void utils.siteContent.invalidate();
	const approve = trpc.siteContent.approve.useMutation({ onSuccess: done });
	const reject = trpc.siteContent.reject.useMutation({ onSuccess: done });

	if (pending.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
	const items = pending.data?.items ?? [];
	if (items.length === 0) {
		return <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>;
	}
	const assets = pending.data?.assets ?? {};

	return (
		<ul className="space-y-4">
			{items.map((r) => (
				<li key={r.id} className="rounded-lg border border-border bg-card/50 p-4">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h3 className="text-sm font-semibold">{r.label}</h3>
						<span className="text-xs text-muted-foreground">
							by{' '}
							{r.authorFirstName
								? `${r.authorFirstName} ${r.authorLastName}`
								: 'unknown'}{' '}
							· {new Date(r.createdAt).toLocaleString()}
						</span>
					</div>
					<p className="mt-2 text-xs text-muted-foreground">Changes (live → proposed):</p>
					<div className="text-xs">
						<SnapshotView snapshot={r.snapshot} compareTo={r.current} assets={assets} />
					</div>
					{r.previewPath && (
						<Link
							href={r.previewPath}
							target="_blank"
							className="mt-2 inline-block text-xs text-ieee-bright-yellow underline"
						>
							Preview as page ↗
						</Link>
					)}
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<input
							placeholder="Note to the author (optional)"
							value={notes[r.id] ?? ''}
							onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
							className={`${fieldClass} max-w-md`}
						/>
						<button
							type="button"
							className={primaryButtonClass}
							disabled={approve.isPending}
							onClick={() =>
								approve.mutate({ revisionId: r.id, note: notes[r.id] || null })
							}
						>
							Approve &amp; publish
						</button>
						<button
							type="button"
							className={buttonClass}
							disabled={reject.isPending}
							onClick={() =>
								reject.mutate({ revisionId: r.id, note: notes[r.id] || null })
							}
						>
							Reject
						</button>
					</div>
				</li>
			))}
			{(approve.error || reject.error) && (
				<li className="text-sm text-red-400">
					{approve.error?.message ?? reject.error?.message}
				</li>
			)}
		</ul>
	);
}

// ─────────────────────────── page media + documents ───────────────────────────

type Slot = RouterOutputs['siteContent']['listSlots'][number];

function defaultPreview(slot: Slot) {
	if (slot.kind === 'document') return { url: slot.defaultSrc, kind: 'document' as const };
	return { url: slot.kind === 'animated' ? `${slot.defaultSrc}.webp` : slot.defaultSrc };
}

function PageMedia({ kind }: { kind: 'media' | 'documents' }) {
	const utils = trpc.useUtils();
	const slots = trpc.siteContent.listSlots.useQuery();
	const setSlot = trpc.siteContent.setSlot.useMutation({
		onSuccess: () => void utils.siteContent.invalidate(),
	});
	const [historyFor, setHistoryFor] = useState<string | null>(null);

	if (slots.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
	const rows = (slots.data ?? []).filter((s) =>
		kind === 'documents' ? s.kind === 'document' : s.kind !== 'document',
	);
	const pages = [...new Set(rows.map((s) => s.page))];

	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">
				Uploading replaces what the public page shows as soon as you save. &ldquo;Reset to
				default&rdquo; goes back to the original built-in file. Every change is kept in
				History.
			</p>
			{setSlot.error && <p className="text-sm text-red-400">{setSlot.error.message}</p>}
			{pages.map((page) => (
				<section key={page}>
					<h3 className="mb-3 font-heading text-lg text-ieee-dark-yellow">{page}</h3>
					<div className="space-y-3">
						{rows
							.filter((s) => s.page === page)
							.map((s) => (
								<Fragment key={s.key}>
									<div className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
										<AssetPreview asset={s.asset ?? defaultPreview(s)} />
										<div className="min-w-48 flex-1">
											<p className="text-sm font-medium">{s.label}</p>
											<p className="text-xs text-muted-foreground">
												{s.asset ? 'Custom upload' : 'Built-in default'}
												{s.aspectHint ? ` · ${s.aspectHint}` : ''}
												{s.kind === 'animated'
													? ' · animated WebP or a still image'
													: ''}
											</p>
										</div>
										<div className="flex flex-wrap items-start gap-2">
											{s.kind === 'animated' && (
												<UploadButton
													label="Upload animation"
													options={{ mediaKind: 'animated' }}
													onUploaded={(a) =>
														setSlot.mutate({
															slotKey: s.key,
															assetId: a.id,
														})
													}
												/>
											)}
											<UploadButton
												label={
													s.kind === 'document'
														? 'Upload PDF'
														: 'Upload image'
												}
												options={{
													mediaKind:
														s.kind === 'document'
															? 'document'
															: 'image',
												}}
												onUploaded={(a) =>
													setSlot.mutate({
														slotKey: s.key,
														assetId: a.id,
													})
												}
											/>
											{s.asset && (
												<button
													type="button"
													className={buttonClass}
													onClick={() =>
														setSlot.mutate({
															slotKey: s.key,
															assetId: null,
														})
													}
												>
													Reset to default
												</button>
											)}
											<button
												type="button"
												className={buttonClass}
												onClick={() =>
													setHistoryFor(
														historyFor === s.key ? null : s.key,
													)
												}
											>
												History
											</button>
										</div>
									</div>
									{historyFor === s.key && (
										<div className="ml-4 border-l border-border pl-4">
											<HistoryPanel entityType="slot" entityId={s.key} />
										</div>
									)}
								</Fragment>
							))}
					</div>
				</section>
			))}
		</div>
	);
}

// ─────────────────────────── officers ───────────────────────────

type OfficerRow = RouterOutputs['siteContent']['listOfficers'][number];

interface OfficerForm {
	memberId: string;
	displayName: string;
	roleTitle: string;
	group: 'executive' | 'chair';
	major: string;
	yearLabel: string;
	bio: string;
	linkedinUrl: string;
	portraitAssetId: string | null;
	portraitUrl: string | null;
	active: boolean;
}

function officerForm(o: OfficerRow | null): OfficerForm {
	return {
		memberId: o?.memberId ?? '',
		displayName: o?.displayName ?? '',
		roleTitle: o?.roleTitle ?? '',
		group: o?.group ?? 'chair',
		major: o?.major ?? '',
		yearLabel: o?.yearLabel ?? '',
		bio: o?.bio ?? '',
		linkedinUrl: o?.linkedinUrl ?? '',
		portraitAssetId: o?.portraitAssetId ?? null,
		portraitUrl: o?.portrait?.url ?? null,
		active: o?.active ?? true,
	};
}

function Officers() {
	const utils = trpc.useUtils();
	const officers = trpc.siteContent.listOfficers.useQuery();
	const members = trpc.siteContent.memberOptions.useQuery();
	const refresh = () => void utils.siteContent.invalidate();
	const create = trpc.siteContent.createOfficer.useMutation({ onSuccess: refresh });
	const update = trpc.siteContent.updateOfficer.useMutation({ onSuccess: refresh });
	const del = trpc.siteContent.deleteOfficer.useMutation({ onSuccess: refresh });
	const reorder = trpc.siteContent.reorderOfficers.useMutation({ onSuccess: refresh });
	const [editing, setEditing] = useState<OfficerRow | 'new' | null>(null);
	const [form, setForm] = useState<OfficerForm>(officerForm(null));
	const [historyFor, setHistoryFor] = useState<string | null>(null);
	const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const rows = officers.data ?? [];
	const set = <K extends keyof OfficerForm>(k: K, v: OfficerForm[K]) =>
		setForm((f) => ({ ...f, [k]: v }));

	function open(o: OfficerRow | 'new') {
		setEditing(o);
		setForm(officerForm(o === 'new' ? null : o));
	}

	async function save(e: React.FormEvent) {
		e.preventDefault();
		const snapshot = {
			memberId: form.memberId || null,
			displayName: form.displayName,
			roleTitle: form.roleTitle,
			group: form.group,
			major: form.major || null,
			yearLabel: form.yearLabel || null,
			bio: form.bio || null,
			linkedinUrl: form.linkedinUrl || null,
			portraitAssetId: form.portraitAssetId,
			active: form.active,
		};
		try {
			if (editing === 'new') await create.mutateAsync(snapshot);
			else if (editing) await update.mutateAsync({ id: editing.id, snapshot });
			setEditing(null);
			setBanner({ kind: 'ok', text: 'Saved and published.' });
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
		}
	}

	function move(index: number, delta: number) {
		const ids = rows.map((r) => r.id);
		const j = index + delta;
		if (j < 0 || j >= ids.length) return;
		[ids[index], ids[j]] = [ids[j], ids[index]];
		reorder.mutate({ ids });
	}

	return (
		<div>
			{banner && <Banner {...banner} onClose={() => setBanner(null)} />}
			<div className="mb-4 flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					The public roster on /about. Link a profile to a member so they can edit their
					own bio and photo (their edits come to the review queue).
				</p>
				<button type="button" className={primaryButtonClass} onClick={() => open('new')}>
					Add officer
				</button>
			</div>

			{editing && (
				<form
					onSubmit={save}
					className="mb-6 space-y-4 rounded-lg border border-border bg-card/50 p-5"
				>
					<h3 className="text-sm font-semibold">
						{editing === 'new' ? 'New officer' : `Edit ${editing.displayName}`}
					</h3>
					<div className="flex flex-wrap items-center gap-4">
						<AssetPreview
							asset={form.portraitUrl ? { url: form.portraitUrl } : null}
							className="h-24 w-20"
						/>
						<UploadButton
							label="Upload portrait"
							options={{ mediaKind: 'image' }}
							onUploaded={(a) =>
								setForm((f) => ({
									...f,
									portraitAssetId: a.id,
									portraitUrl: a.url,
								}))
							}
						/>
						{form.portraitAssetId && (
							<button
								type="button"
								className={buttonClass}
								onClick={() =>
									setForm((f) => ({
										...f,
										portraitAssetId: null,
										portraitUrl: null,
									}))
								}
							>
								Remove portrait
							</button>
						)}
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Labeled label="Name">
							<input
								required
								value={form.displayName}
								onChange={(e) => set('displayName', e.target.value)}
								className={fieldClass}
							/>
						</Labeled>
						<Labeled label="Role (e.g. Software Chair)">
							<input
								required
								value={form.roleTitle}
								onChange={(e) => set('roleTitle', e.target.value)}
								className={fieldClass}
							/>
						</Labeled>
						<Labeled label="Group">
							<select
								value={form.group}
								onChange={(e) =>
									set('group', e.target.value as OfficerForm['group'])
								}
								className={fieldClass}
							>
								<option value="executive">Executive board</option>
								<option value="chair">Chairs</option>
							</select>
						</Labeled>
						<Labeled label="Linked member (can edit their own profile)">
							<select
								value={form.memberId}
								onChange={(e) => set('memberId', e.target.value)}
								className={fieldClass}
							>
								<option value="">— not linked —</option>
								{(members.data ?? []).map((m) => (
									<option key={m.id} value={m.id}>
										{m.firstName} {m.lastName}
									</option>
								))}
							</select>
						</Labeled>
						<Labeled label="Major">
							<input
								value={form.major}
								onChange={(e) => set('major', e.target.value)}
								className={fieldClass}
							/>
						</Labeled>
						<Labeled label="Year (e.g. 3rd Year)">
							<input
								value={form.yearLabel}
								onChange={(e) => set('yearLabel', e.target.value)}
								className={fieldClass}
							/>
						</Labeled>
						<Labeled label="LinkedIn URL">
							<input
								value={form.linkedinUrl}
								onChange={(e) => set('linkedinUrl', e.target.value)}
								className={fieldClass}
								placeholder="https://www.linkedin.com/in/…"
							/>
						</Labeled>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={form.active}
								onChange={(e) => set('active', e.target.checked)}
							/>
							Current officer (shown on /about)
						</label>
					</div>
					<Labeled label="Bio">
						<textarea
							rows={4}
							value={form.bio}
							onChange={(e) => set('bio', e.target.value)}
							className={fieldClass}
						/>
					</Labeled>
					<div className="flex gap-2">
						<button
							type="submit"
							className={primaryButtonClass}
							disabled={create.isPending || update.isPending}
						>
							Save &amp; publish
						</button>
						<button
							type="button"
							className={buttonClass}
							onClick={() => setEditing(null)}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{officers.isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No officer profiles yet — /about is showing its built-in roster. Run the import
					or add officers here.
				</p>
			) : (
				<ul className="space-y-2">
					{rows.map((o, i) => (
						<Fragment key={o.id}>
							<li className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
								<AssetPreview asset={o.portrait} className="h-16 w-14" />
								<div className="min-w-48 flex-1">
									<p className="text-sm font-medium">
										{o.displayName}{' '}
										{!o.active && (
											<span className="text-xs text-muted-foreground">
												(past)
											</span>
										)}
									</p>
									<p className="text-xs text-muted-foreground">
										{o.roleTitle} ·{' '}
										{o.group === 'executive' ? 'Executive' : 'Chair'}
										{o.linkedMemberName
											? ` · linked to ${o.linkedMemberName}`
											: ''}
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className={buttonClass}
										onClick={() => move(i, -1)}
										disabled={i === 0}
									>
										↑
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => move(i, 1)}
										disabled={i === rows.length - 1}
									>
										↓
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => open(o)}
									>
										Edit
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() =>
											setHistoryFor(historyFor === o.id ? null : o.id)
										}
									>
										History
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => {
											if (
												confirm(
													`Delete ${o.displayName}? Prefer unticking "Current officer" to keep history.`,
												)
											) {
												del.mutate({ id: o.id });
											}
										}}
									>
										Delete
									</button>
								</div>
							</li>
							{historyFor === o.id && (
								<li className="ml-4 border-l border-border pl-4">
									<HistoryPanel entityType="officer_profile" entityId={o.id} />
								</li>
							)}
						</Fragment>
					))}
				</ul>
			)}
		</div>
	);
}

// ─────────────────────────── sponsors ───────────────────────────

type SponsorRow = RouterOutputs['siteContent']['listSponsors'][number];

interface SponsorForm {
	companyName: string;
	tier: 'Bronze' | 'Silver' | 'Gold';
	description: string;
	websiteUrl: string;
	logoAssetId: string | null;
	logoUrl: string | null;
	active: boolean;
}

function sponsorForm(s: SponsorRow | null): SponsorForm {
	return {
		companyName: s?.companyName ?? '',
		tier: s?.tier ?? 'Gold',
		description: s?.description ?? '',
		websiteUrl: s?.websiteUrl ?? '',
		logoAssetId: s?.logoAssetId ?? null,
		logoUrl: s?.logo?.url ?? null,
		active: s?.active ?? true,
	};
}

function Sponsors() {
	const utils = trpc.useUtils();
	const sponsors = trpc.siteContent.listSponsors.useQuery();
	const refresh = () => void utils.siteContent.invalidate();
	const create = trpc.siteContent.createSponsor.useMutation({ onSuccess: refresh });
	const update = trpc.siteContent.updateSponsor.useMutation({ onSuccess: refresh });
	const del = trpc.siteContent.deleteSponsor.useMutation({ onSuccess: refresh });
	const reorder = trpc.siteContent.reorderSponsors.useMutation({ onSuccess: refresh });
	const [editing, setEditing] = useState<SponsorRow | 'new' | null>(null);
	const [form, setForm] = useState<SponsorForm>(sponsorForm(null));
	const [historyFor, setHistoryFor] = useState<string | null>(null);
	const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const rows = sponsors.data ?? [];
	const set = <K extends keyof SponsorForm>(k: K, v: SponsorForm[K]) =>
		setForm((f) => ({ ...f, [k]: v }));

	function open(s: SponsorRow | 'new') {
		setEditing(s);
		setForm(sponsorForm(s === 'new' ? null : s));
	}

	async function save(e: React.FormEvent) {
		e.preventDefault();
		const snapshot = {
			companyName: form.companyName,
			tier: form.tier,
			description: form.description || null,
			websiteUrl: form.websiteUrl || null,
			logoAssetId: form.logoAssetId,
			active: form.active,
		};
		try {
			if (editing === 'new') await create.mutateAsync(snapshot);
			else if (editing) await update.mutateAsync({ id: editing.id, snapshot });
			setEditing(null);
			setBanner({ kind: 'ok', text: 'Saved and published.' });
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
		}
	}

	function move(index: number, delta: number) {
		const ids = rows.map((r) => r.id);
		const j = index + delta;
		if (j < 0 || j >= ids.length) return;
		[ids[index], ids[j]] = [ids[j], ids[index]];
		reorder.mutate({ ids });
	}

	return (
		<div>
			{banner && <Banner {...banner} onClose={() => setBanner(null)} />}
			<div className="mb-4 flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					The sponsor carousel on /sponsorships (active sponsors, in this order).
				</p>
				<button type="button" className={primaryButtonClass} onClick={() => open('new')}>
					Add sponsor
				</button>
			</div>

			{editing && (
				<form
					onSubmit={save}
					className="mb-6 space-y-4 rounded-lg border border-border bg-card/50 p-5"
				>
					<h3 className="text-sm font-semibold">
						{editing === 'new' ? 'New sponsor' : `Edit ${editing.companyName}`}
					</h3>
					<div className="flex flex-wrap items-center gap-4">
						<AssetPreview
							asset={form.logoUrl ? { url: form.logoUrl } : null}
							className="h-16 w-28 bg-white/5 object-contain"
						/>
						<UploadButton
							label="Upload logo"
							options={{ mediaKind: 'image' }}
							onUploaded={(a) =>
								setForm((f) => ({ ...f, logoAssetId: a.id, logoUrl: a.url }))
							}
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Labeled label="Company">
							<input
								required
								value={form.companyName}
								onChange={(e) => set('companyName', e.target.value)}
								className={fieldClass}
							/>
						</Labeled>
						<Labeled label="Tier">
							<select
								value={form.tier}
								onChange={(e) => set('tier', e.target.value as SponsorForm['tier'])}
								className={fieldClass}
							>
								<option>Gold</option>
								<option>Silver</option>
								<option>Bronze</option>
							</select>
						</Labeled>
						<Labeled label="Website">
							<input
								value={form.websiteUrl}
								onChange={(e) => set('websiteUrl', e.target.value)}
								className={fieldClass}
								placeholder="https://…"
							/>
						</Labeled>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={form.active}
								onChange={(e) => set('active', e.target.checked)}
							/>
							Show on /sponsorships
						</label>
					</div>
					<Labeled label="Description (internal)">
						<textarea
							rows={3}
							value={form.description}
							onChange={(e) => set('description', e.target.value)}
							className={fieldClass}
						/>
					</Labeled>
					<div className="flex gap-2">
						<button
							type="submit"
							className={primaryButtonClass}
							disabled={create.isPending || update.isPending}
						>
							Save &amp; publish
						</button>
						<button
							type="button"
							className={buttonClass}
							onClick={() => setEditing(null)}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{sponsors.isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No sponsors yet — /sponsorships is showing its built-in list.
				</p>
			) : (
				<ul className="space-y-2">
					{rows.map((s, i) => (
						<Fragment key={s.id}>
							<li className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
								<AssetPreview asset={s.logo} className="h-12 w-24 object-contain" />
								<div className="min-w-48 flex-1">
									<p className="text-sm font-medium">
										{s.companyName}{' '}
										{!s.active && (
											<span className="text-xs text-muted-foreground">
												(hidden)
											</span>
										)}
									</p>
									<p className="text-xs text-muted-foreground">{s.tier}</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className={buttonClass}
										onClick={() => move(i, -1)}
										disabled={i === 0}
									>
										↑
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => move(i, 1)}
										disabled={i === rows.length - 1}
									>
										↓
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => open(s)}
									>
										Edit
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() =>
											setHistoryFor(historyFor === s.id ? null : s.id)
										}
									>
										History
									</button>
									<button
										type="button"
										className={buttonClass}
										onClick={() => {
											if (
												confirm(
													`Delete ${s.companyName}? Prefer hiding it to keep history.`,
												)
											)
												del.mutate({ id: s.id });
										}}
									>
										Delete
									</button>
								</div>
							</li>
							{historyFor === s.id && (
								<li className="ml-4 border-l border-border pl-4">
									<HistoryPanel entityType="sponsor" entityId={s.id} />
								</li>
							)}
						</Fragment>
					))}
				</ul>
			)}
		</div>
	);
}

// ─────────────────────────── page editors ───────────────────────────

function PageEditors() {
	const utils = trpc.useUtils();
	const pages = trpc.siteContent.editablePages.useQuery();
	const members = trpc.siteContent.memberOptions.useQuery();
	const editors = trpc.siteContent.listPageEditors.useQuery();
	const refresh = () => void utils.siteContent.invalidate();
	const assign = trpc.siteContent.assignPageEditor.useMutation({ onSuccess: refresh });
	const revoke = trpc.siteContent.revokePageEditor.useMutation({ onSuccess: refresh });
	const [pageKey, setPageKey] = useState('');
	const [memberId, setMemberId] = useState('');
	const [expires, setExpires] = useState('');

	function submit(e: React.FormEvent) {
		e.preventDefault();
		const [scopeType, scopeId] = pageKey.split(':') as ['committee' | 'project', string];
		if (!scopeId || !memberId) return;
		assign.mutate({
			scopeType,
			scopeId,
			memberId,
			expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
		});
	}

	const allPages = pages.data ?? [];

	return (
		<div className="space-y-8">
			<section>
				<h3 className="mb-2 font-heading text-lg text-ieee-dark-yellow">
					Committee &amp; project pages
				</h3>
				<p className="mb-3 text-sm text-muted-foreground">
					Chairs and project leads can already edit their own page. Their edits come to
					the review queue.
				</p>
				<ul className="space-y-1 text-sm">
					{allPages.map((p) => (
						<li key={`${p.type}:${p.id}`} className="flex flex-wrap items-center gap-3">
							<span className="w-20 text-xs text-muted-foreground uppercase">
								{p.type}
							</span>
							<span className="min-w-48">{p.title}</span>
							<StatusTag status={p.published ? 'published' : 'superseded'} />
							{p.slug ? (
								<>
									<Link
										href={`/pages/${p.type}/${p.slug}/edit`}
										className="text-xs text-ieee-bright-yellow underline"
									>
										Edit page
									</Link>
									{p.published && (
										<Link
											href={`/${p.type === 'committee' ? 'committees' : 'projects'}/${p.slug}`}
											className="text-xs underline"
										>
											View
										</Link>
									)}
								</>
							) : (
								<span className="text-xs text-muted-foreground">
									needs a slug before it can have a page
								</span>
							)}
						</li>
					))}
				</ul>
			</section>

			<section>
				<h3 className="mb-2 font-heading text-lg text-ieee-dark-yellow">
					Assign an editor
				</h3>
				<form onSubmit={submit} className="flex flex-wrap items-end gap-3">
					<Labeled label="Page">
						<select
							required
							value={pageKey}
							onChange={(e) => setPageKey(e.target.value)}
							className={fieldClass}
						>
							<option value="">Choose…</option>
							{allPages.map((p) => (
								<option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>
									{p.type === 'committee' ? 'Committee' : 'Project'}: {p.title}
								</option>
							))}
						</select>
					</Labeled>
					<Labeled label="Member">
						<select
							required
							value={memberId}
							onChange={(e) => setMemberId(e.target.value)}
							className={fieldClass}
						>
							<option value="">Choose…</option>
							{(members.data ?? []).map((m) => (
								<option key={m.id} value={m.id}>
									{m.firstName} {m.lastName}
								</option>
							))}
						</select>
					</Labeled>
					<Labeled label="Expires (optional)">
						<input
							type="date"
							value={expires}
							onChange={(e) => setExpires(e.target.value)}
							className={fieldClass}
						/>
					</Labeled>
					<button
						type="submit"
						className={primaryButtonClass}
						disabled={assign.isPending}
					>
						Assign
					</button>
				</form>
				{assign.error && (
					<p className="mt-2 text-sm text-red-400">{assign.error.message}</p>
				)}
			</section>

			<section>
				<h3 className="mb-2 font-heading text-lg text-ieee-dark-yellow">
					Assigned editors
				</h3>
				{(editors.data ?? []).length === 0 ? (
					<p className="text-sm text-muted-foreground">No one assigned yet.</p>
				) : (
					<ul className="space-y-1 text-sm">
						{(editors.data ?? []).map((e) => {
							const expired = e.expiresAt && new Date(e.expiresAt) < new Date();
							return (
								<li key={e.id} className="flex flex-wrap items-center gap-3">
									<span className="min-w-40">
										{e.firstName} {e.lastName}
									</span>
									<span className="min-w-48 text-muted-foreground">
										{e.scopeType}: {e.scopeTitle}
									</span>
									<span
										className={`text-xs ${expired ? 'text-red-400' : 'text-muted-foreground'}`}
									>
										{e.expiresAt
											? `${expired ? 'expired' : 'until'} ${new Date(e.expiresAt).toLocaleDateString()}`
											: 'no expiry'}
									</span>
									<button
										type="button"
										className={buttonClass}
										onClick={() => revoke.mutate({ id: e.id })}
									>
										Remove
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="mb-1 block text-xs text-muted-foreground">{label}</span>
			{children}
		</label>
	);
}
