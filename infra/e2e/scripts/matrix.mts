/**
 * Permission-matrix tooling (no server, no database):
 *
 *   pnpm --filter @watts/e2e matrix:check   # CI: coverage + doc freshness
 *   pnpm --filter @watts/e2e matrix:doc     # rewrite docs/PERMISSIONS.md
 *
 * --check fails when:
 *   - a tRPC procedure in packages/api/src/root.ts has no entry in lib/access-matrix.ts
 *     (or the entry's query/mutation / has-input flags are wrong), or vice versa;
 *   - a page.tsx / route.ts under apps/ieeeucfcom/src/app isn't classified;
 *   - lib/personas.ts's capability lists drift from @watts/permissions;
 *   - docs/PERMISSIONS.md isn't what this script renders.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRouter } from '@watts/api/root';
import {
	CAPABILITIES,
	CAPABILITY_KEYS,
	OFFICER_DELEGABLE_CAPABILITIES,
	STAFF_CAPABILITY_KEYS,
} from '@watts/permissions';
import { EXECUTIVE_OFFICER_ROLES } from '@watts/permissions/tier';
import {
	BOT_COMMANDS,
	BOT_TIERS,
	DECISIONS,
	EXEC_IMPLIED_CAPS,
	OFFICER_IMPLIED_CAPS,
	PAGES,
	PROCEDURES,
	ROUTES,
	UPLOAD_KINDS,
	apiOutcome,
	canEditPage,
	canManageCommittee,
	canManageProject,
	factsFor,
	gateLabel,
	publishesDirectly,
	type ApiOutcome,
	type Facts,
	type PageOutcome,
	type ProcEntry,
} from '../lib/access-matrix';
import { CAPS, EXEC_ROLES, OFFICER_DELEGABLE, STAFF_CAPS, type Cap } from '../lib/personas';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APP_DIR = join(ROOT, 'apps', 'ieeeucfcom', 'src', 'app');
const DOC = join(ROOT, 'docs', 'PERMISSIONS.md');
const mode = process.argv.includes('--write') ? 'write' : 'check';

const errors: string[] = [];

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

const procs = (appRouter as unknown as { _def: { procedures: Record<string, { _def: { type: string; inputs: unknown[] } }> } })._def
	.procedures;
for (const [path, p] of Object.entries(procs)) {
	const entry = PROCEDURES[path];
	if (!entry) {
		errors.push(`tRPC ${path} is not in lib/access-matrix.ts PROCEDURES — classify who may call it`);
		continue;
	}
	if (entry.type !== p._def.type) errors.push(`tRPC ${path}: matrix says ${entry.type}, router says ${p._def.type}`);
	if (entry.input !== p._def.inputs.length > 0)
		errors.push(`tRPC ${path}: matrix says input=${entry.input}, router has ${p._def.inputs.length} input parser(s)`);
}
for (const path of Object.keys(PROCEDURES)) if (!procs[path]) errors.push(`matrix PROCEDURES has ${path}, which no longer exists`);

function walk(dir: string, file: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(full, file));
		else if (e.name === file) out.push(full);
	}
	return out;
}
const toRoute = (full: string) => {
	const segs = relative(APP_DIR, dirname(full))
		.split(sep)
		.filter((s) => s && !(s.startsWith('(') && s.endsWith(')')));
	return `/${segs.join('/')}`;
};
const pageRoutes = walk(APP_DIR, 'page.tsx').map(toRoute);
const routeRoutes = walk(APP_DIR, 'route.ts').map(toRoute);
for (const r of pageRoutes) if (!PAGES.some((p) => p.route === r)) errors.push(`page ${r} is not in lib/access-matrix.ts PAGES`);
for (const p of PAGES) if (!pageRoutes.includes(p.route)) errors.push(`matrix PAGES has ${p.route}, which no longer exists`);
for (const r of routeRoutes) if (!ROUTES.some((x) => x.route === r)) errors.push(`route ${r} is not in lib/access-matrix.ts ROUTES`);
for (const x of ROUTES) if (!routeRoutes.includes(x.route)) errors.push(`matrix ROUTES has ${x.route}, which no longer exists`);

const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
if (!same(CAPS, CAPABILITY_KEYS)) errors.push(`lib/personas.ts CAPS ≠ @watts/permissions CAPABILITY_KEYS (${CAPABILITY_KEYS.join(', ')})`);
if (!same(STAFF_CAPS, STAFF_CAPABILITY_KEYS)) errors.push('lib/personas.ts STAFF_CAPS ≠ @watts/permissions STAFF_CAPABILITY_KEYS');
if (!same(OFFICER_DELEGABLE, OFFICER_DELEGABLE_CAPABILITIES)) errors.push('lib/personas.ts OFFICER_DELEGABLE ≠ @watts/permissions OFFICER_DELEGABLE_CAPABILITIES');
if (!same(EXEC_ROLES, EXECUTIVE_OFFICER_ROLES)) errors.push('lib/personas.ts EXEC_ROLES ≠ @watts/permissions/tier EXECUTIVE_OFFICER_ROLES');

// ---------------------------------------------------------------------------
// Render docs/PERMISSIONS.md
// ---------------------------------------------------------------------------

/** Representative personas for the doc's columns. `grant` resolves per row. */
const COLUMNS: { head: string; key: string | 'grant' }[] = [
	{ head: 'Anon', key: 'anon' },
	{ head: 'Signed in, no profile', key: 'nonmember' },
	{ head: 'Member', key: 'member' },
	{ head: 'Member + the capability', key: 'grant' },
	{ head: 'Committee chair', key: 'chair_is_chair' },
	{ head: 'Project lead', key: 'lead_a' },
	{ head: 'Page editor', key: 'editor_a' },
	{ head: 'Officer', key: 'officer' },
	{ head: 'Officer chairing the committee', key: 'officer_chair_a' },
	{ head: 'Exec officer', key: 'officer_exec' },
	{ head: 'Admin', key: 'admin' },
];
const capOfGate = (g: ProcEntry['gate']): Cap | null => (typeof g === 'object' ? g.cap : null);
const factsCol = (key: string, cap: Cap | null): Facts => factsFor(key === 'grant' ? (cap ? `member_${cap}` : 'member') : key);

