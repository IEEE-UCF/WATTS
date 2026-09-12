import { hasCapability, type Capability } from '@watts/permissions';

/** What a viewer needs to see a nav item — mirrors src/middleware.ts's route table. */
export type NavRequirement = 'member' | 'officer' | 'admin' | 'staff' | Capability;

export interface NavItem {
	label: string;
	href: string;
	requires: NavRequirement;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

/** Only real, routable pages — nothing here should ever 404. */
export const NAV_GROUPS: NavGroup[] = [
	{
		label: 'Member',
		items: [
			{ label: 'Dashboard', href: '/dashboard', requires: 'member' },
			{ label: 'Settings', href: '/settings', requires: 'member' },
		],
	},
	{
		label: 'Staff',
		items: [{ label: 'Staff Hub', href: '/staff', requires: 'staff' }],
	},
	{
		label: 'Admin',
		items: [
			{ label: 'Overview', href: '/admin/dashboard', requires: 'admin' },
			{ label: 'Members', href: '/admin/members', requires: 'officer' },
			{ label: 'Events', href: '/admin/events', requires: 'manage_events' },
			{ label: 'Photos', href: '/admin/photos', requires: 'manage_event_photos' },
			{ label: 'Résumés', href: '/admin/resumes', requires: 'review_resumes' },
		],
	},
];

/** The slice of `auth.getAuthStatus`'s result that nav filtering actually reads. */
export interface NavAuthStatus {
	isMember: boolean;
	isOfficer: boolean;
	isAdmin: boolean;
	hasStaffAccess: boolean;
	permissions: string[];
}

export function meetsRequirement(requires: NavRequirement, auth: NavAuthStatus): boolean {
	switch (requires) {
		case 'member':
			return auth.isMember;
		case 'officer':
			return auth.isOfficer || auth.isAdmin;
		case 'admin':
			return auth.isAdmin;
		case 'staff':
			return auth.hasStaffAccess;
		default:
			return hasCapability(
				{
					administrator: auth.isAdmin,
					officerStatus: auth.isOfficer,
					permissions: auth.permissions,
				},
				requires,
			);
	}
}

export function visibleNavGroups(auth: NavAuthStatus | undefined): NavGroup[] {
	if (!auth) return [];
	return NAV_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) => meetsRequirement(item.requires, auth)),
	})).filter((group) => group.items.length > 0);
}
