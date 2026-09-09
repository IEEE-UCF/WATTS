import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Default: Playwright builds and serves @watts/web on :3000 and runs the anonymous
// smoke specs. Point at a running server (your `pnpm dev`, or a deployment) with
// E2E_BASE_URL to run against that instead:
//   E2E_BASE_URL=https://localhost:3050 pnpm --filter @watts/e2e test
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const external = Boolean(process.env.E2E_BASE_URL);

// authed / role-matrix specs run only when a REAL Discord session has been
// captured (`pnpm --filter @watts/e2e auth` -> .auth/user.json) AND we're pointed
// at the server it was captured against. Never in CI.
const authFile = '.auth/user.json';
const runAuthed = external && existsSync(authFile);

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	// One worker when the authenticated run is active: role-matrix.spec.ts mutates
	// the shared member row, so nothing else may run against the DB concurrently.
	workers: process.env.CI ? 2 : runAuthed ? 1 : undefined,
	// A `next dev` target (E2E_BASE_URL=https://localhost:3050) compiles routes on
	// first hit — give those a generous ceiling. A prod `next start` is far faster.
	timeout: external ? 60_000 : 30_000,
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
			testIgnore: /(authed|role-matrix)\.spec\.ts/,
		},
		...(runAuthed
			? [
					{
						name: 'authenticated',
						testMatch: /(authed|role-matrix)\.spec\.ts/,
						use: { ...devices['Desktop Chrome'], storageState: authFile },
					},
				]
			: []),
	],
	// Only manage a server for the default local run. `pnpm --filter` works from
	// this workspace dir.
	webServer: external
		? undefined
		: {
				command: process.env.CI
					? 'pnpm --filter @watts/web start'
					: 'pnpm --filter @watts/web build && pnpm --filter @watts/web start',
				url: 'http://localhost:3000',
				reuseExistingServer: !process.env.CI,
				timeout: 180_000,
				// Force plain-http NextAuth so the anon specs are deterministic; the
				// repo `./.env` may set an https URL for dev.
				env: { NEXTAUTH_URL: 'http://localhost:3000' },
			},
});