const API_ICON: Record<ApiOutcome, string> = { allow: '✅', forbidden: '⛔', unauth: '🔒' };
const PAGE_ICON: Record<PageOutcome, string> = { render: '✅', reachable: '✅', notfound: '404', dashboard: '↩', signin: '🔒' };

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head: string[], rows: string[][]) =>
	[`| ${head.map(cell).join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

function capabilityTable() {
	return table(
		['Capability', 'What it unlocks', 'Opens /staff', 'Officers may delegate', 'Implied for officers', 'Implied for execs'],
		CAPABILITY_KEYS.map((k) => [
			`\`${k}\``,
			CAPABILITIES[k].label,
			CAPABILITIES[k].staff ? '✓' : '',
			(OFFICER_DELEGABLE_CAPABILITIES as readonly string[]).includes(k) ? '✓' : '',
			OFFICER_IMPLIED_CAPS.includes(k) ? '✓' : '',
			EXEC_IMPLIED_CAPS.includes(k) ? '✓' : '',
		]),
	);
}

function pagesTable() {
	return table(
		['Page', 'Gate', ...COLUMNS.map((c) => c.head), 'Notes'],
		PAGES.filter((p) => p.gate !== 'public').map((p) => {
			const capMatch = p.gate.match(/\+ ([a-z_]+)$/);
			// Pages without a capability of their own: show a holder of a staff grant (scan_attendance).
			const c = capMatch && (CAPS as readonly string[]).includes(capMatch[1]) ? (capMatch[1] as Cap) : 'scan_attendance';
			return [
				`\`${p.route}\``,
				p.gate,
				...COLUMNS.map((col) => PAGE_ICON[p.expect(factsCol(col.key, c))]),
				[p.decision, p.note].filter(Boolean).join(' · '),
			];
		}),
	);
}

