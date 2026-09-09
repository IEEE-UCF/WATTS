import { test, expect } from '@playwright/test';

// Runs only in the `authenticated` Playwright project, which exists only when
// e2e/.auth/user.json is present — captured by a REAL Discord login via
// `pnpm --filter @watts/web e2e:auth`. No fabricated sessions. CI never has the
// file, so this file is skipped there.

const routes = [
	{ path: '/dashboard', name: 'dashboard' },
	{ path: '/admin/dashboard', name: 'admin-dashboard' },
	{ path: '/admin/members', name: 'admin-members' },
	{ path: '/admin/photos', name: 'admin-photos' },
	{ path: '/admin/resumes', name: 'admin-resumes' },
	{ path: '/staff', name: 'staff' },
	{ path: '/settings', name: 'settings' },
];

test.describe('with a captured Discord session', () => {
	test('the session is actually authenticated', async ({ request }) => {
		const res = await request.get('/api/auth/session');
		expect(res.ok()).toBeTruthy();
		const session = await res.json();
		expect(
			session?.user?.id,
			'e2e/.auth/user.json has no live session — re-run `pnpm --filter @watts/web e2e:auth`',
		).toBeTruthy();
	});

	for (const { path, name } of routes) {
		test(`${path} renders (no redirect to sign-in)`, async ({ page }) => {
			const res = await page.goto(path, { waitUntil: 'networkidle' });
			expect(res!.status(), `${path} -> ${res!.status()}`).toBeLessThan(400);
			await expect(page).not.toHaveURL(/\/auth\/signin/);
			await page.screenshot({ path: `screenshots/authed-${name}.png`, fullPage: true });
		});
	}
});
