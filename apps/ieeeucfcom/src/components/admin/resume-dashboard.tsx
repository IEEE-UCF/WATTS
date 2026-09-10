'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
	type ResumeExportFilter,
	EMPTY_RESUME_FILTER,
	applyResumeSelection,
	selectionReason,
	serializeResumeFilter,
} from '@/lib/resume-export/filters';
import { ResumeFilterBar, type FilterBarRow } from '@/components/admin/resume-filter-bar';
import { ResumeExportPresetBar } from '@/components/admin/resume-export-presets';

export function ResumeDashboard() {
	const { data, isLoading } = trpc.officer.listResumes.useQuery();
	const [q, setQ] = useState('');
	const [onlyWithResume, setOnlyWithResume] = useState(true);
	const [preview, setPreview] = useState<string | null>(null);
	const [filter, setFilter] = useState<ResumeExportFilter>(EMPTY_RESUME_FILTER);

	const allRows: FilterBarRow[] = useMemo(
		() =>
			(data ?? []).map((r) => ({
				memberId: r.memberId,
				firstName: r.firstName,
				lastName: r.lastName,
				major: r.major,
				graduationYear: r.graduationYear,
				duesPaid: Boolean(r.duesPaid),
				officerStatus: Boolean(r.officerStatus),
				hasResume: Boolean(r.hasResume),
			})),
		[data],
	);

	// The export set for the current filter — ids + why each was picked.
	const selection = useMemo(() => {
		const picked = applyResumeSelection(allRows, filter);
		const reason = new Map(picked.map((r) => [r.memberId, selectionReason(r, filter)]));
		return { ids: new Set(picked.map((r) => r.memberId)), reason };
	}, [allRows, filter]);

	// Size estimate from the server (count + byte totals), debounced on filter change.
	const [sizeBytes, setSizeBytes] = useState<number | null>(null);
	const reqId = useRef(0);
	useEffect(() => {
		const mine = ++reqId.current;
		setSizeBytes(null);
		const t = setTimeout(() => {
			fetch(`/api/files/resume/export${serializeResumeFilter(filter, { format: 'count' })}`)
				.then((res) => (res.ok ? res.json() : null))
				.then((json) => {
					if (mine === reqId.current && json) setSizeBytes(json.totalBytes ?? 0);
				})
				.catch(() => {
					/* preview only — ignore */
				});
		}, 400);
		return () => clearTimeout(t);
	}, [filter]);

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return (data ?? []).filter((r) => {
			if (onlyWithResume && !r.hasResume) return false;
			if (needle && !`${r.firstName} ${r.lastName} ${r.major}`.toLowerCase().includes(needle)) {
				return false;
			}
			return true;
		});
	}, [data, q, onlyWithResume]);

	const exportQuery = serializeResumeFilter(filter);
	const exportPdfQuery = serializeResumeFilter(filter, { format: 'pdf' });
	const selectedCount = selection.ids.size;

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,480px)]">
			<div className="text-gray-100">
				<div className="mb-4 flex flex-col gap-3">
					<ResumeExportPresetBar current={filter} onApply={setFilter} />
					<ResumeFilterBar
						allRows={allRows}
						value={filter}
						onChange={setFilter}
						matchedCount={selectedCount}
						sizeBytes={sizeBytes}
					/>

					<div className="flex flex-wrap items-center gap-4">
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="Search name or major…"
							className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
						/>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={onlyWithResume}
								onChange={(e) => setOnlyWithResume(e.target.checked)}
							/>
							only members with a résumé
						</label>

						{selectedCount > 0 && (
							<span className="ml-auto flex items-center gap-2">
								<a
									href={`/api/files/resume/export${exportQuery}`}
									download
									className="rounded-md border border-[var(--ieee-dark-yellow)] px-3 py-2 text-sm text-[var(--ieee-dark-yellow)] hover:bg-[var(--ieee-dark-yellow)]/10"
								>
									Export {selectedCount} · .zip
								</a>
								<a
									href={`/api/files/resume/export${exportPdfQuery}`}
									download
									className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-[var(--ieee-dark-yellow)] hover:text-[var(--ieee-dark-yellow)]"
								>
									one PDF
								</a>
							</span>
						)}
					</div>
				</div>

				{isLoading ? (
					<p className="text-sm text-gray-400">Loading…</p>
				) : (
					<div className="overflow-x-auto rounded-lg border border-gray-800">
						<table className="w-full text-left text-sm">
							<thead className="bg-gray-900 text-gray-300">
								<tr>
									<th className="px-3 py-2">Name</th>
									<th className="px-3 py-2">Major</th>
									<th className="px-3 py-2">Grad</th>
									<th className="px-3 py-2">Résumé</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => {
									const inExport = selection.ids.has(r.memberId);
									const why = selection.reason.get(r.memberId);
									return (
										<tr
											key={r.memberId}
											className={`border-t border-gray-800 ${inExport ? '' : 'opacity-40'}`}
										>
											<td className="px-3 py-2">
												{r.firstName} {r.lastName}
												{why === 'officer' && (
													<span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
														officer
													</span>
												)}
												{why === 'manual' && (
													<span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
														added
													</span>
												)}
											</td>
											<td className="px-3 py-2 text-gray-400">{r.major}</td>
											<td className="px-3 py-2 text-gray-400">{r.graduationYear}</td>
											<td className="px-3 py-2">
												{r.hasResume && r.resumeUrl ? (
													<div className="flex items-center gap-3">
														<button
															type="button"
															onClick={() => setPreview(r.resumeUrl!)}
															className="text-[var(--ieee-dark-yellow)] hover:underline"
														>
															preview
														</button>
														<a
															href={r.resumeUrl}
															target="_blank"
															rel="noreferrer"
															className="text-gray-300 hover:underline"
														>
															open
														</a>
														{r.resumeUploadedAt && (
															<span className="text-xs text-gray-500">
																{new Date(r.resumeUploadedAt).toLocaleDateString()}
															</span>
														)}
													</div>
												) : (
													<span className="text-gray-600">none</span>
												)}
											</td>
										</tr>
									);
								})}
								{rows.length === 0 && (
									<tr>
										<td colSpan={4} className="px-3 py-6 text-center text-gray-500">
											No matching members.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2">
				{preview ? (
					<iframe title="résumé preview" src={preview} className="h-[70vh] w-full rounded" />
				) : (
					<p className="p-6 text-sm text-gray-500">Select “preview” to view a résumé here.</p>
				)}
			</div>
		</div>
	);
}
