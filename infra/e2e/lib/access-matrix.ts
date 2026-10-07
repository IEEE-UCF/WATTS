// THE permission matrix — the single source of truth for who may reach what.
//
//   - The perm-*.spec.ts suites assert the running app against it, persona by persona.
//   - scripts/matrix.mts renders docs/PERMISSIONS.md from it and fails CI when a tRPC
//     procedure, page or route exists that isn't classified here (or the doc is stale).
//
// It is a SPEC, written independently of the implementation: the policy functions
// below say what each gate SHOULD allow, and the specs prove the server agrees.
// Changing who can do something = change it here (+ the code), then
// `pnpm --filter @watts/e2e matrix:doc`.
//
// Items tagged `decision: 'D#'` are known oddities kept as-is on purpose until someone
// decides; they're listed (with the question) in DECISIONS at the bottom.

import { CAPS, EXEC_ROLES, PERSONAS, STAFF_CAPS, type Cap, type Persona } from './personas';

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Capabilities an officer holds without a grant. manage_site_content (every page + the
 * global CMS) is executive-only: other officers edit the committees they chair and any
 * project page, nothing site-wide.
 */
export const OFFICER_IMPLIED_CAPS: readonly Cap[] = CAPS.filter((c) => c !== 'manage_site_content');
/** Capabilities an executive officer holds without a grant. */
export const EXEC_IMPLIED_CAPS: readonly Cap[] = CAPS;

export interface Facts {
	signedIn: boolean;
	member: boolean;
	admin: boolean;
	officer: boolean;
	exec: boolean;
	/** grants the app should honour: active and unexpired (context ignored — D4) */
	live: Cap[];
	chairs: Set<'A' | 'B'>; // website chair: committees.chair_id OR committee_members.is_chair
	leads: Set<'A' | 'B'>;
	editorOf: Set<string>;
	persona: Persona | null;
}

export function factsFor(key: string): Facts {
	if (key === 'anon') {
		return { signedIn: false, member: false, admin: false, officer: false, exec: false, live: [], chairs: new Set(), leads: new Set(), editorOf: new Set(), persona: null };
	}
	const p = PERSONAS.find((x) => x.key === key);
	if (!p) throw new Error(`unknown persona ${key}`);
	const now = Date.now();
	return {
		signedIn: true,
		member: p.member,
		admin: p.member && p.administrator,
		officer: p.member && p.officerStatus,
		exec: p.member && p.officerStatus && (EXEC_ROLES as readonly string[]).includes(p.officerRole ?? ''),
		live: p.member
			? (p.grants
					.filter((g) => g.active !== false && (!g.expiresAt || g.expiresAt.getTime() > now))
					.map((g) => g.cap)
					.filter((c): c is Cap => (CAPS as readonly string[]).includes(c)))
			: [],
		chairs: new Set([...p.chairOf, ...p.chairIdOf]),
		leads: new Set(p.leadOf),
		editorOf: new Set(p.pageEditorOf),
		persona: p,
	};
}

/** Does this person hold `cap` (role-implied or granted)? */
export function holds(f: Facts, cap: Cap): boolean {
	if (!f.member) return false;
	if (f.admin) return true;
	if (f.exec && EXEC_IMPLIED_CAPS.includes(cap)) return true;
	if (f.officer && OFFICER_IMPLIED_CAPS.includes(cap)) return true;
	return f.live.includes(cap);
}

export const isOfficerOrAdmin = (f: Facts) => f.admin || f.officer;
export const hasStaffAccess = (f: Facts) => isOfficerOrAdmin(f) || f.live.some((c) => STAFF_CAPS.includes(c));

