'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';

/**
 * Rough committee/project membership management — the actual gap this closes is that
 * assigning someone to a committee or project (or setting a chair/lead) was raw-SQL-only.
 * Deliberately minimal: no photo uploads, no skills-tag editor, no discordRoleId wiring —
 * that's the full CMS, a separate future pass. This is just title/slug/overview + membership.
 */
export function CommitteesProjectsPanel() {
	const [kind, setKind] = useState<'committee' | 'project'>('committee');
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [showCreate, setShowCreate] = useState(false);

	const committees = trpc.committee.getAll.useQuery(undefined, { enabled: kind === 'committee' });
	const projects = trpc.project.getAll.useQuery(undefined, { enabled: kind === 'project' });

	const rows =
		kind === 'committee'
			? (committees.data ?? []).map((c) => ({
					id: c.id,
					title: c.title,
					memberCount: c.memberCount,
				}))
			: (projects.data ?? []).map((p) => ({
					id: p.id,
					title: p.title,
					memberCount: undefined as number | undefined,
				}));

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<div className="flex gap-1 rounded-md border border-input p-0.5">
					{(['committee', 'project'] as const).map((k) => (
						<button
							key={k}
							type="button"
							onClick={() => {
								setKind(k);
								setExpandedId(null);
							}}
							className={`rounded px-2.5 py-1 text-xs capitalize ${
								kind === k
									? 'bg-secondary text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							}`}
						>
							{k}s
						</button>
					))}
				</div>
				<button
					type="button"
					onClick={() => setShowCreate((v) => !v)}
					className="ml-auto text-xs text-ieee-dark-yellow hover:underline"
				>
					{showCreate ? 'Cancel' : `+ New ${kind}`}
				</button>
			</div>

			{showCreate && <CreateForm kind={kind} onDone={() => setShowCreate(false)} />}

			<div className="flex flex-col gap-1.5">
				{rows.length === 0 && (
					<p className="text-xs text-muted-foreground-dim">No {kind}s yet.</p>
				)}
				{rows.map((row) => (
					<div key={row.id} className="rounded-md border border-input">
						<button
							type="button"
							onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
							className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
						>
							<span className="text-foreground">{row.title}</span>
							<span className="text-xs text-muted-foreground-dim">
								{row.memberCount !== undefined ? `${row.memberCount} members` : ''}{' '}
								{expandedId === row.id ? '▲' : '▼'}
							</span>
						</button>
						{expandedId === row.id && (
							<div className="border-t border-input p-3">
								<MembershipEditor kind={kind} id={row.id} />
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function CreateForm({ kind, onDone }: { kind: 'committee' | 'project'; onDone: () => void }) {
	const [title, setTitle] = useState('');
	const [overview, setOverview] = useState('');
	const [chairId, setChairId] = useState('');
	const members = trpc.member.listForAdmin.useQuery();
	const utils = trpc.useUtils();

	const createCommittee = trpc.committee.create.useMutation({
		onSuccess: () => {
			void utils.committee.getAll.invalidate();
			onDone();
		},
	});
	const createProject = trpc.project.create.useMutation({
		onSuccess: () => {
			void utils.project.getAll.invalidate();
			onDone();
		},
	});

	const pending = createCommittee.isPending || createProject.isPending;
	const error = createCommittee.error?.message ?? createProject.error?.message ?? null;

	const submit = async () => {
		if (kind === 'committee') {
			if (!chairId) return;
			await createCommittee.mutateAsync({ title, about: overview, chairId });
		} else {
			await createProject.mutateAsync({ title, overview });
		}
		setTitle('');
		setOverview('');
		setChairId('');
	};

	return (
		<div className="flex flex-col gap-2 rounded-md border border-input p-3">
			<input
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				placeholder="Title"
				className="rounded-md border border-input bg-card px-2.5 py-1.5 text-sm"
			/>
			<textarea
				value={overview}
				onChange={(e) => setOverview(e.target.value)}
				placeholder={kind === 'committee' ? 'About' : 'Overview'}
				rows={2}
				className="rounded-md border border-input bg-card px-2.5 py-1.5 text-sm"
			/>
			{kind === 'committee' && (
				<select
					value={chairId}
					onChange={(e) => setChairId(e.target.value)}
					className="rounded-md border border-input bg-card px-2.5 py-1.5 text-sm"
				>
					<option value="">Select a chair…</option>
					{(members.data ?? []).map((m) => (
						<option key={m.id} value={m.id}>
							{m.firstName} {m.lastName}
						</option>
					))}
				</select>
			)}
			{error && <p className="text-xs text-red-400">{error}</p>}
			<button
				type="button"
				disabled={!title || !overview || (kind === 'committee' && !chairId) || pending}
				onClick={submit}
				className="self-start rounded-md bg-ieee-dark-yellow px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
			>
				{pending ? 'Creating…' : `Create ${kind}`}
			</button>
		</div>
	);
}

function MembershipEditor({ kind, id }: { kind: 'committee' | 'project'; id: string }) {
	const [query, setQuery] = useState('');
	const [pickedId, setPickedId] = useState('');
	const utils = trpc.useUtils();

	const committeeMembers = trpc.committee.listMembers.useQuery(
		{ committeeId: id },
		{ enabled: kind === 'committee' },
	);
	const projectMembers = trpc.project.listMembers.useQuery(
		{ projectId: id },
		{ enabled: kind === 'project' },
	);
	const allMembers = trpc.member.listForAdmin.useQuery();

	const members =
		kind === 'committee'
			? (committeeMembers.data ?? []).map((m) => ({ ...m, lead: m.isChair, label: 'chair' }))
			: (projectMembers.data ?? []).map((m) => ({ ...m, lead: m.isLead, label: 'lead' }));

	const invalidate = () => {
		if (kind === 'committee') {
			void utils.committee.listMembers.invalidate({ committeeId: id });
			void utils.committee.getAll.invalidate();
		} else {
			void utils.project.listMembers.invalidate({ projectId: id });
		}
	};

	const addCommittee = trpc.committee.addMember.useMutation({ onSuccess: invalidate });
	const removeCommittee = trpc.committee.removeMember.useMutation({ onSuccess: invalidate });
	const chairCommittee = trpc.committee.setChair.useMutation({ onSuccess: invalidate });
	const addProject = trpc.project.addMember.useMutation({ onSuccess: invalidate });
	const removeProject = trpc.project.removeMember.useMutation({ onSuccess: invalidate });
	const leadProject = trpc.project.setLead.useMutation({ onSuccess: invalidate });

	const memberIds = useMemo(() => new Set(members.map((m) => m.memberId)), [members]);
	const candidates = (allMembers.data ?? []).filter(
		(m) =>
			!memberIds.has(m.id) &&
			`${m.firstName} ${m.lastName}`.toLowerCase().includes(query.toLowerCase()),
	);

	const add = () => {
		if (!pickedId) return;
		if (kind === 'committee') addCommittee.mutate({ committeeId: id, memberId: pickedId });
		else addProject.mutate({ projectId: id, memberId: pickedId });
		setPickedId('');
		setQuery('');
	};

	return (
		<div className="flex flex-col gap-2">
			{members.map((m) => (
				<div key={m.memberId} className="flex items-center justify-between text-xs">
					<span className="text-foreground">
						{m.firstName} {m.lastName}
						{m.lead && (
							<span className="ml-1.5 rounded bg-ieee-dark-yellow px-1 py-0.5 font-mono text-[9px] text-black">
								{m.label}
							</span>
						)}
					</span>
					<span className="flex items-center gap-2">
						<button
							type="button"
							onClick={() =>
								kind === 'committee'
									? chairCommittee.mutate({
											committeeId: id,
											memberId: m.memberId,
											isChair: !m.lead,
										})
									: leadProject.mutate({
											projectId: id,
											memberId: m.memberId,
											isLead: !m.lead,
										})
							}
							className="text-muted-foreground hover:text-foreground"
						>
							{m.lead ? `remove ${m.label}` : `make ${m.label}`}
						</button>
						<button
							type="button"
							onClick={() =>
								kind === 'committee'
									? removeCommittee.mutate({
											committeeId: id,
											memberId: m.memberId,
										})
									: removeProject.mutate({ projectId: id, memberId: m.memberId })
							}
							className="text-red-400 hover:underline"
						>
							remove
						</button>
					</span>
				</div>
			))}

			<div className="mt-1 flex gap-1.5">
				<input
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setPickedId('');
					}}
					placeholder="Search a member…"
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
	);
}
