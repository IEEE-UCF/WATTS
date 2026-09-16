'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@watts/api';
import { uploadProjectPhoto } from '@watts/storage/client';
import { TagInput } from '@/components/tag-input';
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	TableEmpty,
} from '@watts/ui/table';

type AdminProject = RouterOutputs['project']['getAll'][number];
type Category = RouterOutputs['projectCategory']['list'][number];

// ─────────────────────────── categories ───────────────────────────

function CategoryBar({ categories }: { categories: Category[] }) {
	const utils = trpc.useUtils();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const [slug, setSlug] = useState('');

	const invalidate = () => void utils.projectCategory.list.invalidate();
	const create = trpc.projectCategory.create.useMutation({
		onSuccess: () => {
			invalidate();
			setName('');
			setSlug('');
		},
	});
	const setArchived = trpc.projectCategory.setArchived.useMutation({ onSuccess: invalidate });

	return (
		<div className="mb-6 rounded-lg border border-border bg-card/40 p-4">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="text-sm font-semibold text-muted-foreground"
			>
				Categories ({categories.filter((c) => !c.archived).length}) {open ? '▾' : '▸'}
			</button>

			{open && (
				<div className="mt-3 space-y-3">
					<div className="flex flex-wrap gap-2">
						{categories.map((c) => (
							<span
								key={c.id}
								className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
									c.archived
										? 'border-border text-muted-foreground-dim line-through'
										: 'border-input text-foreground'
								}`}
							>
								{c.name}
								<button
									type="button"
									onClick={() => setArchived.mutate({ id: c.id, archived: !c.archived })}
									className="text-muted-foreground-dim hover:text-muted-foreground"
								>
									{c.archived ? '↺' : '×'}
								</button>
							</span>
						))}
					</div>

					<form
						onSubmit={(e) => {
							e.preventDefault();
							create.mutate({ name, slug });
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
						<button
							type="submit"
							disabled={create.isPending}
							className="rounded bg-secondary px-3 py-1 text-foreground disabled:opacity-50"
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

// ─────────────────────────── project create / edit form ───────────────────────────

interface FormState {
	title: string;
	slug: string;
	overview: string;
	projectLead: string;
	hardwareInfo: string;
	softwareInfo: string;
	skills: string;
	categoryId: string;
	discordRoleId: string;
	discordLeadRoleId: string;
	discordChannelId: string;
}

function emptyForm(): FormState {
	return {
		title: '',
		slug: '',
		overview: '',
		projectLead: '',
		hardwareInfo: '',
		softwareInfo: '',
		skills: '',
		categoryId: '',
		discordRoleId: '',
		discordLeadRoleId: '',
		discordChannelId: '',
	};
}

function fromProject(p: AdminProject): FormState {
	return {
		title: p.title,
		slug: p.slug ?? '',
		overview: p.overview,
		projectLead: p.projectLead ?? '',
		hardwareInfo: p.hardwareInfo ?? '',
		softwareInfo: p.softwareInfo ?? '',
		skills: p.skills ?? '',
		categoryId: p.categoryId ?? '',
		discordRoleId: p.discordRoleId ?? '',
		discordLeadRoleId: p.discordLeadRoleId ?? '',
		discordChannelId: p.discordChannelId ?? '',
	};
}

function ProjectForm({
	categories,
	editing,
	onDone,
}: {
	categories: Category[];
	editing: AdminProject | null;
	onDone: () => void;
}) {
	const [form, setForm] = useState<FormState>(editing ? fromProject(editing) : emptyForm());
	const utils = trpc.useUtils();

	const finish = () => {
		void utils.project.getAll.invalidate();
		onDone();
	};
	const create = trpc.project.create.useMutation({ onSuccess: finish });
	const update = trpc.project.update.useMutation({ onSuccess: finish });
	const pending = create.isPending || update.isPending;
	const error = create.error?.message ?? update.error?.message ?? null;

	function set<K extends keyof FormState>(key: K, value: FormState[K]) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		// `null`, not `undefined` — a blanked-out field must explicitly clear the column.
		// `undefined` means "omit this key," which both zod's `.nullish()` and Drizzle's
		// `.set()` treat as "leave unchanged," so a cleared field would silently stick.
		const payload = {
			title: form.title,
			slug: form.slug.trim() || null,
			overview: form.overview,
			projectLead: form.projectLead.trim() || null,
			hardwareInfo: form.hardwareInfo.trim() || null,
			softwareInfo: form.softwareInfo.trim() || null,
			skills: form.skills.trim() || null,
			categoryId: form.categoryId || null,
			discordRoleId: form.discordRoleId.trim() || null,
			discordLeadRoleId: form.discordLeadRoleId.trim() || null,
			discordChannelId: form.discordChannelId.trim() || null,
		};
		if (editing) await update.mutateAsync({ id: editing.id, data: payload });
		else await create.mutateAsync(payload);
	}

	const field = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground';

	return (
		<form onSubmit={submit} className="mb-8 space-y-4 rounded-lg border border-border bg-card/50 p-5">
			<h3 className="text-sm font-semibold text-foreground">
				{editing ? `Edit "${editing.title}"` : 'New project'}
			</h3>

			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Title</span>
					<input required value={form.title} onChange={(e) => set('title', e.target.value)} className={field} />
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Slug (optional)</span>
					<input value={form.slug} onChange={(e) => set('slug', e.target.value)} className={field} />
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Category</span>
					<select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={field}>
						<option value="">— none —</option>
						{categories
							.filter((c) => !c.archived || c.id === form.categoryId)
							.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
					</select>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">
						Lead (plain-text, optional — prefer assigning a lead below)
					</span>
					<input value={form.projectLead} onChange={(e) => set('projectLead', e.target.value)} className={field} />
				</label>
			</div>

			<label className="block">
				<span className="mb-1 block text-xs text-muted-foreground">Overview</span>
				<textarea required rows={3} value={form.overview} onChange={(e) => set('overview', e.target.value)} className={field} />
			</label>

			<div className="grid gap-4 sm:grid-cols-2">
				<TagInput
					label="Hardware skills/tags"
					value={form.hardwareInfo}
					onChange={(v) => set('hardwareInfo', v)}
					placeholder="e.g. Soldering, then Enter"
				/>
				<TagInput
					label="Software skills/tags"
					value={form.softwareInfo}
					onChange={(v) => set('softwareInfo', v)}
					placeholder="e.g. Python, then Enter"
				/>
			</div>

			<TagInput
				label="Other skills/tags"
				value={form.skills}
				onChange={(v) => set('skills', v)}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Discord member role ID</span>
					<input value={form.discordRoleId} onChange={(e) => set('discordRoleId', e.target.value)} className={field} />
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Discord lead role ID</span>
					<input value={form.discordLeadRoleId} onChange={(e) => set('discordLeadRoleId', e.target.value)} className={field} />
				</label>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Discord channel ID</span>
					<input value={form.discordChannelId} onChange={(e) => set('discordChannelId', e.target.value)} className={field} />
				</label>
			</div>

			{error && <p className="text-sm text-red-400">{error}</p>}

			<div className="flex gap-3">
				<button
					type="submit"
					disabled={pending}
					className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
				>
					{pending ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
				</button>
				<button
					type="button"
					onClick={onDone}
					className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground"
				>
					Cancel
				</button>
			</div>
		</form>
	);
}

// ─────────────────────────── membership: add/remove/lead + requests ───────────────────────────

function MembershipPanel({ projectId }: { projectId: string }) {
	const [query, setQuery] = useState('');
	const [pickedId, setPickedId] = useState('');
	const utils = trpc.useUtils();

	const members = trpc.project.listMembers.useQuery({ projectId });
	const allMembers = trpc.member.listForAdmin.useQuery();
	const requests = trpc.project.listMembershipRequests.useQuery({ projectId, status: 'pending' });

	const invalidateMembers = () => {
		void utils.project.listMembers.invalidate({ projectId });
		void utils.project.getAll.invalidate();
	};
	const invalidateRequests = () => {
		void utils.project.listMembershipRequests.invalidate({ projectId, status: 'pending' });
		invalidateMembers();
	};

	const addMember = trpc.project.addMember.useMutation({ onSuccess: invalidateMembers });
	const removeMember = trpc.project.removeMember.useMutation({ onSuccess: invalidateMembers });
	const setLead = trpc.project.setLead.useMutation({ onSuccess: invalidateMembers });
	const approve = trpc.project.approveRequest.useMutation({ onSuccess: invalidateRequests });
	const deny = trpc.project.denyRequest.useMutation({ onSuccess: invalidateRequests });

	const memberIds = useMemo(() => new Set((members.data ?? []).map((m) => m.memberId)), [members.data]);
	const candidates = (allMembers.data ?? []).filter(
		(m) => !memberIds.has(m.id) && `${m.firstName} ${m.lastName}`.toLowerCase().includes(query.toLowerCase()),
	);

	const add = () => {
		if (!pickedId) return;
		addMember.mutate({ projectId, memberId: pickedId });
		setPickedId('');
		setQuery('');
	};

	return (
		<div className="flex flex-col gap-4">
			{requests.data && requests.data.length > 0 && (
				<div className="rounded-md border border-amber-800/60 bg-amber-900/10 p-3">
					<p className="mb-2 text-xs font-semibold text-amber-300">Pending requests</p>
					<div className="flex flex-col gap-2">
						{requests.data.map((r) => (
							<div key={r.id} className="flex items-center justify-between text-xs">
								<span className="text-foreground">
									{r.firstName} {r.lastName}
									{r.message && <span className="ml-1.5 text-muted-foreground-dim">— {r.message}</span>}
								</span>
								<span className="flex gap-2">
									<button
										type="button"
										onClick={() => approve.mutate({ requestId: r.id, projectId })}
										className="text-green-400 hover:underline"
									>
										approve
									</button>
									<button
										type="button"
										onClick={() => deny.mutate({ requestId: r.id, projectId })}
										className="text-red-400 hover:underline"
									>
										deny
									</button>
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-2">
				{(members.data ?? []).map((m) => (
					<div key={m.memberId} className="flex items-center justify-between text-xs">
						<span className="text-foreground">
							{m.firstName} {m.lastName}
							{m.isLead && (
								<span className="ml-1.5 rounded bg-ieee-dark-yellow px-1 py-0.5 font-mono text-[9px] text-black">
									lead
								</span>
							)}
						</span>
						<span className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setLead.mutate({ projectId, memberId: m.memberId, isLead: !m.isLead })}
								className="text-muted-foreground hover:text-foreground"
							>
								{m.isLead ? 'remove lead' : 'make lead'}
							</button>
							<button
								type="button"
								onClick={() => removeMember.mutate({ projectId, memberId: m.memberId })}
								className="text-red-400 hover:underline"
							>
								remove
							</button>
						</span>
					</div>
				))}
				{(members.data ?? []).length === 0 && (
					<p className="text-xs text-muted-foreground-dim">No members yet.</p>
				)}

				<div className="mt-1 flex gap-1.5">
					<input
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setPickedId('');
						}}
						placeholder="Search a member to add directly…"
						className="flex-1 rounded-md border border-input bg-card px-2 py-1 text-xs"
					/>
					<button
						type="button"
						disabled={!pickedId}
						onClick={add}
						className="rounded-md bg-secondary px-2.5 py-1 text-xs text-foreground disabled:opacity-40"
					>
						Add
					</button>
				</div>
				{query && !pickedId && candidates.length > 0 && (
					<div className="flex flex-col rounded-md border border-input">
						{candidates.slice(0, 5).map((c) => (
							<button
								key={c.id}
								type="button"
								onClick={() => {
									setPickedId(c.id);
									setQuery(`${c.firstName} ${c.lastName}`);
								}}
								className="px-2 py-1 text-left text-xs text-foreground hover:bg-secondary"
							>
								{c.firstName} {c.lastName}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// ─────────────────────────── main ───────────────────────────

export function ProjectManager() {
	const utils = trpc.useUtils();
	const { data: projects, isLoading } = trpc.project.getAll.useQuery();
	const { data: categories } = trpc.projectCategory.list.useQuery();

	const [showForm, setShowForm] = useState(false);
	const [editing, setEditing] = useState<AdminProject | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [photoBusy, setPhotoBusy] = useState<string | null>(null);
	const photoRef = useRef<HTMLInputElement>(null);
	const photoTarget = useRef<string | null>(null);
	const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const invalidate = () => void utils.project.getAll.invalidate();

	const del = trpc.project.delete.useMutation({ onSuccess: invalidate });
	const confirmPhoto = trpc.project.confirmPhoto.useMutation();
	const removePhoto = trpc.project.removePhoto.useMutation({ onSuccess: invalidate });

	function openCreate() {
		setEditing(null);
		setShowForm(true);
	}
	function openEdit(p: AdminProject) {
		setEditing(p);
		setShowForm(true);
	}

	function pickPhoto(projectId: string) {
		photoTarget.current = projectId;
		photoRef.current?.click();
	}

	async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		const projectId = photoTarget.current;
		if (!file || !projectId) return;
		setPhotoBusy(projectId);
		try {
			const { photoId } = await uploadProjectPhoto(projectId, file);
			await confirmPhoto.mutateAsync({ projectId, photoId, filename: file.name });
			invalidate();
			setBanner({ kind: 'ok', text: 'Photo uploaded.' });
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Photo upload failed' });
		} finally {
			setPhotoBusy(null);
		}
	}

	return (
		<div className="text-foreground">
			<CategoryBar categories={categories ?? []} />

			{banner && (
				<div
					className={`mb-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
						banner.kind === 'ok'
							? 'border-green-800 bg-green-900/30 text-green-200'
							: 'border-red-800 bg-red-900/30 text-red-200'
					}`}
				>
					<span>{banner.text}</span>
					<button type="button" onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">
						dismiss
					</button>
				</div>
			)}

			<div className="mb-4">
				<button
					type="button"
					onClick={openCreate}
					className="rounded-md bg-ieee-dark-yellow px-4 py-2 text-sm font-semibold text-black"
				>
					+ New project
				</button>
			</div>

			{showForm && (
				<ProjectForm
					key={editing?.id ?? 'new'}
					categories={categories ?? []}
					editing={editing}
					onDone={() => setShowForm(false)}
				/>
			)}

			<input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhotoFile} />

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : (
				<Table>
					<TableHeader className="bg-card/60 text-xs uppercase">
						<TableRow>
							<TableHead>Project</TableHead>
							<TableHead>Lead</TableHead>
							<TableHead>Photos</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(projects ?? []).map((p) => (
							<Fragment key={p.id}>
								<TableRow inactive={!p.active}>
									<TableCell>
										<div className="font-medium">{p.title}</div>
										<div className="text-xs text-muted-foreground-dim">{p.overview.slice(0, 80)}</div>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">{p.lead ?? '—'}</TableCell>
									<TableCell>
										<div className="flex gap-1">
											{(p.photoUrls ?? []).slice(0, 3).map((url) => (
												// eslint-disable-next-line @next/next/no-img-element
												<img key={url} src={url} alt="" className="h-8 w-8 rounded object-cover" />
											))}
										</div>
									</TableCell>
									<TableCell>
										<div className="flex justify-end gap-3 text-xs">
											<button type="button" onClick={() => openEdit(p)} className="text-blue-400 hover:underline">
												edit
											</button>
											<button
												type="button"
												disabled={photoBusy === p.id}
												onClick={() => pickPhoto(p.id)}
												className="text-blue-400 hover:underline disabled:opacity-50"
											>
												{photoBusy === p.id ? 'uploading…' : '+ photo'}
											</button>
											<button
												type="button"
												onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
												className="text-blue-400 hover:underline"
											>
												{expandedId === p.id ? 'hide members' : 'members'}
											</button>
											<button
												type="button"
												onClick={() => del.mutate({ id: p.id })}
												className="text-red-400 hover:underline"
											>
												delete
											</button>
										</div>
									</TableCell>
								</TableRow>
								{expandedId === p.id && (
									<TableRow>
										<TableCell colSpan={4}>
											<div className="rounded-md border border-input p-3">
												<MembershipPanel projectId={p.id} />
												{(p.photoUrls ?? []).length > 0 && (
													<div className="mt-3 flex flex-wrap gap-2 border-t border-input pt-3">
														{(p.photoUrls ?? []).map((url) => (
															<div key={url} className="relative">
																{/* eslint-disable-next-line @next/next/no-img-element */}
																<img src={url} alt="" className="h-16 w-16 rounded object-cover" />
																<button
																	type="button"
																	onClick={() => removePhoto.mutate({ projectId: p.id, photoUrl: url })}
																	className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] text-white"
																>
																	×
																</button>
															</div>
														))}
													</div>
												)}
											</div>
										</TableCell>
									</TableRow>
								)}
							</Fragment>
						))}
						{(projects ?? []).length === 0 && <TableEmpty colSpan={4}>No projects yet.</TableEmpty>}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