/** May this person edit a committee/project page (canEditScope)? */
export function canEditPage(f: Facts, scope: 'committee:A' | 'committee:B' | 'project:A' | 'project:B'): boolean {
	if (holds(f, 'manage_site_content')) return true;
	if (!f.member) return false;
	const [type, id] = scope.split(':') as ['committee' | 'project', 'A' | 'B'];
	if (type === 'project' && f.officer) return true; // any officer, any project
	if (f.editorOf.has(scope)) return true;
	return type === 'committee' ? f.chairs.has(id) : f.leads.has(id);
}
/** Does an edit by this person go live immediately (vs. the review queue)? */
export function publishesDirectly(f: Facts, scope: 'committee:A' | 'committee:B' | 'project:A' | 'project:B'): boolean {
	if (holds(f, 'manage_site_content')) return true;
	if (!f.officer) return false;
	const [type, id] = scope.split(':') as ['committee' | 'project', 'A' | 'B'];
	return type === 'project' || f.chairs.has(id); // an officer, within their scope
}

/** May this person change a committee's members / chairs (committee.addMember etc.)? */
export const canManageCommittee = (f: Facts, c: 'A' | 'B') => f.admin || f.exec || (f.officer && f.chairs.has(c));
/** May this person change a project's members / lead (project.addMember etc.)? */
export const canManageProject = (f: Facts, p: 'A' | 'B') => holds(f, 'manage_projects') || (f.member && f.leads.has(p));

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export type Gate =
	| 'public'
	| 'session' // signed in (a members row is not required)
	| 'member' // has a members row
	| 'officer' // officer or admin
	| 'admin'
	| { cap: Cap };

export type ApiOutcome = 'allow' | 'unauth' | 'forbidden';

export function apiOutcome(gate: Gate, f: Facts): ApiOutcome {
	if (gate === 'public') return 'allow';
	if (!f.signedIn) return 'unauth';
	if (gate === 'session') return 'allow';
	if (gate === 'member') return f.member ? 'allow' : 'forbidden';
	if (gate === 'officer') return isOfficerOrAdmin(f) ? 'allow' : 'forbidden';
	if (gate === 'admin') return f.admin ? 'allow' : 'forbidden';
	return holds(f, gate.cap) ? 'allow' : 'forbidden';
}

export const gateLabel = (g: Gate) => (typeof g === 'string' ? g : `cap:${g.cap}`);

// ---------------------------------------------------------------------------
// tRPC procedures — every one in packages/api/src/root.ts
// ---------------------------------------------------------------------------

export interface ProcEntry {
	type: 'query' | 'mutation';
	/** false = the procedure takes no input (the auth probe can't use invalid input to stop it) */
	input: boolean;
	gate: Gate;
	/** An extra per-record check inside the procedure, beyond the gate (covered by perm-scoped). */
	scoped?: string;
	decision?: string;
	note?: string;
}

type Opts = Omit<ProcEntry, 'type' | 'input' | 'gate'>;
const q = (gate: Gate, o: Opts = {}): ProcEntry => ({ type: 'query', input: true, gate, ...o });
const q0 = (gate: Gate, o: Opts = {}): ProcEntry => ({ type: 'query', input: false, gate, ...o });
const m = (gate: Gate, o: Opts = {}): ProcEntry => ({ type: 'mutation', input: true, gate, ...o });
const m0 = (gate: Gate, o: Opts = {}): ProcEntry => ({ type: 'mutation', input: false, gate, ...o });
const cap = (c: Cap): Gate => ({ cap: c });

