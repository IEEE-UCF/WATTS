// Capability vocabulary — the single source of truth for granular permissions.
//
// A member "has" a capability if ANY of these is true:
//   - member.administrator            (admins can do everything)
//   - member.officerStatus, and the capability is implied for officers
//   - an executive officer (EXECUTIVE_OFFICER_ROLES), and it is implied for executives
//   - an active member_permissions row with permission = <capability>
//
// `staff: true`  → a staff tool; grants /staff access and shows in the nav.
// `staff: false` → a member-facing feature grant (e.g. an upload pilot); does NOT
//                  make the member "staff".
// `impliedFor`   → 'officer': every officer has it without a grant.
//                  'executive': only executive officers (and admins) have it without a
//                  grant — other officers need an explicit grant.
//
// Add a capability here + enforce it with capabilityProcedure(...) — no migration
// needed (member_permissions.permission is a plain varchar). Then classify it in
// infra/e2e/lib/access-matrix.ts (docs/PERMISSIONS.md is generated from it).

export const CAPABILITIES = {
	scan_attendance: { label: 'Scan event check-in', staff: true, impliedFor: 'officer' },
	manage_events: { label: 'Create & edit events', staff: true, impliedFor: 'officer' },
	manage_event_photos: { label: 'Upload & manage event photos', staff: true, impliedFor: 'officer' },
	manage_projects: { label: 'Create & edit projects', staff: true, impliedFor: 'officer' },
	// Site-content CMS: page media, officer roster, sponsors, documents, review queue,
	// assigning per-page editors, and editing EVERY committee/project page. Executive-only
	// by default: other officers edit the committees they chair (and any project page) —
	// see @watts/core/site-content canEditScope. Chairs/leads/assigned editors edit their
	// own page without it (their edits go to review).
	manage_site_content: { label: 'Edit website content', staff: true, impliedFor: 'executive' },
	review_resumes: { label: 'View résumés', staff: true, impliedFor: 'officer' },
	// /admin/links: /go/<slug> short links + branded QR codes. A granted (non-officer)
	// member can edit only the links they made — see @watts/core/short-links.
	manage_links: { label: 'Create short links & QR codes', staff: true, impliedFor: 'officer' },
	// Résumé-upload rollout — Phase 2: grant to a pilot cohort while the env audience
	// stays at "officers". Phase 3 = flip RESUME_UPLOAD_AUDIENCE to "members".
	upload_resume: { label: 'Upload a résumé (pilot)', staff: false, impliedFor: 'officer' },
} as const satisfies Record<string, { label: string; staff: boolean; impliedFor: 'officer' | 'executive' }>;

export type Capability = keyof typeof CAPABILITIES;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as Capability[];
export const STAFF_CAPABILITY_KEYS = CAPABILITY_KEYS.filter((k) => CAPABILITIES[k].staff);

/** Officer roles with org-wide reach (bot tier EXECUTIVE; every committee on the website). */
export const EXECUTIVE_OFFICER_ROLES = [
	'Executive Chair',
	'Vice Chair',
	'Secretary',
	'Treasurer',
] as const;

// Capabilities an admin MAY choose to let officers grant to plain members.
// (Role changes, manage_events, manage_projects, and review_resumes are never
// officer-delegable — officers already have them via officerStatus above.)
export const OFFICER_DELEGABLE_CAPABILITIES = [
	'scan_attendance',
	'manage_event_photos',
	'upload_resume',
	'manage_links',
] as const satisfies readonly Capability[];
export type OfficerDelegableCapability = (typeof OFFICER_DELEGABLE_CAPABILITIES)[number];

export function isOfficerDelegable(cap: string): cap is OfficerDelegableCapability {
	return (OFFICER_DELEGABLE_CAPABILITIES as readonly string[]).includes(cap);
}

export function isCapability(v: string): v is Capability {
	return v in CAPABILITIES;
}

/** Does this list of granted permission strings include any staff capability? */
export function hasStaffCapability(permissions: string[] | null | undefined): boolean {
	if (!Array.isArray(permissions)) return false;
	return permissions.some((p) => (STAFF_CAPABILITY_KEYS as string[]).includes(p));
}

export interface CapabilitySubject {
	administrator?: boolean | null;
	officerStatus?: boolean | null;
	officerRole?: string | null;
	permissions?: string[] | null;
}

/** Admin, or an officer holding an executive role — org-wide reach. */
export function isExecutive(subject: CapabilitySubject | null | undefined): boolean {
	if (!subject) return false;
	if (subject.administrator) return true;
	return Boolean(
		subject.officerStatus &&
			subject.officerRole &&
			(EXECUTIVE_OFFICER_ROLES as readonly string[]).includes(subject.officerRole),
	);
}

export function hasCapability(subject: CapabilitySubject | null | undefined, cap: Capability): boolean {
	if (!subject) return false;
	if (subject.administrator) return true;
	const implied = CAPABILITIES[cap].impliedFor;
	if (subject.officerStatus && implied === 'officer') return true;
	if (implied === 'executive' && isExecutive(subject)) return true;
	return Array.isArray(subject.permissions) && subject.permissions.includes(cap);
}
