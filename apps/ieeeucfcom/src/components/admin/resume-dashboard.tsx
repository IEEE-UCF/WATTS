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
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	TableEmpty,
} from '@watts/ui/table';
import { Card } from '@watts/ui/card';

export function ResumeDashboard() {
	const { data, isLoading } = trpc.officer.listResumes.useQuery();
	const [q, setQ] = useState('');
	const [onlyWithResume, setOnlyWithResume] = useState(true);
	const [preview, setPreview] = useState<string | null>(null);
	const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	// Fetch the PDF as bytes and frame a blob: URL instead of the authenticated route
	// directly — X-Frame-Options: DENY (site-wide, apps/ieeeucfcom/next.config.ts) then
	// stays intact everywhere, since a blob: URL was never served with that header and
	// isn't a "sub-site" the way navigating a frame to the API route would be.
	useEffect(() => {
		if (!preview) {
			setPreviewObjectUrl(null);
			setPreviewError(null);
			return;
		}
		let cancelled = false;
		let objectUrl: string | null = null;
		setPreviewObjectUrl(null);
		setPreviewError(null);
		fetch(preview)
			.then((res) => {
				if (!res.ok) throw new Error(`Couldn't load résumé (${res.status})`);
				return res.blob();
			})
			.then((blob) => {
				if (cancelled) return;
				objectUrl = URL.createObjectURL(blob);
				setPreviewObjectUrl(objectUrl);
			})
			.catch((err) => {
				if (!cancelled) {
					setPreviewError(err instanceof Error ? err.message : "Couldn't load résumé");
				}
			});
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [preview]);
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
			if (
				needle &&
				!`${r.firstName} ${r.lastName} ${r.major}`.toLowerCase().includes(needle)
			) {
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
			<div className="text-foreground">
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
							className="rounded-md border border-input bg-card px-3 py-2 text-sm"
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
									className="rounded-md border border-ieee-dark-yellow px-3 py-2 text-sm text-ieee-dark-yellow hover:bg-ieee-dark-yellow/10"
								>
									Export {selectedCount} · .zip
								</a>
								<a
									href={`/api/files/resume/export${exportPdfQuery}`}
									download
									className="rounded-md border border-input px-3 py-2 text-sm text-foreground hover:border-ieee-dark-yellow hover:text-ieee-dark-yellow"
								>
									one PDF
								</a>
							</span>
						)}
					</div>
				</div>

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Major</TableHead>
								<TableHead>Grad</TableHead>
								<TableHead>Résumé</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r) => {
								const inExport = selection.ids.has(r.memberId);
								const why = selection.reason.get(r.memberId);
								return (
									<TableRow key={r.memberId} inactive={!inExport}>
										<TableCell>
											{r.firstName} {r.lastName}
											{why === 'officer' && (
												<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
													officer
												</span>
											)}
											{why === 'manual' && (
												<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
													added
												</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{r.major}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{r.graduationYear}
										</TableCell>
										<TableCell>
											{r.hasResume && r.resumeUrl ? (
												<div className="flex items-center gap-3">
													<button
														type="button"
														onClick={() => setPreview(r.resumeUrl!)}
														className="text-ieee-dark-yellow hover:underline"
													>
														preview
													</button>
													<a
														href={r.resumeUrl}
														target="_blank"
														rel="noreferrer"
														className="text-muted-foreground hover:underline"
													>
														open
													</a>
													{r.resumeUploadedAt && (
														<span className="text-xs text-muted-foreground-dim">
															{new Date(
																r.resumeUploadedAt,
															).toLocaleDateString()}
														</span>
													)}
												</div>
											) : (
												<span className="text-muted-foreground-dim">
													none
												</span>
											)}
										</TableCell>
									</TableRow>
								);
							})}
							{rows.length === 0 && (
								<TableEmpty colSpan={4}>No matching members.</TableEmpty>
							)}
						</TableBody>
					</Table>
				)}
			</div>

			<Card className="gap-0 rounded-lg border-border bg-card/50 p-2">
				{preview ? (
					previewError ? (
						<p className="p-6 text-sm text-destructive">{previewError}</p>
					) : previewObjectUrl ? (
						<iframe
							title="résumé preview"
							src={previewObjectUrl}
							className="h-[70vh] w-full rounded"
						/>
					) : (
						<p className="p-6 text-sm text-muted-foreground-dim">Loading…</p>
					)
				) : (
					<p className="p-6 text-sm text-muted-foreground-dim">
						Select “preview” to view a résumé here.
					</p>
				)}
			</Card>
		</div>
	);
}
