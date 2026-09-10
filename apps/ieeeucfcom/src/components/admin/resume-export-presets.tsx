'use client';

// Saved résumé-export presets.
//
// ── SKELETON ────────────────────────────────────────────────────────────────
// Storage is localStorage only — presets live in one staffer's browser. That's
// deliberate for v1. To make presets shared across staff:
//   • add a `resume_export_presets` table (id, name, filter jsonb, created_by,
//     created_at) + migration
//   • add a tiny tRPC router: list / create / delete
//   • reimplement `useResumeExportPresets` against it (React Query)
// The hook's return shape and <ResumeExportPresetBar>'s props are the contract —
// keep them stable and nothing else in the dashboard has to change.
// ───────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
	type ResumeExportFilter,
	describeResumeFilter,
	isEmptyResumeFilter,
} from '@/lib/resume-export/filters';

const STORAGE_KEY = 'watts.resumeExportPresets.v1';

export interface ResumeExportPreset {
	id: string;
	name: string;
	filter: ResumeExportFilter;
	createdAt: string;
}

function readStore(): ResumeExportPreset[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as ResumeExportPreset[]) : [];
	} catch {
		return [];
	}
}

function writeStore(presets: ResumeExportPreset[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
	} catch {
		/* private mode / quota — presets just don't persist this session */
	}
}

export function useResumeExportPresets() {
	const [presets, setPresets] = useState<ResumeExportPreset[]>([]);

	// localStorage is client-only; load after mount.
	useEffect(() => {
		setPresets(readStore());
	}, []);

	const savePreset = useCallback((name: string, filter: ResumeExportFilter) => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setPresets((prev) => {
			const next = [
				...prev.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase()),
				{
					id:
						typeof crypto !== 'undefined' && crypto.randomUUID
							? crypto.randomUUID()
							: String(Date.now()),
					name: trimmed,
					filter,
					createdAt: new Date().toISOString(),
				},
			].sort((a, b) => a.name.localeCompare(b.name));
			writeStore(next);
			return next;
		});
	}, []);

	const deletePreset = useCallback((id: string) => {
		setPresets((prev) => {
			const next = prev.filter((p) => p.id !== id);
			writeStore(next);
			return next;
		});
	}, []);

	return { presets, savePreset, deletePreset };
}

export function ResumeExportPresetBar({
	current,
	onApply,
}: {
	current: ResumeExportFilter;
	onApply: (filter: ResumeExportFilter) => void;
}) {
	const { presets, savePreset, deletePreset } = useResumeExportPresets();

	// SKELETON: window.prompt keeps this to ~0 UI. Swap for an inline
	// name field + "Save" button when you want it to feel less rough.
	const onSaveCurrent = () => {
		if (isEmptyResumeFilter(current)) {
			window.alert('Set at least one filter before saving a preset.');
			return;
		}
		const name = window.prompt('Name this preset (e.g. "Fall Career Fair 2026")');
		if (name) savePreset(name, current);
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-xs tracking-wide text-gray-500 uppercase">Presets</span>

			{presets.length === 0 && <span className="text-xs text-gray-600">none saved</span>}

			{presets.map((p) => (
				<span
					key={p.id}
					className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900 py-1 pr-1 pl-3 text-xs"
				>
					<button
						type="button"
						onClick={() => onApply(p.filter)}
						title={describeResumeFilter(p.filter)}
						className="text-gray-200 hover:text-[var(--ieee-dark-yellow)]"
					>
						{p.name}
					</button>
					<button
						type="button"
						onClick={() => deletePreset(p.id)}
						aria-label={`Delete preset ${p.name}`}
						className="rounded-full px-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
					>
						×
					</button>
				</span>
			))}

			<button
				type="button"
				onClick={onSaveCurrent}
				className="rounded-full border border-dashed border-gray-600 px-3 py-1 text-xs text-gray-400 hover:border-[var(--ieee-dark-yellow)] hover:text-[var(--ieee-dark-yellow)]"
			>
				+ Save current
			</button>
		</div>
	);
}
