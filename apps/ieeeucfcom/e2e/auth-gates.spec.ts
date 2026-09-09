import { test, expect } from '@playwright/test';

const gatedRoutes = [
	'/dashboard',
	'/settings',
	'/admin/dashboard',
	'/admin/members',
	'/admin/photos',
	'/admin/resumes',
	'/staff',
];

test.describe('unauthenticated', () => {
	for (const path of gatedRoutes) {
		test(`${path} redirects to sign-in`, async ({ page }) => {
			await page.goto(path);
			await expect(page).toHaveURL(/\/auth\/signin/);
		});
	}
});

// The local seed (`pnpm db:seed`) inserts a long-lived session `dev-admin-session`
// for the Dev Admin (administrator + officer). A real deployment has no such row,
// so these only run against the local server.
test.describe('as the seeded dev admin', () => {
	test.skip(Boolean(process.env.E2E_BASE_URL), 'needs the local seeded session');

	test.use({
		storageState: {
			cookies: [
				{
					name: 'next-auth.session-token',
					value: 'dev-admin-session',
					domain: 'localhost',
					path: '/',
					httpOnly: true,
					secure: false,
					sameSite: 'Lax',
					expires: -1,
				},
			],
			origins: [],
		},
	});

	for (const path of ['/dashboard', '/admin/dashboard', '/admin/members', '/staff']) {
		test(`${path} renders for an admin`, async ({ page }) => {
			const res = await page.goto(path, { waitUntil: 'networkidle' });
			expect(res!.status()).toBeLessThan(400);
			await expect(page).not.toHaveURL(/\/auth\/signin/);
			await page.screenshot({
				path: `screenshots/admin-${path.replace(/\//g, '_').replace(/^_/, '')}.png`,
				fullPage: true,
			});
		});
	}
});
