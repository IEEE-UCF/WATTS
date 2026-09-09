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
	'/staff',
];

for (const path of gatedRoutes) {
	test(`anonymous ${path} redirects to sign-in`, async ({ page }) => {
		await page.goto(path);
		await expect(page).toHaveURL(/\/auth\/signin/);
	});
}
