import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { dbHostAllowed } from './lib/session';

// Default: Playwright builds and serves @watts/web on :3000 and runs the anonymous
// smoke specs. Point at a running server (your `pnpm dev`, or a deployment) with
// E2E_BASE_URL to run against that instead:
//   E2E_BASE_URL=https://localhost:3050 pnpm --filter @watts/e2e test
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const external = Boolean(process.env.E2E_BASE_URL);

// The authed / role-matrix specs run when EITHER:
//   - a REAL Discord session has been captured (`pnpm --filter @watts/e2e auth`
//     -> .auth/user.json) — the highest-fidelity local path; or
//   - DATABASE_URL points at a local / CI Postgres, in which case global-setup
//     mints a guarded synthetic session (a test fixture, deleted in teardown —
//     see lib/session.ts). This is the CI path and does NOT exercise Discord
//     OAuth; that gap is tracked in README.md.
const authFile = '.auth/user.json';
const runAuthed = existsSync(authFile) || dbHostAllowed();

export default defineConfig({
	testDir: './tests',
	globalSetup: './global-setup.ts',
	globalTeardown: './global-teardown.ts',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	// One worker whenever the authenticated run is active — CI included:
	// role-matrix.spec.ts mutates the shared member row, so nothing else may run
	// against the DB concurrently.
	workers: runAuthed ? 1 : process.env.CI ? 2 : undefined,
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