export const PROCEDURES: Record<string, ProcEntry> = {
	// --- auth: read-only "who am I" status, safe for anyone
	'auth.getSession': q0('public'),
	'auth.isAuthenticated': q0('public'),
	'auth.isMember': q0('public'),
	'auth.isOfficer': q0('public'),
	'auth.isAdmin': q0('public'),
	'auth.getOfficerRole': q0('public'),
	'auth.hasPaidDues': q0('public'),
	'auth.getAuthStatus': q0('public'),

	// --- member
	'member.completeRegistration': m('session', { note: "creates the caller's own member row" }),
	'member.updateMyProfile': m('member', { scoped: 'own profile only' }),
	'member.getMyProfile': q0('member', { scoped: 'own profile only' }),
	'member.getMyDashboard': q0('member', { scoped: 'own data only' }),
	'member.getAll': q0('admin'),
	'member.getOrgStats': q0('admin'),
	'member.listForAdmin': q0('officer'),
	'member.getById': q('officer'),
	'member.setPermission': m('officer', {
		scoped: 'officers: only admin-enabled delegable capabilities, only for plain members (core/members.ts setMemberCapability)',
	}),
	'member.setAdmin': m('admin', { scoped: "can't remove your own admin" }),
	'member.setOfficer': m('admin'),

	// --- officer
	'officer.getAll': q0('public'),
	'officer.getById': q('public'),
	'officer.promote': m('admin'),
	'officer.demote': m('admin'),
	'officer.listResumes': q0(cap('review_resumes')),

	// --- event
	'event.getAll': q0('public'),
	'event.getById': q('public'),
	'event.getBySlug': q('public'),
	'event.next': q('public'),
	'event.listPhotos': q('public', { note: 'approved + public photos only' }),
	'event.getAllForAdmin': q0(cap('manage_events')),
	'event.getAttendees': q(cap('manage_events')),
	'event.roomReservationAlerts': q0(cap('manage_events')),
	'event.create': m(cap('manage_events')),
	'event.update': m(cap('manage_events'), { decision: 'D9' }),
	'event.delete': m(cap('manage_events'), { decision: 'D9' }),
	'event.restore': m(cap('manage_events')),
	'event.hardDelete': m(cap('manage_events'), { decision: 'D9' }),
	'event.confirmFlyer': m(cap('manage_events')),
	'event.importFromGoogle': m(cap('manage_events')),
	'event.resync': m(cap('manage_events')),
	'event.todaysCheckIns': q0(cap('scan_attendance')),
	'event.addAttendee': m(cap('scan_attendance')),
	'event.pendingVisibilityCount': q0(cap('manage_event_photos')),
	'event.adminListPhotos': q(cap('manage_event_photos')),
	'event.searchPhotos': q(cap('manage_event_photos')),
	'event.confirmPhoto': m(cap('manage_event_photos')),
	'event.updatePhoto': m(cap('manage_event_photos')),
	'event.deletePhoto': m(cap('manage_event_photos')),

	// --- eventLabel
	'eventLabel.list': q0('public'),
	'eventLabel.nativeLabels': q0(cap('manage_events')),
	'eventLabel.create': m(cap('manage_events')),
	'eventLabel.update': m(cap('manage_events')),
	'eventLabel.setActive': m(cap('manage_events')),
	'eventLabel.pullFromGoogle': m0(cap('manage_events'), { note: 'calls Google — probed only for denial' }),

	// --- project
	'project.getAll': q0('public'),
	'project.getById': q('public'),
	'project.getBySlug': q('public'),
	'project.create': m(cap('manage_projects')),
	'project.update': m(cap('manage_projects')),
	'project.delete': m(cap('manage_projects')),
	'project.confirmPhoto': m(cap('manage_projects')),
	'project.reorder': m(cap('manage_projects')),
	'project.removePhoto': m(cap('manage_projects')),
	'project.reorderPhotos': m(cap('manage_projects')),
	'project.listMembers': q('member', { scoped: 'manage_projects (any officer), or lead of THAT project' }),
	'project.addMember': m('member', { scoped: 'manage_projects (any officer), or lead of THAT project; a lead can’t remove themselves' }),
	'project.removeMember': m('member', { scoped: 'manage_projects (any officer), or lead of THAT project; a lead can’t remove themselves' }),
	'project.setLead': m('member', { scoped: 'manage_projects (any officer), or lead of THAT project; a lead can’t remove themselves' }),
	'project.requestMembership': m('member'),
	'project.listMembershipRequests': q('member', { scoped: 'manage_projects, or lead of THAT project' }),
	'project.approveRequest': m('member', { scoped: 'manage_projects, or lead of THAT project; request must belong to it' }),
	'project.denyRequest': m('member', { scoped: 'manage_projects, or lead of THAT project; request must belong to it' }),
	'project.myLeadRequests': q0('member', { scoped: 'own led projects' }),
	'project.myLedProjects': q0('member', { scoped: 'own led projects' }),
	'project.updateOwnProjectInfo': m('member', { scoped: 'manage_projects, or lead of THAT project (hardware/software/skills only)' }),

	// --- projectCategory
	'projectCategory.list': q0('public'),
	'projectCategory.create': m(cap('manage_projects')),
	'projectCategory.update': m(cap('manage_projects')),
	'projectCategory.setArchived': m(cap('manage_projects')),

	// --- committee
	'committee.getAll': q0('officer', { note: 'canManage flag per committee' }),
	'committee.listMembers': q('officer'),
	'committee.create': m('admin'),
	'committee.addMember': m('officer', { scoped: 'executive officer / admin, or an officer chairing THAT committee; a non-exec chair can’t remove themselves' }),
	'committee.removeMember': m('officer', { scoped: 'executive officer / admin, or an officer chairing THAT committee; a non-exec chair can’t remove themselves' }),
	'committee.setChair': m('officer', { scoped: 'executive officer / admin, or an officer chairing THAT committee; a non-exec chair can’t remove themselves' }),

	// --- award / meetingTime
	'award.getAll': q('public'),
	'award.getById': q('public'),
	'award.create': m('admin'),
	'award.update': m('admin'),
	'award.delete': m('admin'),
	'meetingTime.getAll': q0('public'),
	'meetingTime.create': m('admin'),
	'meetingTime.update': m('admin'),
	'meetingTime.delete': m('admin'),

	// --- storage (résumé)
	'storage.resumeUploadPolicy': q0('session'),
	'storage.confirmResume': m('session', { scoped: 'résumé upload audience (admin, upload_resume grant, or RESUME_UPLOAD_AUDIENCE)', decision: 'D6' }),
	'storage.deleteMyResume': m0('session', { scoped: 'own résumé only', note: 'probed only for denial' }),

	// --- settings
	'settings.officerGrantableCapabilities': q0('officer'),
	'settings.setOfficerGrantableCapabilities': m('admin'),

	// --- shortLink
	'shortLink.list': q0(cap('manage_links')),
	'shortLink.history': q(cap('manage_links')),
	'shortLink.eventOptions': q0(cap('manage_links')),
	'shortLink.create': m(cap('manage_links')),
	'shortLink.update': m(cap('manage_links'), { scoped: 'officers/admins: any link; grant holders: links they created' }),
	'shortLink.setActive': m(cap('manage_links'), { scoped: 'officers/admins: any link; grant holders: links they created' }),

	// --- siteContent: site-wide CMS
	'siteContent.refreshCache': m0(cap('manage_site_content'), { note: 'probed only for denial' }),
	'siteContent.listSlots': q0(cap('manage_site_content')),
	'siteContent.setSlot': m(cap('manage_site_content')),
	'siteContent.listOfficers': q0(cap('manage_site_content')),
	'siteContent.memberOptions': q0(cap('manage_site_content')),
	'siteContent.createOfficer': m(cap('manage_site_content')),
	'siteContent.updateOfficer': m(cap('manage_site_content')),
	'siteContent.deleteOfficer': m(cap('manage_site_content')),
	'siteContent.reorderOfficers': m(cap('manage_site_content')),
	'siteContent.listSponsors': q0(cap('manage_site_content')),
	'siteContent.createSponsor': m(cap('manage_site_content')),
	'siteContent.updateSponsor': m(cap('manage_site_content')),
	'siteContent.deleteSponsor': m(cap('manage_site_content')),
	'siteContent.reorderSponsors': m(cap('manage_site_content')),
	'siteContent.listPending': q0(cap('manage_site_content')),
	'siteContent.approve': m(cap('manage_site_content')),
	'siteContent.reject': m(cap('manage_site_content')),
	'siteContent.history': q(cap('manage_site_content')),
	'siteContent.restore': m(cap('manage_site_content')),
	'siteContent.listPageEditors': q0(cap('manage_site_content')),
	'siteContent.assignPageEditor': m(cap('manage_site_content')),
	'siteContent.revokePageEditor': m(cap('manage_site_content')),
	// --- siteContent: per-page / self-service
	'siteContent.confirmMedia': m('session', { scoped: 'canEditScope on the media scope (or own officer portrait)' }),
	'siteContent.editablePages': q0('session', { scoped: 'lists only pages the caller may edit' }),
	'siteContent.pageForEdit': q('session', { scoped: 'canEditScope' }),
	'siteContent.submitCommitteePage': m('session', { scoped: 'canEditScope; non-staff edits go to review' }),
	'siteContent.submitProjectPage': m('session', { scoped: 'canEditScope; non-staff edits go to review' }),
	'siteContent.myOfficerProfile': q0('member', { scoped: 'own linked officer profile' }),
	'siteContent.submitMyOfficerProfile': m('member', { scoped: 'own linked officer profile; goes to review' }),
	'siteContent.myRevisions': q0('member', { scoped: 'own revisions' }),
};