function proceduresTable() {
	// Group procedures of one router that share gate + per-record rule + decision.
	const groups = new Map<string, { router: string; names: string[]; entry: ProcEntry }>();
	for (const [path, entry] of Object.entries(PROCEDURES)) {
		const [router, name] = path.split('.');
		const id = [router, gateLabel(entry.gate), entry.scoped ?? '', entry.decision ?? ''].join('|');
		if (!groups.has(id)) groups.set(id, { router, names: [], entry });
		groups.get(id)!.names.push(name);
	}
	return table(
		['Router', 'Procedures', 'Gate', ...COLUMNS.map((c) => c.head), 'Per-record rule'],
		[...groups.values()].map(({ router, names, entry }) => [
			router,
			names.join(', '),
			gateLabel(entry.gate),
			...COLUMNS.map((col) => API_ICON[apiOutcome(entry.gate, factsCol(col.key, capOfGate(entry.gate)))]),
			[entry.scoped, entry.decision].filter(Boolean).join(' · '),
		]),
	);
}

function routesTable() {
	const env = { resumeAudience: 'admins' };
	return table(
		['Route', 'Gate', ...COLUMNS.map((c) => c.head), 'Notes'],
		ROUTES.filter((r) => r.expect).map((r) => [
			`\`${r.method} ${r.route}\``,
			r.gate,
			...COLUMNS.map((col) => API_ICON[r.expect!(factsCol(col.key, null), env)]),
			[r.decision, r.note].filter(Boolean).join(' · '),
		]),
	);
}

function uploadsTable() {
	const env = { resumeAudience: 'admins' };
	const capOf: Record<string, Cap | null> = { resume: 'upload_resume', 'event-flyer': 'manage_events', 'project-photo': 'manage_projects', 'event-photo': 'manage_event_photos', 'site-media': 'manage_site_content' };
	return table(
		['Upload kind', ...COLUMNS.map((c) => c.head)],
		UPLOAD_KINDS.map((u) => [`\`${u.kind}\``, ...COLUMNS.map((col) => API_ICON[u.expect(factsCol(col.key, capOf[u.kind]), env)])]),
	);
}

/** Who manages which committee / project — relative to "their own" (A) vs "another" (B). */
function scopeTable() {
	const cols = [
		{ head: 'Member', key: 'member' },
		{ head: 'Committee chair (not an officer)', key: 'chair_is_chair' },
		{ head: 'Project lead', key: 'lead_a' },
		{ head: 'Page editor', key: 'editor_a' },
		{ head: 'Officer chairing nothing', key: 'officer' },
		{ head: 'Officer chairing the committee', key: 'officer_chair_a' },
		{ head: 'Exec officer', key: 'officer_exec' },
		{ head: 'Admin', key: 'admin' },
	];
	type Scope = 'committee:A' | 'committee:B' | 'project:A' | 'project:B';
	const page = (scope: Scope) => (f: Facts) => (!canEditPage(f, scope) ? '⛔' : publishesDirectly(f, scope) ? '✅ live' : '✅ review');
	const yes = (ok: boolean) => (ok ? '✅' : '⛔');
	const rows: [string, (f: Facts) => string][] = [
		['Edit **their** committee’s page', page('committee:A')],
		['Edit **another** committee’s page', page('committee:B')],
		['Manage **their** committee’s members / chairs', (f) => yes(canManageCommittee(f, 'A'))],
		['Manage **another** committee’s members / chairs', (f) => yes(canManageCommittee(f, 'B'))],
		['Edit **their** project’s page', page('project:A')],
		['Edit **another** project’s page', page('project:B')],
		['Manage **their** project’s members / lead', (f) => yes(canManageProject(f, 'A'))],
		['Manage **another** project’s members / lead', (f) => yes(canManageProject(f, 'B'))],
	];
	return table(['', ...cols.map((c) => c.head)], rows.map(([label, fn]) => [label, ...cols.map((c) => fn(factsFor(c.key)))]));
}

