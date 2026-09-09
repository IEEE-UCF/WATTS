import { test, expect } from '@playwright/test';

// Runs only in the `authenticated` Playwright project, which exists only when
// e2e/.auth/user.json is present — captured by a REAL Discord login via
// `pnpm --filter @watts/e2e auth`. No fabricated sessions. CI never has the
// file, so this file is skipped there.

const routes = [
	{ path: '/dashboard', name: 'dashboard' },
	{ path: '/admin/dashboard', name: 'admin-dashboard' },
	{ path: '/admin/photos', name: 'admin-photos' },
	{ path: '/admin/resumes', name: 'admin-resumes' },
	{ path: '/staff', name: 'staff' },
];

// `/settings` and `/admin/members` call useSession() and Next static-optimizes
// them (○), which 500s under `next dev`'s SSR ("useSession must be wrapped in
// <SessionProvider>"). Not reproducible against a `next start` prod build (CI and
// the default local run both use `next start`), so these run everywhere EXCEPT a
// `next dev` target (E2E_BASE_URL=https://localhost:3050). The real fix is
// `export const dynamic = 'force-dynamic'` on those pages.
const devOptimizedRoutes = [
	{ path: '/settings', name: 'settings' },
	{ path: '/admin/members', name: 'admin-members' },
];
const nextDevTarget = (process.env.E2E_BASE_URL ?? '').includes(':3050');

test.describe('with a captured Discord session', () => {
	test('the session is actually authenticated', async ({ request }) => {
		const res = await request.get('/api/auth/session');
		expect(res.ok()).toBeTruthy();
		const session = await res.json();
		expect(
			session?.user?.id,
			'e2e/.auth/user.json has no live session — re-run `pnpm --filter @watts/e2e auth`',
		).toBeTruthy();
	});

	for (const { path, name } of routes) {
		test(`${path} renders (no redirect to sign-in)`, async ({ page }) => {
			const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
			expect(res!.status(), `${path} -> ${res!.status()}`).toBeLessThan(400);
			await expect(page).not.toHaveURL(/\/auth\/signin/);
			await expect(page.locator('body')).toBeVisible();
			await page.screenshot({ path: `screenshots/authed-${name}.png`, fullPage: true, animations: 'disabled' });
		});
	}

	for (const { path, name } of devOptimizedRoutes) {
		test(`${path} renders (no redirect to sign-in)`, async ({ page }) => {
			test.fixme(nextDevTarget, 'static-optimized + useSession() 500s under `next dev`; needs `export const dynamic`');
			const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
			expect(res!.status(), `${path} -> ${res!.status()}`).toBeLessThan(400);
			await expect(page).not.toHaveURL(/\/auth\/signin/);
			await expect(page.locator('body')).toBeVisible();
			await page.screenshot({ path: `screenshots/authed-${name}.png`, fullPage: true, animations: 'disabled' });
		});
	}
});
