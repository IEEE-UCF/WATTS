import { test, expect } from '@playwright/test';

// Every public page must render (no 5xx, no error boundary) and gets a screenshot
// saved as a CI artifact.
const publicPages = [
	{ path: '/', name: 'home' },
	{ path: '/about', name: 'about' },
	{ path: '/events', name: 'events' },
	{ path: '/projects', name: 'projects' },
	{ path: '/sponsorships', name: 'sponsorships' },
	{ path: '/connect', name: 'connect' },
	{ path: '/auth/signin', name: 'signin' },
];

for (const { path, name } of publicPages) {
	test(`public page ${path} renders`, async ({ page }) => {
		const res = await page.goto(path, { waitUntil: 'networkidle' });
		expect(res, `no response for ${path}`).not.toBeNull();
		expect(res!.status(), `${path} returned ${res!.status()}`).toBeLessThan(400);
		await expect(page.locator('body')).toBeVisible();
		// Next.js renders this text on its error overlay / error page.
		await expect(page.locator('body')).not.toContainText('Application error');
		await page.screenshot({ path: `screenshots/public-${name}.png`, fullPage: true });
	});
}