// ---------------------------------------------------------------------------
// Pages — every page.tsx under apps/ieeeucfcom/src/app
// ---------------------------------------------------------------------------

/** What a GET of the page returns (no redirect following). */
export type PageOutcome = 'render' | 'notfound' | 'reachable' | 'dashboard' | 'signin';

export interface PageEntry {
	/** Next route pattern (route groups stripped), e.g. /committees/[slug] */
	route: string;
	/** Concrete path to request, or null = not probed (public/dynamic — covered by pages.spec). */
	probe: string | null;
	/** Human summary for the doc. */
	gate: string;
	expect: (f: Facts) => PageOutcome;
	decision?: string;
	note?: string;
}

const signin = (f: Facts, then: () => PageOutcome): PageOutcome => (f.signedIn ? then() : 'signin');
const pub = (route: string, note?: string): PageEntry => ({ route, probe: null, gate: 'public', expect: () => 'render', note });

export const PAGES: PageEntry[] = [
	pub('/'),
	pub('/about'),
	pub('/committees'),
	pub('/committees/[slug]', 'published committees only, else 404'),
	pub('/connect'),
	pub('/events'),
	pub('/events/[ref]'),
	pub('/events/[ref]/[name]'),
	pub('/link-retired'),
	pub('/projects'),
	pub('/projects/[slug]', 'published projects only, else 404'),
	pub('/sponsorships'),
	pub('/auth/signin'),
	pub('/auth/register', 'the post-sign-in registration form'),
	{ route: '/dashboard', probe: '/dashboard', gate: 'session', expect: (f) => signin(f, () => 'render') },
	{ route: '/settings', probe: '/settings', gate: 'session', expect: (f) => signin(f, () => 'render') },
	{
		route: '/pages/[type]/[slug]/edit',
		probe: '/pages/committee/e2e-perm-committee-a/edit',
		gate: 'session (per-page check in siteContent.pageForEdit)',
		expect: (f) => signin(f, () => 'render'),
	},
	{
		route: '/pages/[type]/[slug]/preview',
		probe: '/pages/committee/e2e-perm-committee-a/preview',
		gate: 'session + canEditScope, else 404',
		expect: (f) => signin(f, () => (canEditPage(f, 'committee:A') ? 'render' : 'notfound')),
	},
	{
		route: '/staff',
		probe: '/staff',
		gate: 'officer, admin, or any staff-capability grant',
		expect: (f) => signin(f, () => (hasStaffAccess(f) ? 'render' : 'dashboard')),
	},
	{
		route: '/admin/members',
		probe: '/admin/members',
		gate: 'officer or admin',
		expect: (f) => signin(f, () => (isOfficerOrAdmin(f) ? 'render' : 'dashboard')),
	},
	...(
		[
			['/admin/events', 'manage_events'],
			['/admin/photos', 'manage_event_photos'],
			['/admin/resumes', 'review_resumes'],
			['/admin/site-content', 'manage_site_content'],
			['/admin/links', 'manage_links'],
			['/admin/projects', 'manage_projects'],
		] as [string, Cap][]
	).map(
		([route, c]): PageEntry => ({
			route,
			probe: route,
			gate: `/admin floor (officer or admin) + ${c}`,
			expect: (f) => signin(f, () => (isOfficerOrAdmin(f) && holds(f, c) ? 'render' : 'dashboard')),
			decision: 'D1',
		}),
	),
	{ route: '/admin/dashboard', probe: '/admin/dashboard', gate: 'admin', expect: (f) => signin(f, () => (f.admin ? 'render' : 'dashboard')) },
	...['/test/demos', '/test/scan-qr', '/test/show-id', '/test/test-qr', '/style-guide', '/component-showcase'].map(
		(route): PageEntry => ({
			route,
			probe: route,
			gate: 'admin (middleware only — no server-side guard)',
			expect: (f) => signin(f, () => (f.admin ? 'render' : 'dashboard')),
			decision: 'D3',
		}),
	),
	{
		route: '/dev',
		probe: '/dev',
		gate: 'admin; 404 in production unless NEXT_PUBLIC_ENABLE_DEV_GALLERY=1',
		expect: (f) => signin(f, () => (f.admin ? 'reachable' : 'dashboard')),
	},
	{
		route: '/dev/[...slug]',
		probe: null,
		gate: 'admin; 404 in production unless NEXT_PUBLIC_ENABLE_DEV_GALLERY=1',
		expect: (f) => signin(f, () => (f.admin ? 'reachable' : 'dashboard')),
	},
];

