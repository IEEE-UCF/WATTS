'use client';

import { Search, X } from 'lucide-react';
import type { RouterOutputs } from '@watts/api';

type AdminEvent = RouterOutputs['event']['getAllForAdmin'][number];
type Label = RouterOutputs['eventLabel']['list'][number];

/**
 * Admin event-list filters. Applied before the Upcoming/Past split, so both tabs (and
 * their counts) reflect the same search. To add a dimension: add a field here with an
 * "off" value in EMPTY_FILTERS, a check in matchesEventFilters, and a control in the bar.
 */
export interface EventFilters {
	/** Free text: every word must appear in the title, location, description, category or #number. */
	q: string;
	/** '' = any category, 'none' = uncategorised, otherwise a label id. */
	labelId: string;
	flyer: 'any' | 'has' | 'missing';
	sync: 'any' | 'synced' | 'pending' | 'error' | 'skipped';
	scope: 'any' | 'global' | 'local';
	visibility: 'any' | 'shown' | 'hidden';
	/** yyyy-mm-dd, inclusive, compared against the start date in the browser's time zone. */
	from: string;
	to: string;
}

export const EMPTY_FILTERS: EventFilters = {
	q: '',
	labelId: '',
	flyer: 'any',
	sync: 'any',
	scope: 'any',
	visibility: 'any',
	from: '',
	to: '',
};

export function hasActiveFilters(f: EventFilters): boolean {
	return (Object.keys(EMPTY_FILTERS) as (keyof EventFilters)[]).some(
		(k) => f[k].trim() !== EMPTY_FILTERS[k],
	);
}

/** `start` is the parsed start time; passed in so callers reuse their Safari-safe parse. */
export function matchesEventFilters(ev: AdminEvent, start: Date, f: EventFilters): boolean {
	const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length) {
		const haystack = [
			ev.title,
			ev.location,
			ev.description,
			ev.label?.name ?? '',
			`#${ev.number}`,
		]
			.join(' ')
			.toLowerCase();
		if (!words.every((w) => haystack.includes(w))) return false;
	}

	if (f.labelId === 'none' && ev.labelId) return false;
	if (f.labelId && f.labelId !== 'none' && ev.labelId !== f.labelId) return false;
	if (f.flyer === 'has' && !ev.flyerUrl) return false;
	if (f.flyer === 'missing' && ev.flyerUrl) return false;
	if (f.sync !== 'any' && ev.syncStatus !== f.sync) return false;
	if (f.scope === 'global' && !ev.isGlobal) return false;
	if (f.scope === 'local' && ev.isGlobal) return false;
	if (f.visibility === 'shown' && ev.hidden) return false;
	if (f.visibility === 'hidden' && !ev.hidden) return false;
	if (f.from && start < new Date(`${f.from}T00:00:00`)) return false;
	if (f.to && start > new Date(`${f.to}T23:59:59.999`)) return false;
	return true;
}

const control =
	'h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-ieee-dark-yellow focus:outline-none';

export function EventFilterBar({
	filters,
	onChange,
	labels,
	shown,
	total,
}: {
	filters: EventFilters;
	onChange: (next: EventFilters) => void;
	labels: Label[];
	/** Rows in the current tab after filtering, and before. */
	shown: number;
	total: number;
}) {
	function set<K extends keyof EventFilters>(key: K, value: EventFilters[K]) {
		onChange({ ...filters, [key]: value });
	}
	const active = hasActiveFilters(filters);

	return (
		<div className="mb-4 space-y-3 rounded-lg border border-border bg-card/40 p-3">
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="search"
					aria-label="Search events"
					placeholder="Search events, places, categories or #number…"
					title="Matches title, location, description, category or #number"
					value={filters.q}
					onChange={(e) => set('q', e.target.value)}
					className={`${control} w-full pl-9`}
				/>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<select
					aria-label="Category"
					value={filters.labelId}
					onChange={(e) => set('labelId', e.target.value)}
					className={control}
				>
					<option value="">All categories</option>
					<option value="none">No category</option>
					{labels.map((l) => (
						<option key={l.id} value={l.id}>
							{l.name}
							{l.active ? '' : ' (retired)'}
						</option>
					))}
				</select>
				<select
					aria-label="Flyer"
					value={filters.flyer}
					onChange={(e) => set('flyer', e.target.value as EventFilters['flyer'])}
					className={control}
				>
					<option value="any">Any flyer</option>
					<option value="has">Has flyer</option>
					<option value="missing">Missing flyer</option>
				</select>
				<select
					aria-label="Sync status"
					value={filters.sync}
					onChange={(e) => set('sync', e.target.value as EventFilters['sync'])}
					className={control}
				>
					<option value="any">Any sync status</option>
					<option value="synced">Synced</option>
					<option value="pending">Pending</option>
					<option value="error">Sync error</option>
					<option value="skipped">Skipped</option>
				</select>
				<select
					aria-label="Global"
					value={filters.scope}
					onChange={(e) => set('scope', e.target.value as EventFilters['scope'])}
					className={control}
				>
					<option value="any">Global &amp; local</option>
					<option value="global">Global only</option>
					<option value="local">Not global</option>
				</select>
				<select
					aria-label="Visibility"
					value={filters.visibility}
					onChange={(e) =>
						set('visibility', e.target.value as EventFilters['visibility'])
					}
					className={control}
				>
					<option value="any">Shown &amp; hidden</option>
					<option value="shown">Shown on site</option>
					<option value="hidden">Hidden</option>
				</select>
				<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					From
					<input
						type="date"
						value={filters.from}
						max={filters.to || undefined}
						onChange={(e) => set('from', e.target.value)}
						className={control}
					/>
				</label>
				<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					To
					<input
						type="date"
						value={filters.to}
						min={filters.from || undefined}
						onChange={(e) => set('to', e.target.value)}
						className={control}
					/>
				</label>

				<div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
					{active && (
						<>
							<span>
								Showing {shown} of {total}
							</span>
							<button
								type="button"
								onClick={() => onChange(EMPTY_FILTERS)}
								className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-foreground hover:border-ieee-dark-yellow"
							>
								<X className="size-3" /> Clear filters
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
