import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Default: Playwright builds and serves the app on :3000 and runs the anonymous
// smoke specs. Point at a running server (your `pnpm dev`, or a deployment) with
// E2E_BASE_URL to run against that instead:
//   E2E_BASE_URL=https://localhost:3050 pnpm --filter @watts/web e2e
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const external = Boolean(process.env.E2E_BASE_URL);

// authed.spec.ts runs only when a REAL Discord session has been captured
// (`pnpm --filter @watts/web e2e:auth` -> e2e/.auth/user.json) AND we're pointed
// at the server it was captured against. Never in CI.
const authFile = 'e2e/.auth/user.json';
const runAuthed = external && existsSync(authFile);

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
		ignoreHTTPSErrors: true, // local dev serves a self-signed cert on :3050
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: /authed\.spec\.ts/,
		},
		...(runAuthed
			? [
					{
						name: 'authenticated',
						testMatch: /authed\.spec\.ts/,
						use: { ...devices['Desktop Chrome'], storageState: authFile },
					},
				]
			: []),
	],
	// Only manage a server for the default local run.
	webServer: external
		? undefined
		: {
				command: process.env.CI ? 'pnpm start' : 'pnpm build && pnpm start',
				url: 'http://localhost:3000',
				reuseExistingServer: !process.env.CI,
				timeout: 180_000,
				// Force plain-http NextAuth so the anon specs are deterministic; the
				// repo `./.env` may set an https URL for dev.
				env: { NEXTAUTH_URL: 'http://localhost:3000' },
			},
});
