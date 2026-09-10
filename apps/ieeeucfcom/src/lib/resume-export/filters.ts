// Shared résumé-export filter model.
//
// Pure + framework-free on purpose: the résumé dashboard (client) and the export
// route (server) both import this so "what the table shows" and "what the zip /
// PDF contains" can never drift.
//
// ─────────────────────────────────────────────────────────────────────────────
// ADDING A NEW FILTER DIMENSION
// ─────────────────────────────────────────────────────────────────────────────
// Right now the only *constraint* dimension is cohort/timing (graduation year),
// plus the dues-paid toggle. To add another (major, committee, résumé freshness,
// engagement, …):
//
//   1. Add the field to `ResumeExportFilter` below. Convention: a value that
//      means "no constraint" (empty array, false, null) so the default filter
//      stays "everyone with a résumé".
//   2. Add it to `EMPTY_RESUME_FILTER`.
//   3. Add one clause to `matchesResumeFilter()` — return false when a row fails
//      it. Keep every clause an AND. Do NOT touch the force-include logic in
//      `applyResumeSelection()`; officers / manually-added people bypass
//      constraints by design.
//   4. Add read + write for it in `parseResumeFilter()` / `serializeResumeFilter()`
//      (pick a short query key).
//   5. Surface a control in `<ResumeFilterBar>` that sets it.
//   6. If the row needs a column the queries don't select yet, add it to BOTH
//      `listMemberResumes()` and `listResumesForExport()` in
//      packages/core/src/members.ts, and to `ResumeFilterRow` below.
//
// The export route, the `format=count` preview, the manifest, and saved presets
// all read the filter generically, so they pick up the new dimension for free.
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of a member row the filter logic needs. Both queries provide it. */
export interface ResumeFilterRow {
	memberId: string;
	graduationYear: number | null;
	major: string;
	duesPaid: boolean;
	officerStatus: boolean;
	hasResume: boolean;
}

export interface ResumeExportFilter {
	/** Cohort / timing. Empty = every graduation year. */
	gradYears: number[];
	/** Membership: keep only dues-paying members. */
	duesPaidOnly: boolean;
	/** Force-add every officer who has a résumé, regardless of the constraints above. */
	includeAllOfficers: boolean;
	/** Force-add specific members by id ("…or anyone else"). */
	includeMemberIds: string[];
}

export const EMPTY_RESUME_FILTER: ResumeExportFilter = {
	gradYears: [],
	duesPaidOnly: false,
	includeAllOfficers: false,
	includeMemberIds: [],
};

/**
 * Does this row satisfy every active *constraint*? An all-empty filter matches
 * everyone — that's what keeps "export all" the default. Force-includes
 * (officers / manual ids) are handled in `applyResumeSelection`, not here.
 */
export function matchesResumeFilter(row: ResumeFilterRow, f: ResumeExportFilter): boolean {
	// ── cohort / timing ──────────────────────────────────────────────
	if (f.gradYears.length > 0) {
		if (row.graduationYear == null || !f.gradYears.includes(row.graduationYear)) return false;
	}

	// ── membership ───────────────────────────────────────────────────
	if (f.duesPaidOnly && !row.duesPaid) return false;

	// ── add new constraint dimensions here (see NOTE at top) ─────────

	return true;
}

export type SelectionReason = 'filter' | 'officer' | 'manual';

/** Why a row is in the export set — for manifest rows and dashboard badges. */
export function selectionReason(row: ResumeFilterRow, f: ResumeExportFilter): SelectionReason | null {
	if (!row.hasResume) return null;
	if (matchesResumeFilter(row, f)) return 'filter';
	if (f.includeAllOfficers && row.officerStatus) return 'officer';
	if (f.includeMemberIds.includes(row.memberId)) return 'manual';
	return null;
}

/** The final export set: rows with a résumé that pass the filter OR are force-added. */
export function applyResumeSelection<T extends ResumeFilterRow>(
	rows: readonly T[],
	f: ResumeExportFilter,
): T[] {
	return rows.filter((r) => selectionReason(r, f) !== null);
}

// ── URL (de)serialisation — one shared shape for links, the count preview,
//    and saved presets ──────────────────────────────────────────────────────

export function serializeResumeFilter(
	f: ResumeExportFilter,
	extra?: Record<string, string>,
): string {
	const p = new URLSearchParams();
	if (f.gradYears.length) p.set('gy', [...f.gradYears].sort((a, b) => a - b).join(','));
	if (f.duesPaidOnly) p.set('dues', '1');
	if (f.includeAllOfficers) p.set('officers', '1');
	if (f.includeMemberIds.length) p.set('ids', f.includeMemberIds.join(','));
	for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
	const s = p.toString();
	return s ? `?${s}` : '';
}

export function parseResumeFilter(params: URLSearchParams): ResumeExportFilter {
	// note: ''.split(',') is [''], not [] — bail on empty before splitting
	const nums = (s: string | null) => {
		const t = (s ?? '').trim();
		if (!t) return [];
		return t
			.split(',')
			.map((x) => Number(x.trim()))
			.filter((n) => Number.isFinite(n));
	};
	const list = (s: string | null) => {
		const t = (s ?? '').trim();
		if (!t) return [];
		return t
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);
	};
	return {
		gradYears: nums(params.get('gy')),
		duesPaidOnly: params.get('dues') === '1',
		includeAllOfficers: params.get('officers') === '1',
		includeMemberIds: list(params.get('ids')),
	};
}

/** One-line human description — used on the manifest and in the UI. */
export function describeResumeFilter(f: ResumeExportFilter): string {
	const parts: string[] = [];
	parts.push(f.gradYears.length ? `Class of ${[...f.gradYears].sort().join(', ')}` : 'All graduation years');
	if (f.duesPaidOnly) parts.push('dues-paid only');
	if (f.includeAllOfficers) parts.push('+ all officers');
	if (f.includeMemberIds.length) parts.push(`+ ${f.includeMemberIds.length} added individually`);
	return parts.join('  ·  ');
}

export function isEmptyResumeFilter(f: ResumeExportFilter): boolean {
	return (
		f.gradYears.length === 0 &&
		!f.duesPaidOnly &&
		!f.includeAllOfficers &&
		f.includeMemberIds.length === 0
	);
}
