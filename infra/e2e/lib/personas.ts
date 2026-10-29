// The cast of the permission suite — one synthetic identity per kind of access a
// real person can have. PURE data (no DB, no Playwright) so the matrix doc renderer
// (scripts/matrix.mts) can import it too; lib/persona-db.ts turns these into rows.
//
// Every persona is a dedicated user + member + session (e2e-perm-<key>@watts.local),
// created by global-setup and removed by global-teardown. Nothing here touches a
// real member row, so the specs that read access can run in parallel.

/** Capability vocabulary, mirrored from @watts/permissions (scripts/matrix.mts checks they match). */
export const CAPS = [
	'scan_attendance',
	'manage_events',
	'manage_event_photos',
	'manage_projects',
	'manage_site_content',
	'review_resumes',
	'manage_links',
	'upload_resume',
] as const;
export type Cap = (typeof CAPS)[number];

/** Grants that open /staff (CAPABILITIES[k].staff). */
export const STAFF_CAPS: readonly Cap[] = CAPS.filter((c) => c !== 'upload_resume');

/** What admins may let officers grant (OFFICER_DELEGABLE_CAPABILITIES). */
export const OFFICER_DELEGABLE: readonly Cap[] = ['scan_attendance', 'manage_event_photos', 'upload_resume', 'manage_links'];

export const EXEC_ROLES = ['Executive Chair', 'Vice Chair', 'Secretary', 'Treasurer'] as const;

/** Fixed fixture ids (valid v4-shaped UUIDs) so a crashed run is recoverable. */
export const FIX = {
	committeeA: 'e2e0000a-0000-4000-8000-0000000000a1',
	committeeB: 'e2e0000a-0000-4000-8000-0000000000b1',
	projectA: 'e2e0000b-0000-4000-8000-0000000000a2',
	projectB: 'e2e0000b-0000-4000-8000-0000000000b2',
	requestA: 'e2e0000c-0000-4000-8000-0000000000a3',
	requestB: 'e2e0000c-0000-4000-8000-0000000000b3',
	linkOwn: 'e2e0000d-0000-4000-8000-0000000000a4', // created by member_manage_links
	linkOther: 'e2e0000d-0000-4000-8000-0000000000b4', // created by officer
	event: 'e2e0000e-0000-4000-8000-0000000000a5',
	privatePhoto: 'e2e0000f-0000-4000-8000-0000000000a6',
} as const;
export const FIX_SLUGS = {
	committeeA: 'e2e-perm-committee-a',
	committeeB: 'e2e-perm-committee-b',
	projectA: 'e2e-perm-project-a',
	projectB: 'e2e-perm-project-b',
	linkOwn: 'e2e-perm-own',
	linkOther: 'e2e-perm-other',
	event: 'e2e-perm-event',
} as const;

export interface GrantSpec {
	cap: Cap | string;
	contextType?: 'global' | 'committee';
	contextId?: string;
	active?: boolean;
	expiresAt?: Date;
}

export interface Persona {
	key: string;
	label: string;
	/** false = signed in with a user row but never registered (no members row). */
	member: boolean;
	administrator: boolean;
	officerStatus: boolean;
	officerRole: string | null;
	grants: GrantSpec[];
	/** committee_members.is_chair on these committees */
	chairOf: ('A' | 'B')[];
	/** committees.chair_id only (no committee_members row) */
	chairIdOf: ('A' | 'B')[];
	leadOf: ('A' | 'B')[];
	pageEditorOf: ('committee:A' | 'project:A')[];
	/** members.resume_key set (no file behind it — enough for the résumé-route gates) */
	resume: boolean;
}

const base: Omit<Persona, 'key' | 'label'> = {
	member: true,
	administrator: false,
	officerStatus: false,
	officerRole: null,
	grants: [],
	chairOf: [],
	chairIdOf: [],
	leadOf: [],
	pageEditorOf: [],
	resume: false,
};
const p = (key: string, label: string, over: Partial<Persona> = {}): Persona => ({ ...base, key, label, ...over });
const YEAR_AGO = new Date('2025-01-01T00:00:00Z');

export const PERSONAS: Persona[] = [
	p('nonmember', 'Signed in, not registered', { member: false }),
	p('member', 'Member', { resume: true }),
	...CAPS.map((cap) => p(`member_${cap}`, `Member + ${cap}`, { grants: [{ cap }] })),
	p('member_expired_grant', 'Member, expired manage_events grant', { grants: [{ cap: 'manage_events', expiresAt: YEAR_AGO }] }),
	p('member_inactive_grant', 'Member, inactive manage_events grant', { grants: [{ cap: 'manage_events', active: false }] }),
	p('member_scoped_grant', 'Member, committee-scoped scan_attendance', {
		grants: [{ cap: 'scan_attendance', contextType: 'committee', contextId: FIX.committeeA }],
	}),
	p('chair_is_chair', 'Committee A chair (is_chair)', { chairOf: ['A'] }),
	p('chair_chair_id', 'Committee A chair (chair_id only)', { chairIdOf: ['A'] }),
	p('lead_a', 'Project A lead', { leadOf: ['A'] }),
	p('editor_a', 'Page editor of committee A', { pageEditorOf: ['committee:A'] }),
	p('officer', 'Officer, chairs nothing', { officerStatus: true, officerRole: 'Workshop Chair' }),
	p('officer_chair_a', 'Officer chairing committee A', { officerStatus: true, officerRole: 'Software Chair', chairOf: ['A'] }),
	p('officer_exec', 'Executive officer', { officerStatus: true, officerRole: 'Treasurer', chairIdOf: ['B'] }),
	p('admin', 'Administrator (not an officer)', { administrator: true }),
	// Mutated by perm-scoped.spec.ts only — never read by the matrix specs.
	p('revoke_officer', 'Officer whose access is revoked mid-session', { officerStatus: true, officerRole: 'Social Chair' }),
	p('grant_target', 'Plain member that the delegation tests grant to / revoke from'),
];

/** Not a DB persona: no cookie at all. */
export const ANON = 'anon';
export type PersonaKey = (typeof PERSONAS)[number]['key'] | typeof ANON;

export const personaByKey = (key: string) => {
	const found = PERSONAS.find((x) => x.key === key);
	if (!found) throw new Error(`unknown persona ${key}`);
	return found;
};

export const personaEmail = (key: string) => `e2e-perm-${key.replace(/_/g, '-')}@watts.local`;
export const PERSONA_EMAIL_LIKE = 'e2e-perm-%@watts.local';
export const storageStatePath = (key: string) => `.auth/perm-${key}.json`;

/** Personas whose access changes mid-run (perm-scoped) — never iterated by the matrix specs. */
export const MUTABLE_PERSONAS = ['revoke_officer', 'grant_target'];

/** Personas the access-matrix specs iterate. */
export const MATRIX_PERSONAS: string[] = [ANON, ...PERSONAS.filter((x) => !MUTABLE_PERSONAS.includes(x.key)).map((x) => x.key)];

/** Written by global-setup: { memberIds, userIds } keyed by persona. */
export const PERSONA_IDS_PATH = '.auth/perm-ids.json';
