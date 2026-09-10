import type { EntryMeta, GalleryGroup } from './types';

const BUTTON_VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'];
const BUTTON_SIZES = ['default', 'sm', 'lg', 'icon'];

/**
 * Every gallery entry's metadata. The render component for `slug` lives in
 * `renders.tsx`. Keep this list and that map in sync — a new component's
 * definition of done includes an entry in both.
 */
export const entriesMeta: EntryMeta[] = [
	// ---- @watts/ui primitives ------------------------------------------------
	{
		slug: 'ui/button',
		name: 'Button',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/button',
		controls: [
			{ name: 'children', type: 'text', default: 'Get involved' },
			{ name: 'variant', type: 'select', options: BUTTON_VARIANTS, default: 'default' },
			{ name: 'size', type: 'select', options: BUTTON_SIZES, default: 'default' },
			{ name: 'disabled', type: 'boolean', default: false },
		],
		variants: BUTTON_VARIANTS.map((v) => ({ name: v, props: { variant: v } })),
	},
	{
		slug: 'ui/card',
		name: 'Card',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/card',
		controls: [
			{ name: 'title', type: 'text', default: 'General Body Meeting' },
			{ name: 'description', type: 'text', default: 'Thursday · ENG2 102' },
			{ name: 'withAction', type: 'boolean', default: true },
			{ name: 'withFooter', type: 'boolean', default: true },
		],
	},
	{
		slug: 'ui/input',
		name: 'Input',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/input',
		controls: [
			{ name: 'placeholder', type: 'text', default: 'you@knights.ucf.edu' },
			{ name: 'disabled', type: 'boolean', default: false },
			{ name: 'invalid', type: 'boolean', default: false },
		],
	},
	{
		slug: 'ui/label',
		name: 'Label',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/label',
		notes: 'Never imported by the app today.',
	},
	{
		slug: 'ui/field',
		name: 'Field',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/field',
		notes: 'Form scaffolding. Used on /settings and /auth/register.',
		controls: [{ name: 'invalid', type: 'boolean', default: false }],
	},
	{
		slug: 'ui/select',
		name: 'Select',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/select',
	},
	{
		slug: 'ui/accordion',
		name: 'Accordion',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/accordion',
		notes: 'Used on /about (about-IEEE section).',
	},
	{
		slug: 'ui/tooltip',
		name: 'Tooltip',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/tooltip',
		notes: 'Never imported by the app today.',
	},
	{
		slug: 'ui/hover-card',
		name: 'HoverCard',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/hover-card',
		notes: 'Never imported by the app today.',
	},
	{
		slug: 'ui/separator',
		name: 'Separator',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/separator',
		notes: 'Never imported by the app today.',
	},
	{
		slug: 'ui/sheet',
		name: 'Sheet',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/sheet',
		notes: 'Never imported — the app hand-rolls fixed-inset modals instead.',
	},
	{
		slug: 'ui/scroll-area',
		name: 'ScrollArea',
		group: 'ui',
		status: 'ok',
		source: '@watts/ui/scroll-area',
	},
	{
		slug: 'ui/navigation-menu',
		name: 'NavigationMenu',
		group: 'ui',
		status: 'legacy',
		source: '@watts/ui/navigation-menu',
		notes: 'Used only by components/avatarmenu.tsx — see layout/avatar-menu.',
	},
	{
		slug: 'ui/carousel',
		name: 'Carousel',
		group: 'ui',
		status: 'legacy',
		source: '@watts/ui/carousel',
		notes: 'Used on the home page and /sponsorships; needs real slides.',
	},
	{
		slug: 'ui/chart',
		name: 'Chart',
		group: 'ui',
		status: 'legacy',
		source: '@watts/ui/chart',
		notes: 'Recharts wrapper. Never imported by the app.',
	},
	{
		slug: 'ui/sidebar',
		name: 'Sidebar',
		group: 'ui',
		status: 'legacy',
		source: '@watts/ui/sidebar',
		notes: 'Large shadcn sidebar. Only SidebarProvider is used today (a blur overlay on /projects). Intended home: the dashboard layout.',
	},

	// ---- app components ----------------------------------------------------
	{
		slug: 'layout/navbar',
		name: 'Navbar',
		group: 'layout',
		status: 'legacy',
		source: '@/components/navbar',
		surface: 'marketing',
		notes: '328 LoC, hardcoded link arrays, sm–lg breakpoint gap, dead CONNECT branch. Rebuild target in the shared-layout PR. Auth cluster needs a session.',
	},
	{
		slug: 'layout/footer',
		name: 'Footer',
		group: 'layout',
		status: 'ok',
		source: '@/components/footer',
		surface: 'marketing',
		notes: '"i stole the component… will edit later". Rebuild target.',
	},
	{
		slug: 'layout/avatar-menu',
		name: 'AvatarMenu',
		group: 'layout',
		status: 'ok',
		source: '@/components/avatarmenu',
		surface: 'marketing',
		controls: [{ name: 'image', type: 'text', default: '' }],
	},
	{
		slug: 'marketing/signin-block',
		name: 'Signinblock',
		group: 'marketing',
		status: 'ok',
		source: '@/components/signin',
		surface: 'marketing',
	},
	{
		slug: 'marketing/timer',
		name: 'Timer (GBM countdown)',
		group: 'marketing',
		status: 'ok',
		source: '@/components/timer',
		surface: 'marketing',
	},
	{
		slug: 'marketing/calendar',
		name: 'Calendar embed',
		group: 'marketing',
		status: 'ok',
		source: '@/components/calendar',
		surface: 'marketing',
		controls: [{ name: 'className', type: 'text', default: 'h-96 w-full' }],
	},
	{
		slug: 'marketing/about-ieee',
		name: 'AboutIEEE section',
		group: 'marketing',
		status: 'ok',
		source: '@/components/pg/aboutieee',
		surface: 'marketing',
	},
	{
		slug: 'marketing/about-header',
		name: 'AboutHeader hero',
		group: 'marketing',
		status: 'ok',
		source: '@/components/pg/aboutheader',
		surface: 'marketing',
	},
	{
		slug: 'staff/staff-hub',
		name: 'StaffHub',
		group: 'staff',
		status: 'legacy',
		source: '@/components/staff/staff-hub',
		notes: 'Capability-gated staff landing. Needs a staff session to show anything.',
	},
	{
		slug: 'dashboard/event-list',
		name: 'EventList',
		group: 'dashboard',
		status: 'legacy',
		source: '@/components/dashboard/event-list',
		notes: 'Imported by /dashboard, /admin/dashboard and /test/demos. Needs event.getAll.',
	},
];

export function getMeta(slug: string): EntryMeta | undefined {
	return entriesMeta.find((e) => e.slug === slug);
}

export function groupedMeta(): { group: GalleryGroup; entries: EntryMeta[] }[] {
	const groups = new Map<GalleryGroup, EntryMeta[]>();
	for (const e of entriesMeta) {
		const list = groups.get(e.group) ?? [];
		list.push(e);
		groups.set(e.group, list);
	}
	return [...groups.entries()].map(([group, entries]) => ({ group, entries }));
}
