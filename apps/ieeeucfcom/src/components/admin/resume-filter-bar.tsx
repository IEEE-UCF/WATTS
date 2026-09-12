'use client';

import { useMemo } from 'react';
import {
	type ResumeExportFilter,
	applyResumeSelection,
	describeResumeFilter,
	isEmptyResumeFilter,
	EMPTY_RESUME_FILTER,
} from '@/lib/resume-export/filters';
import { TogglePill } from '@/components/ui/toggle-pill';

export interface FilterBarRow {
	memberId: string;
	firstName: string;
	lastName: string;
	major: string;
	graduationYear: number | null;
	duesPaid: boolean;
	officerStatus: boolean;
	hasResume: boolean;
}

function humanBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeFilterBar({
	allRows,
	value,
	onChange,
	matchedCount,
	sizeBytes,
}: {
	allRows: FilterBarRow[];
	value: ResumeExportFilter;
	onChange: (next: ResumeExportFilter) => void;
	matchedCount: number;
	sizeBytes: number | null;
}) {
	const withResume = useMemo(() => allRows.filter((r) => r.hasResume), [allRows]);

	const years = useMemo(() => {
		const set = new Set<number>();
		for (const r of withResume) if (r.graduationYear != null) set.add(r.graduationYear);
		return [...set].sort((a, b) => b - a);
	}, [withResume]);

	// Officers with a résumé who the current constraints don't already catch.
	const extraOfficerCount = useMemo(() => {
		const caught = new Set(
			applyResumeSelection(withResume, { ...value, includeAllOfficers: false }).map(
				(r) => r.memberId,
			),
		);
		return withResume.filter((r) => r.officerStatus && !caught.has(r.memberId)).length;
	}, [withResume, value]);

	// People not already in the set — candidates for "add anyone else".
	const pickable = useMemo(() => {
		const selected = new Set(applyResumeSelection(withResume, value).map((r) => r.memberId));
		return withResume
			.filter((r) => !selected.has(r.memberId))
			.sort((a, b) =>
				`${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
			);
	}, [withResume, value]);

	const byId = useMemo(() => new Map(allRows.map((r) => [r.memberId, r])), [allRows]);

	const toggleYear = (y: number) => {
		const has = value.gradYears.includes(y);
		onChange({
			...value,
			gradYears: has ? value.gradYears.filter((v) => v !== y) : [...value.gradYears, y],
		});
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3">
			{/* cohort / timing */}
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-xs tracking-wide text-muted-foreground-dim uppercase">
					Class of
				</span>
				{years.length === 0 && (
					<span className="text-xs text-muted-foreground-dim">no résumés yet</span>
				)}
				{years.map((y) => {
					const on = value.gradYears.includes(y);
					return (
						<TogglePill
							key={y}
							selected={on}
							tone="brand-outline"
							size="pill"
							onClick={() => toggleYear(y)}
						>
							{y}
						</TogglePill>
					);
				})}
				{value.gradYears.length > 0 && (
					<button
						type="button"
						onClick={() => onChange({ ...value, gradYears: [] })}
						className="text-xs text-muted-foreground-dim hover:text-muted-foreground"
					>
						all years
					</button>
				)}
			</div>

			{/* membership toggles */}
			<div className="flex flex-wrap items-center gap-5 text-sm">
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={value.duesPaidOnly}
						onChange={(e) => onChange({ ...value, duesPaidOnly: e.target.checked })}
					/>
					dues-paid only
				</label>
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={value.includeAllOfficers}
						onChange={(e) =>
							onChange({ ...value, includeAllOfficers: e.target.checked })
						}
					/>
					always include officers
					{extraOfficerCount > 0 && (
						<span className="text-xs text-muted-foreground-dim">
							(+{extraOfficerCount})
						</span>
					)}
				</label>
			</div>

			{/* …or anyone else */}
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-xs tracking-wide text-muted-foreground-dim uppercase">
					Also include
				</span>
				<select
					value=""
					onChange={(e) => {
						const id = e.target.value;
						if (id)
							onChange({
								...value,
								includeMemberIds: [...value.includeMemberIds, id],
							});
					}}
					className="rounded-md border border-input bg-card px-2 py-1 text-sm"
				>
					<option value="">add a member…</option>
					{pickable.map((r) => (
						<option key={r.memberId} value={r.memberId}>
							{r.lastName}, {r.firstName} — {r.major}
							{r.graduationYear ? ` (${r.graduationYear})` : ''}
						</option>
					))}
				</select>
				{value.includeMemberIds.map((id) => {
					const r = byId.get(id);
					return (
						<span
							key={id}
							className="inline-flex items-center gap-1 rounded-full border border-input bg-card py-1 pr-1 pl-3 text-xs"
						>
							{r ? `${r.lastName}, ${r.firstName}` : id.slice(0, 8)}
							<button
								type="button"
								aria-label="remove"
								onClick={() =>
									onChange({
										...value,
										includeMemberIds: value.includeMemberIds.filter(
											(v) => v !== id,
										),
									})
								}
								className="rounded-full px-1 text-muted-foreground-dim hover:bg-secondary hover:text-red-400"
							>
								×
							</button>
						</span>
					);
				})}
			</div>

			{/* readout */}
			<div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-sm">
				<span className="font-semibold text-foreground">
					{matchedCount} résumé{matchedCount === 1 ? '' : 's'}
				</span>
				<span className="text-muted-foreground-dim">
					{sizeBytes == null ? '· …' : `· ~${humanBytes(sizeBytes)}`}
				</span>
				<span className="text-xs text-muted-foreground-dim">
					{describeResumeFilter(value)}
				</span>
				{!isEmptyResumeFilter(value) && (
					<button
						type="button"
						onClick={() => onChange({ ...EMPTY_RESUME_FILTER })}
						className="ml-auto text-xs text-muted-foreground-dim hover:text-muted-foreground"
					>
						clear filters
					</button>
				)}
			</div>
		</div>
	);
}