// ---------------------------------------------------------------------------
// HTTP routes — every route.ts under apps/ieeeucfcom/src/app
// ---------------------------------------------------------------------------

export interface RouteEntry {
	route: string;
	method: 'GET' | 'POST';
	gate: string;
	/** null = framework / public route, not probed by perm-routes */
	expect: ((f: Facts, env: { resumeAudience: string }) => ApiOutcome) | null;
	decision?: string;
	note?: string;
}

const resumeUploadAllowed = (f: Facts, audience: string) => {
	if (!f.member) return false;
	if (f.admin || f.live.includes('upload_resume')) return true;
	if (audience === 'members') return true;
	if (audience === 'officers') return f.officer;
	return false;
};

export const ROUTES: RouteEntry[] = [
	{ route: '/api/auth/[...nextauth]', method: 'GET', gate: 'NextAuth', expect: null },
	{ route: '/api/trpc/[trpc]', method: 'POST', gate: 'per procedure (see above)', expect: null },
	{ route: '/go/[slug]', method: 'GET', gate: 'public redirect', expect: null },
	{ route: '/events/[ref]/calendar.ics', method: 'GET', gate: 'public', expect: null },
	{
		route: '/api/files/resume/export',
		method: 'GET',
		gate: 'review_resumes',
		expect: (f) => (!f.signedIn ? 'unauth' : holds(f, 'review_resumes') ? 'allow' : 'forbidden'),
	},
	{
		route: '/api/files/resume/[memberId]',
		method: 'GET',
		gate: 'owner, or review_resumes',
		expect: (f) => (!f.signedIn ? 'unauth' : f.persona?.key === 'member' || holds(f, 'review_resumes') ? 'allow' : 'forbidden'),
		note: "probed against the `member` persona's résumé",
	},
	{
		route: '/api/files/event-photo/[id]',
		method: 'GET',
		gate: 'public photo: anyone; otherwise manage_event_photos',
		expect: (f) => (!f.signedIn ? 'unauth' : holds(f, 'manage_event_photos') ? 'allow' : 'forbidden'),
		note: 'probed with a members-only, unapproved photo',
	},
	{
		route: '/api/blob/upload',
		method: 'POST',
		gate: 'per kind — résumé: upload audience; event-flyer: manage_events; project-photo: manage_projects; event-photo: manage_event_photos; site-media: canEditScope',
		expect: (f, env) => (!f.signedIn ? 'unauth' : resumeUploadAllowed(f, env.resumeAudience) ? 'allow' : 'forbidden'),
		decision: 'D6',
		note: 'expect() covers kind=resume; perm-routes probes every kind',
	},
];

