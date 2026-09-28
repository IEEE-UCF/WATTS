'use client';

import { useState } from 'react';
import { graduationTermEnum, majorEnums } from '@watts/db/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@watts/ui/select';

export type Major = (typeof majorEnums.enumValues)[number];
export type GraduationTerm = (typeof graduationTermEnum.enumValues)[number];

/** Matches the API's cap on additional majors. */
const MAX_ADDITIONAL_MAJORS = 3;

const TERM_LABELS: Record<GraduationTerm, string> = {
	spring: 'Spring',
	summer: 'Summer',
	fall: 'Fall',
};

/** "Spring 2027", or just "2027" for members who registered before terms existed. */
export function formatGraduation(m: {
	graduationYear: number;
	graduationTerm?: GraduationTerm | null;
}): string {
	return m.graduationTerm
		? `${TERM_LABELS[m.graduationTerm]} ${m.graduationYear}`
		: String(m.graduationYear);
}

/** Primary major plus any additional ones, e.g. "Electrical Engineering (BSEE) + Computer Science (BS)". */
export function formatMajors(m: { major: string; additionalMajors?: string[] | null }): string {
	return [m.major, ...(m.additionalMajors ?? [])].join(' + ');
}

/** Graduation semester select; submits as `graduation_term` in the surrounding form. */
export function GraduationTermSelect({
	defaultValue,
	required = true,
}: {
	defaultValue?: GraduationTerm | null;
	required?: boolean;
}) {
	return (
		<Select name="graduation_term" defaultValue={defaultValue ?? undefined} required={required}>
			<SelectTrigger id="graduation_term">
				<SelectValue placeholder="Select semester" />
			</SelectTrigger>
			<SelectContent>
				{graduationTermEnum.enumValues.map((term) => (
					<SelectItem key={term} value={term}>
						{TERM_LABELS[term]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/**
 * Searchable checklist for double/triple majors. The list is long (every UCF major),
 * so a filter box beats a giant multi-select. Each pick submits as a repeated
 * `additional_majors` form value; the primary major is hidden from the list.
 */
export function AdditionalMajorsPicker({
	primary,
	defaultValue = [],
}: {
	primary: string;
	defaultValue?: readonly string[];
}) {
	const [selected, setSelected] = useState<string[]>([...defaultValue]);
	const [query, setQuery] = useState('');

	const picks = selected.filter((m) => m !== primary);
	const full = picks.length >= MAX_ADDITIONAL_MAJORS;
	const options = majorEnums.enumValues.filter(
		(m) => m !== primary && m.toLowerCase().includes(query.trim().toLowerCase()),
	);

	function toggle(major: string) {
		setSelected((prev) =>
			prev.includes(major) ? prev.filter((m) => m !== major) : [...prev, major],
		);
	}

	return (
		<div className="space-y-2">
			{picks.map((m) => (
				<input key={m} type="hidden" name="additional_majors" value={m} />
			))}
			{picks.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{picks.map((m) => (
						<button
							key={m}
							type="button"
							onClick={() => toggle(m)}
							className="rounded-full border border-input px-2.5 py-0.5 text-xs text-foreground hover:border-red-400"
							title="Remove"
						>
							{m} ×
						</button>
					))}
				</div>
			)}
			<input
				type="search"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Search majors…"
				aria-label="Search additional majors"
				className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
			/>
			<div className="max-h-40 overflow-y-auto rounded-md border border-input p-2 text-sm">
				{options.map((m) => {
					const checked = picks.includes(m);
					return (
						<label
							key={m}
							className={`flex items-center gap-2 py-0.5 ${
								!checked && full ? 'opacity-50' : ''
							}`}
						>
							<input
								type="checkbox"
								checked={checked}
								disabled={!checked && full}
								onChange={() => toggle(m)}
							/>
							{m}
						</label>
					);
				})}
				{options.length === 0 && (
					<p className="text-muted-foreground-dim">No majors match.</p>
				)}
			</div>
			<p className="text-xs text-muted-foreground-dim">
				Optional — up to {MAX_ADDITIONAL_MAJORS}.
			</p>
		</div>
	);
}