const scopedRules = Object.entries(PROCEDURES)
	.filter(([, e]) => e.scoped)
	.map(([path, e]) => `- \`${path}\` — ${e.scoped}`);

const doc = `<!-- GENERATED by infra/e2e/scripts/matrix.mts from infra/e2e/lib/access-matrix.ts — do not edit by hand.
     Regenerate: pnpm --filter @watts/e2e matrix:doc · CI fails when this file is stale. -->

# WATTS permissions

Who can do what on the website, the API and the Discord bot. This page is **generated from
the same matrix the end-to-end tests assert** (\`infra/e2e/lib/access-matrix.ts\`), so if it
says ✅ the test suite has proven it on every CI run.

- To find out **which real people** hold each role, run the read-only audit: \`pnpm perm:audit\` (see [Validating](#validating)).
- To **change** who can do something, see [Changing a permission](#changing-a-permission).

## How access is decided

A person's access comes from their \`members\` row plus a few relationship tables. Nothing
is read from Discord roles.

| Role | Where it's stored | What it gives |
|---|---|---|
| **Admin** | \`members.administrator\` | Everything. Admin-only: member roles, officers, committees, awards, meeting times, delegation settings. |
| **Officer** | \`members.officer_status\` (+ \`officer_role\`) | Every capability *implied for officers*, \`/staff\`, \`/admin/*\` (except admin-only pages), every **project** (page + members), and **only the committees they chair** (page + members — the chair link below is what ties an officer to a committee). |
| **Exec officer** | officer whose \`officer_role\` is ${EXEC_ROLES.join(', ')} | Everything an officer has, plus every capability *implied for execs* (\`manage_site_content\`: every committee and the site-wide CMS) and every committee's members; tier 6 on the bot. |
| **Capability grant** | \`member_permissions\` row (active, unexpired) | Exactly that capability (see table). Staff capabilities also open \`/staff\`. |
| **Committee chair** | \`committees.chair_id\` or \`committee_members.is_chair\` | Edit that committee's public page (goes live if they're an officer, otherwise to review); an officer chairing it also manages its members. |
| **Project lead** | \`project_members.is_lead\` | Edit that project's page (review), manage its members and lead, review its join requests, edit its hardware/software/skills. |
| **Page editor** | \`page_editors\` row (optional expiry) | Edit that one committee/project page (review). |
| **Linked officer profile** | \`officer_profiles.member_id\` | Edit their own officer bio/portrait (review). |

A member **has a capability** when they are an admin, or an officer and the capability is
implied for officers, or an exec and it is implied for execs, or they hold an active,
unexpired grant for it (\`hasCapability\` in \`packages/permissions/src/index.ts\`).

### Capabilities

${capabilityTable()}

## Legend

✅ allowed · ⛔ forbidden (403) · 🔒 must sign in (redirect / 401) · ↩ redirected to \`/dashboard\` · 404 not found

Columns are the test personas (\`infra/e2e/lib/personas.ts\`). **Member + the capability**
means a plain member holding the grant that row checks (for pages without one: a staff grant, \`scan_attendance\`). **Committee chair / Project lead /
Page editor** are plain members with that link to the row's committee/project.

## Pages

Public pages (home, about, committees, events, projects, sponsorships, sign-in, …) are open to everyone.

${pagesTable()}

## API (tRPC procedures)

Every procedure in \`packages/api/src/root.ts\`. The gate is checked before the input is
read; a per-record rule then narrows it further inside the procedure.

${proceduresTable()}

### Committees and projects — who manages which

"Their" committee is one they chair (officers are tied to a committee by the chair link,
not by their \`officer_role\` title); "their" project is one they lead. **live** = the edit
publishes immediately; **review** = it waits in the site-content review queue.

${scopeTable()}

### Per-record rules

These are checked inside the procedure, on top of the gate, and are covered by
\`infra/e2e/tests/perm-scoped.spec.ts\`:

${scopedRules.join('\n')}

## HTTP routes

${routesTable()}

Uploads (\`POST /api/blob/upload\`) by kind (résumé shown for the default \`RESUME_UPLOAD_AUDIENCE=admins\`):

${uploadsTable()}

## Delegation — who can grant what

- **Admins** grant or revoke any capability, admin and officer status (\`/admin/members\`), and choose which capabilities officers may delegate.
- **Officers** grant or revoke only capabilities that are officer-delegable (${OFFICER_DELEGABLE.map((c) => `\`${c}\``).join(', ')}) **and** enabled by an admin, and only for plain members — never for officers or admins.
- **Executive officers / admins** set any committee's chairs and members; an **officer chairing a committee** manages that committee's. **Any officer, or the project's lead,** manages a project's members and lead. **\`manage_site_content\` holders** assign page editors.
- An admin can't remove their own admin access.

## Discord bot

The bot uses its own ordinal ladder (\`packages/permissions/src/tier.ts\`), resolved from the
same database by Discord id. A command runs when the caller's tier is at or above the
command's level; buttons go through the same check.

${table(['Tier', 'Who'], BOT_TIERS.map(([t, w]) => [t, w]))}

${table(['Level', 'Commands'], BOT_COMMANDS.map(([l, c]) => [l, c]))}

## Open decisions

Current behaviour is locked in by the tests; when one is decided, change the matrix, the code and the test together.

${Object.entries(DECISIONS)
	.map(([k, v]) => `- **${k}.** ${v}`)
	.join('\n')}

## Validating

| What | Command | Where it runs |
|---|---|---|
| Who actually holds each role (names, effective capabilities, bot tier, anomalies) | \`pnpm perm:audit\` (\`-- --md report.md\` to save) | Locally against the prod mirror (\`pnpm prod:backup && pnpm mirror:restore && pnpm mirror:use\`). Read-only; refuses a remote DB without \`--allow-remote\`. Reports land in \`infra/seed/.audit/\` (gitignored). |
| The running app matches this matrix, persona by persona | \`pnpm e2e\` (the \`permissions\` project) | CI on every PR; locally against a migrated local Postgres |
| Bot tier ladder + command gate | \`pnpm --filter @watts/bot check:tier\` | CI smoke job (seeded DB) |
| Every procedure / page / route is classified, and this doc is current | \`pnpm --filter @watts/e2e matrix:check\` | CI verify job |

## Changing a permission

1. Change the code (the procedure builder, page guard or \`@watts/permissions\`).
2. Change \`infra/e2e/lib/access-matrix.ts\` to match — a new procedure, page or route **must** be added or CI fails.
3. Run \`pnpm --filter @watts/e2e matrix:doc\` and commit the regenerated \`docs/PERMISSIONS.md\`.
4. \`pnpm e2e\` proves the app agrees.
`;

if (mode === 'write') {
	writeFileSync(DOC, doc);
	console.log(`wrote ${relative(ROOT, DOC)}`);
} else {
	let current = '';
	try {
		current = readFileSync(DOC, 'utf8');
	} catch {
		// missing → stale
	}
	if (current.replace(/\r\n/g, '\n') !== doc) errors.push('docs/PERMISSIONS.md is stale — run `pnpm --filter @watts/e2e matrix:doc`');
}

if (errors.length) {
	console.error(`\n✗ permission matrix: ${errors.length} problem(s)\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
	process.exit(1);
}
console.log(`✓ permission matrix covers ${Object.keys(procs).length} procedures, ${pageRoutes.length} pages, ${routeRoutes.length} routes${mode === 'check' ? '; docs/PERMISSIONS.md is current' : ''}`);