export const UPLOAD_KINDS: { kind: string; expect: (f: Facts, env: { resumeAudience: string }) => ApiOutcome }[] = [
	{ kind: 'resume', expect: (f, env) => (!f.signedIn ? 'unauth' : resumeUploadAllowed(f, env.resumeAudience) ? 'allow' : 'forbidden') },
	{ kind: 'event-flyer', expect: (f) => apiOutcome(cap('manage_events'), f) },
	{ kind: 'project-photo', expect: (f) => apiOutcome(cap('manage_projects'), f) },
	{ kind: 'event-photo', expect: (f) => apiOutcome(cap('manage_event_photos'), f) },
	{ kind: 'site-media', expect: (f) => (!f.signedIn ? 'unauth' : canEditPage(f, 'committee:A') ? 'allow' : 'forbidden') },
];

// ---------------------------------------------------------------------------
// Discord bot (apps/dbot) — checked by `pnpm --filter @watts/bot check:tier`
// ---------------------------------------------------------------------------

export const BOT_TIERS = [
	['GUEST (0)', 'not in the database'],
	['MEMBER (1)', 'registered member'],
	['COMMITTEE_MEMBER (2)', 'on ≥1 committee'],
	['PROJECT_LEAD (3)', 'leads ≥1 project'],
	['COMMITTEE_CHAIR (4)', 'committee_members.is_chair on ≥1 committee (D7)'],
	['OFFICER (5)', 'officer_status'],
	['EXECUTIVE (6)', 'officer with role Executive Chair / Vice Chair / Secretary / Treasurer'],
	['ADMINISTRATOR (7)', 'administrator flag, or the bot OWNER_ID'],
] as const;

