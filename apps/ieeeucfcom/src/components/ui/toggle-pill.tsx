'use client';
import * as React from 'react';
import { cn } from '@watts/ui/cn';

/**
 * Shared toggle-button look for the admin surface. Consolidates 5 previously
 * independent hand-rolled toggle buttons (event-manager's LabelBar chip,
 * members-manager's admin/officer/capability toggles, resume-filter-bar's
 * grad-year pill) that had all converged on the same unselected state
 * (border-border/input text-muted-foreground hover:border-foreground) but
 * each wrote it out separately, with 4 different selected-state colors.
 *
 * IEEE brand colors, not semantic tokens — lives app-local next to
 * glow-button.tsx rather than in @watts/ui for the same reason that does.
 */
type ToggleTone = 'brand' | 'brand-outline' | 'info' | 'success';
type ToggleSize = 'sm' | 'xs' | 'pill';

const VARIANTS: Record<ToggleTone, { selected: string; unselected: string }> = {
	brand: {
		selected: 'bg-ieee-dark-yellow text-black',
		unselected: 'border border-border text-muted-foreground hover:border-foreground',
	},
	'brand-outline': {
		selected: 'border border-ieee-dark-yellow bg-ieee-dark-yellow/15 text-ieee-dark-yellow',
		unselected: 'border border-input text-muted-foreground hover:border-foreground',
	},
	info: {
		selected: 'bg-blue-600 text-white',
		unselected: 'border border-border text-muted-foreground hover:border-foreground',
	},
	success: {
		selected: 'bg-green-700 text-white',
		unselected: 'border border-border text-muted-foreground hover:border-foreground',
	},
};

const SIZE_CLASSES: Record<ToggleSize, string> = {
	sm: 'rounded px-2 py-1 text-xs font-semibold',
	xs: 'rounded px-1.5 py-0.5 text-xs',
	pill: 'rounded-full px-3 py-1 text-xs',
};

export interface TogglePillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	selected: boolean;
	tone?: ToggleTone;
	size?: ToggleSize;
}

export function TogglePill({
	selected,
	tone = 'brand',
	size = 'sm',
	className,
	...props
}: TogglePillProps) {
	const variant = VARIANTS[tone];
	return (
		<button
			type="button"
			className={cn(
				SIZE_CLASSES[size],
				'disabled:opacity-40',
				selected ? variant.selected : variant.unselected,
				className,
			)}
			{...props}
		/>
	);
}
