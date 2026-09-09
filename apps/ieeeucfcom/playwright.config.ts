import { defineConfig, devices } from '@playwright/test';

// Point at a running deployment with E2E_BASE_URL to smoke-test it directly:
//   E2E_BASE_URL=https://<deploy>.vercel.app pnpm --filter @watts/web e2e
// Otherwise Playwright builds and serves the app locally on :3000.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const external = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
	outputDir: 'test-results',
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// Only manage a server for the local run; against E2E_BASE_URL we hit what's there.
	webServer: external
		? undefined
		: {
				command: process.env.CI ? 'pnpm start' : 'pnpm build && pnpm start',
				url: 'http://localhost:3000',
				reuseExistingServer: !process.env.CI,
				timeout: 180_000,
				// Force the plain-http NextAuth URL so the session cookie is
				// `next-auth.session-token` (a repo `./.env` may set an https URL for
				// dev, which switches NextAuth to `__Secure-` cookies). dotenv won't
				// override a value already in the environment.
				env: { NEXTAUTH_URL: 'http://localhost:3000' },
			},
});