export const BOT_COMMANDS = [
	['ADMINISTRATOR', '/announcement, /members, /reload, /shutdown, /join, /leave'],
	['GUEST', '/assistance, /events, /help, /info, /larry, /ping, /resume, /stats, /test, /whois (D8)'],
] as const;

// ---------------------------------------------------------------------------
// Open decisions — current behaviour is locked in by the specs; flip both when decided.
// ---------------------------------------------------------------------------

export const DECISIONS: Record<string, string> = {
	D1: 'A plain member holding a capability grant (e.g. manage_links) still cannot open the matching /admin/* page: app/admin/layout.tsx requires officer or admin first. Should grant holders get in?',
	D2: 'RESOLVED: /admin/projects now opens for officers and admins (middleware checks manage_projects, like the other /admin capability pages).',
	D3: '/test/*, /style-guide and /component-showcase are guarded by middleware only (no server-side check). Add a server guard or delete the pages?',
	D4: 'Committee-scoped capability grants act site-wide, and revoking in /admin/members leaves scoped rows behind. Honour the scope, or drop scoped grants?',
	D5: '/admin/members lists expired grants as if they were live. Hide them?',
	D6: 'Officers can only upload a résumé when RESUME_UPLOAD_AUDIENCE allows it (default: admins), unlike every other capability. Intended?',
	D7: 'The bot counts only committee_members.is_chair as chair; the website also counts committees.chair_id. Align them?',
	D8: "/whois is open to everyone (GUEST) and posts a member's profile, including the résumé link, publicly in the channel. Restrict it?",
	D9: 'Any manage_events holder can edit or hard-delete any event — the creator is recorded but never checked. Add owner scoping?',
	D10: "Middleware matches prefixes (startsWith('/test') would also catch a future /testimonials) and has a dead '/scan-qr' rule. Tighten?",
};
