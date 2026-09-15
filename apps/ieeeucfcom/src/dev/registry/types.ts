/** A single editable control shown in the gallery's props panel. */
export type ControlDef =
	| { name: string; label?: string; type: 'text'; default?: string }
	| { name: string; label?: string; type: 'boolean'; default?: boolean }
	| {
			name: string;
			label?: string;
			type: 'number';
			default?: number;
			min?: number;
			max?: number;
			step?: number;
	  }
	| { name: string; label?: string; type: 'select'; options: string[]; default?: string };

export type GalleryStatus =
	/** renders and works standalone */
	| 'ok'
	/** renders, but needs live data / session — shown in an empty / loading state */
	| 'legacy'
	/** known to throw or not render — caught by the preview error boundary */
	| 'broken';

export type GalleryGroup =
	'ui' | 'layout' | 'marketing' | 'dashboard' | 'admin' | 'qr' | 'staff' | 'misc';

/** A named preset — a row in the "Variants" section, one click to load its props. */
export interface GalleryVariant {
	name: string;
	props?: Record<string, unknown>;
}

/**
 * Serialisable metadata for one entry. Lives in a non-'use client' module so the
 * server components (the gallery layout + index) can read it. The matching render
 * component is looked up separately, client-side, from `renders.tsx`.
 */
export interface EntryMeta {
	/** URL segment, `group/name` kebab — e.g. `ui/button` */
	slug: string;
	name: string;
	group: GalleryGroup;
	status: GalleryStatus;
	/** import specifier, for the docs header */
	source: string;
	notes?: string;
	controls?: ControlDef[];
	variants?: GalleryVariant[];
	/** preview stage background: marketing (black/yellow) or app (neutral) */
	surface?: 'marketing' | 'app';
}

export const GROUP_LABELS: Record<GalleryGroup, string> = {
	ui: '@watts/ui primitives',
	layout: 'Layout & chrome',
	marketing: 'Marketing',
	dashboard: 'Dashboard',
	admin: 'Admin',
	qr: 'QR / attendance',
	staff: 'Staff',
	misc: 'Misc',
};
