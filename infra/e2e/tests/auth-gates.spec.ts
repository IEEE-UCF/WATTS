import { test, expect } from '@playwright/test';

// Anonymous access to every gated route must bounce to the sign-in page.
// The authenticated side lives in authed.spec.ts (needs a real captured session).
const gatedRoutes = [
	'/dashboard',
	'/settings',
	'/admin/dashboard',
	'/admin/members',
	'/admin/photos',
	'/admin/resumes',
	'/admin/site-content',
	'/pages/committee/software/edit',
	'/staff',
];

for (const path of gatedRoutes) {
	test(`anonymous ${path} redirects to sign-in`, async ({ page }) => {
		await page.goto(path);
		await expect(page).toHaveURL(/\/auth\/signin/);
	});
}

// Committee/project pages only exist once published — an unknown slug is a 404, not a 5xx.
test('unpublished / unknown committee page is a 404', async ({ page }) => {
	const res = await page.goto('/committees/does-not-exist');
	expect(res?.status()).toBe(404);
});

// API routes answer 401 rather than redirecting.
test('anonymous GET /api/files/resume/export is 401', async ({ request }) => {
	const res = await request.get('/api/files/resume/export');
	expect(res.status()).toBe(401);
});
