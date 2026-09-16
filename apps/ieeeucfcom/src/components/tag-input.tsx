'use client';

import { useState } from 'react';

/** Same split/trim/filter rule the public /projects page uses to parse these fields
 * back into chips — kept in sync so what an officer/lead builds here is exactly what
 * renders publicly, not a second, slightly-different parser. */
export function parseTags(value: string | null | undefined): string[] {
	return value
		? value
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		: [];
}

/**
 * A small tag editor over a comma-separated string column (hardwareInfo, softwareInfo,
 * skills). Stores/emits the same comma-joined string the DB column expects — this is a
 * nicer way to build that string, not a new data model. Case-insensitive de-dupe only;
 * no shared vocabulary across projects yet.
 */
export function TagInput({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) {
	const [draft, setDraft] = useState('');
	const tags = parseTags(value);

	function commit(next: string[]) {
		onChange(next.join(', '));
	}

	function addFromDraft() {
		const t = draft.trim();
		setDraft('');
		if (!t) return;
		if (tags.some((existing) => existing.toLowerCase() === t.toLowerCase())) return;
		commit([...tags, t]);
	}

	function removeTag(t: string) {
		commit(tags.filter((existing) => existing !== t));
	}

	return (
		<div>
			<span className="mb-1 block text-xs text-muted-foreground">{label}</span>
			<div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5">
				{tags.map((t) => (
					<span
						key={t}
						className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-0.5 text-xs text-foreground"
					>
						{t}
						<button
							type="button"
							onClick={() => removeTag(t)}
							aria-label={`Remove ${t}`}
							className="text-muted-foreground hover:text-red-400"
						>
							×
						</button>
					</span>
				))}
				<input
					value={draft}
					onChange={(e) => {
						// Typing a comma commits the tag immediately, so pasting a
						// comma-separated list still works one tag at a time.
						if (e.target.value.includes(',')) {
							const [before] = e.target.value.split(',');
							setDraft(before);
							if (before.trim()) {
								const t = before.trim();
								if (
									!tags.some(
										(existing) => existing.toLowerCase() === t.toLowerCase(),
									)
								) {
									commit([...tags, t]);
								}
								setDraft('');
							}
							return;
						}
						setDraft(e.target.value);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addFromDraft();
						} else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
							removeTag(tags[tags.length - 1]);
						}
					}}
					onBlur={addFromDraft}
					placeholder={placeholder ?? 'Type and press Enter'}
					className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground-dim"
				/>
			</div>
		</div>
	);
}
