import { test, expect, type APIRequestContext } from '@playwright/test';
import { canEditPage, factsFor, publishesDirectly } from '../lib/access-matrix';
import { personaPool } from '../lib/persona-db';
import { pageOutcomeOf, personaIds, personaRequest, personasReady, trpc } from '../lib/perm-client';
import { FIX, FIX_SLUGS, MATRIX_PERSONAS } from '../lib/personas';

// Per-record rules the gate alone doesn't capture: which committee / project / link /
// member a person may act on. Unlike the matrix specs these make REAL calls against
// the fixture rows (lib/persona-db.ts), so they run serially. The only personas they
// mutate are `grant_target` and `revoke_officer`, which the matrix specs never read.
test.skip(!personasReady(), 'needs the permission personas (local / CI Postgres)');
test.describe.configure({ mode: 'serial' });

const contexts = new Map<string, APIRequestContext>();
async function as(key: string) {
	if (!contexts.has(key)) contexts.set(key, await personaRequest(key));
	return contexts.get(key)!;
}
test.afterAll(async () => {
	for (const ctx of contexts.values()) await ctx.dispose();
});

// ---------------------------------------------------------------------------
test.describe('committee / project page editing (canEditScope)', () => {
	const scopes = [
		['committee:A', 'committee', FIX_SLUGS.committeeA],
		['committee:B', 'committee', FIX_SLUGS.committeeB],
		['project:A', 'project', FIX_SLUGS.projectA],
		['project:B', 'project', FIX_SLUGS.projectB],
	] as const;

	test('pageForEdit: allowed exactly where the matrix says, with the right publish mode', async () => {
		const problems: string[] = [];
		for (const key of MATRIX_PERSONAS.filter((k) => k !== 'anon')) {
			const f = factsFor(key);
			for (const [scope, type, slug] of scopes) {
				const r = await trpc(await as(key), 'siteContent.pageForEdit', 'query', { type, slug });
				const want = canEditPage(f, scope);
				const got = r.status === 200;
				if (got !== want) problems.push(`${key} → ${scope}: expected ${want ? 'edit' : 'FORBIDDEN'}, got ${r.status} ${r.code ?? ''}`);
				else if (got) {
					const canPublish = (r.data as { canPublish?: boolean })?.canPublish;
					if (canPublish !== publishesDirectly(f, scope)) problems.push(`${key} → ${scope}: canPublish=${canPublish}, expected ${publishesDirectly(f, scope)}`);
				}
			}
		}
		expect(problems).toEqual([]);
	});

	async function submit(key: string, committee: 'A' | 'B') {
		const ctx = await as(key);
		const page = await trpc(ctx, 'siteContent.pageForEdit', 'query', { type: 'committee', slug: FIX_SLUGS[`committee${committee}`] });
		// Use the admin's view of the page for the snapshot so a forbidden caller still sends a valid body.
		const snapshot =
			(page.data as { snapshot?: unknown })?.snapshot ??
			((await trpc(await as('admin'), 'siteContent.pageForEdit', 'query', { type: 'committee', slug: FIX_SLUGS[`committee${committee}`] })).data as { snapshot: unknown }).snapshot;
		return trpc(ctx, 'siteContent.submitCommitteePage', 'mutation', { id: FIX[`committee${committee}`], snapshot });
	}

	test('a page editor’s change goes to review, not live', async () => {
		const r = await submit('editor_a', 'A');
		expect(r.status, r.message ?? '').toBe(200);
		expect((r.data as { status: string }).status).toBe('pending');
	});
	test('a chair’s change to their own committee goes to review; another committee is FORBIDDEN', async () => {
		const own = await submit('chair_is_chair', 'A');
		expect((own.data as { status: string }).status).toBe('pending');
		const other = await submit('chair_is_chair', 'B');
		expect(other.code).toBe('FORBIDDEN');
	});
	test('a site-wide editor publishes directly', async () => {
		const r = await submit('member_manage_site_content', 'A');
		expect((r.data as { status: string }).status).toBe('published');
	});
});

// ---------------------------------------------------------------------------
test.describe('project join requests', () => {
	test('a lead cannot act on another project’s request by sending their own projectId', async () => {
		const r = await trpc(await as('lead_a'), 'project.approveRequest', 'mutation', { projectId: FIX.projectA, requestId: FIX.requestB });
		expect(r.code, 'cross-project approve must not succeed').toBe('NOT_FOUND');
		const d = await trpc(await as('lead_a'), 'project.denyRequest', 'mutation', { projectId: FIX.projectA, requestId: FIX.requestB });
		expect(d.code).toBe('NOT_FOUND');
	});
	test('a lead cannot review a project they don’t lead', async () => {
		const r = await trpc(await as('lead_a'), 'project.denyRequest', 'mutation', { projectId: FIX.projectB, requestId: FIX.requestB });
		expect(r.code).toBe('FORBIDDEN');
		const list = await trpc(await as('lead_a'), 'project.listMembershipRequests', 'query', { projectId: FIX.projectB });
		expect(list.code).toBe('FORBIDDEN');
	});
	test('a lead can list and review their own project’s requests', async () => {
		const list = await trpc(await as('lead_a'), 'project.listMembershipRequests', 'query', { projectId: FIX.projectA });
		expect(list.status).toBe(200);
		expect((list.data as { id: string }[]).map((x) => x.id)).toContain(FIX.requestA);
		const r = await trpc(await as('lead_a'), 'project.denyRequest', 'mutation', { projectId: FIX.projectA, requestId: FIX.requestA, reviewNote: 'e2e' });
		expect(r.status, r.message ?? '').toBe(200);
	});
	test('a plain member cannot review any request', async () => {
		const r = await trpc(await as('member'), 'project.approveRequest', 'mutation', { projectId: FIX.projectB, requestId: FIX.requestB });
		expect(r.code).toBe('FORBIDDEN');
	});
});

// ---------------------------------------------------------------------------
test.describe('short links', () => {
	test('a manage_links grant holder can edit only links they created', async () => {
		const own = await trpc(await as('member_manage_links'), 'shortLink.setActive', 'mutation', { id: FIX.linkOwn, active: true });
		expect(own.status, own.message ?? '').toBe(200);
		const other = await trpc(await as('member_manage_links'), 'shortLink.setActive', 'mutation', { id: FIX.linkOther, active: true });
		expect(other.code).toBe('FORBIDDEN');
	});
	test('officers and admins can edit any link', async () => {
		for (const key of ['officer_chair_a', 'admin']) {
			const r = await trpc(await as(key), 'shortLink.setActive', 'mutation', { id: FIX.linkOwn, active: true });
			expect(r.status, `${key}: ${r.message ?? ''}`).toBe(200);
		}
	});
});

// ---------------------------------------------------------------------------
test.describe('granting capabilities (member.setPermission)', () => {
	let originalDelegable: string[] = [];
	const target = () => personaIds().memberIds.grant_target;
	const grant = async (as_: string, memberId: string, permission: string, granted = true) =>
		trpc(await as(as_), 'member.setPermission', 'mutation', { memberId, permission, granted });

	test.beforeAll(async () => {
		const r = await trpc(await as('admin'), 'settings.officerGrantableCapabilities', 'query');
		originalDelegable = (r.data as { enabled: string[] }).enabled;
	});
	test.afterAll(async () => {
		await trpc(await as('admin'), 'settings.setOfficerGrantableCapabilities', 'mutation', { capabilities: originalDelegable });
	});

	test('officers can grant nothing until an admin enables it', async () => {
		await trpc(await as('admin'), 'settings.setOfficerGrantableCapabilities', 'mutation', { capabilities: [] });
		expect((await grant('officer', target(), 'scan_attendance')).code).toBe('FORBIDDEN');
	});
	test('officers can grant an enabled delegable capability to a plain member, and revoke it', async () => {
		const set = await trpc(await as('admin'), 'settings.setOfficerGrantableCapabilities', 'mutation', { capabilities: ['scan_attendance'] });
		expect(set.status, set.message ?? '').toBe(200);
		const g = await grant('officer', target(), 'scan_attendance');
		expect(g.status, g.message ?? '').toBe(200);
		const staff = await (await as('grant_target')).get('/staff', { maxRedirects: 0 });
		expect((await pageOutcomeOf(staff)).outcome, 'the grant opens /staff on the next request').toBe('render');
		expect((await grant('officer', target(), 'scan_attendance', false)).status).toBe(200);
	});
	test('officers cannot grant a non-delegable capability, or grant to another officer', async () => {
		expect((await grant('officer', target(), 'manage_events')).code).toBe('FORBIDDEN');
		expect((await grant('officer', personaIds().memberIds.officer_chair_a, 'scan_attendance')).code).toBe('FORBIDDEN');
	});
	test('admins can grant any capability', async () => {
		expect((await grant('admin', target(), 'review_resumes')).status).toBe(200);
		const r = await (await as('grant_target')).get('/api/files/resume/export?gy=1900', { maxRedirects: 0 });
		expect(r.status(), 'review_resumes now lets them export').toBe(404);
		expect((await grant('admin', target(), 'review_resumes', false)).status).toBe(200);
		const after = await (await as('grant_target')).get('/api/files/resume/export?gy=1900', { maxRedirects: 0 });
		expect(after.status(), 'revoked on the very next request').toBe(403);
	});
	test('an admin cannot remove their own admin', async () => {
		const r = await trpc(await as('admin'), 'member.setAdmin', 'mutation', { id: personaIds().memberIds.admin, value: false });
		expect(r.code).toBe('BAD_REQUEST');
	});
});

// ---------------------------------------------------------------------------
test.describe('revocation', () => {
	test('removing officer status takes effect on the next request', async () => {
		const ctx = await as('revoke_officer');
		expect((await pageOutcomeOf(await ctx.get('/staff', { maxRedirects: 0 }))).outcome).toBe('render');
		expect((await trpc(ctx, 'committee.getAll', 'query')).status).toBe(200);

		const pool = personaPool();
		try {
			await pool.query('update members set officer_status = false, officer_role = null where id = $1', [personaIds().memberIds.revoke_officer]);
		} finally {
			await pool.end();
		}

		expect((await pageOutcomeOf(await ctx.get('/staff', { maxRedirects: 0 }))).outcome).toBe('dashboard');
		expect((await trpc(ctx, 'committee.getAll', 'query')).code).toBe('FORBIDDEN');
	});
});
