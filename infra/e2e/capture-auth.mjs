// Capture a REAL Discord login into infra/e2e/.auth/user.json so the `authenticated`
// Playwright project can reuse it. No fabricated sessions.
//
//   pnpm dev                                 # dev server on https://localhost:3050
//   pnpm --filter @watts/e2e auth        # opens a window; finish the Discord login
//   E2E_BASE_URL=https://localhost:3050 pnpm --filter @watts/e2e test
//
// Re-run this when the session expires (~10 days) or after `pnpm db:reset`.

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'https://localhost:3050';
const outPath = fileURLToPath(new URL('./.auth/user.json', import.meta.url));

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

console.log(`\nOpening ${BASE}/auth/signin — complete the Discord login in the window.\n`);
await page.goto(`${BASE}/auth/signin`).catch(() => {
	console.error(`✗ Could not reach ${BASE}. Is \`pnpm dev\` running?\n`);
	process.exit(1);
});

// Poll NextAuth's session endpoint until the OAuth callback has issued a session.
const deadline = Date.now() + 5 * 60_000;
let userId = null;
while (Date.now() < deadline) {
	try {
		const res = await page.request.get(`${BASE}/api/auth/session`);
		const body = await res.json();
		if (body?.user?.id) {
			userId = body.user.id;
			break;
		}
	} catch {
		/* dev server mid-navigation — retry */
	}
	await page.waitForTimeout(2000);
}

if (!userId) {
	console.error('\n✗ Timed out with no authenticated session. Nothing saved.\n');
	await browser.close();
	process.exit(1);
}

await mkdir(dirname(outPath), { recursive: true });
await context.storageState({ path: outPath });
await browser.close();

console.log(`\n✓ Saved a real session for user ${userId}`);
console.log('  infra/e2e/.auth/user.json  (gitignored)');
console.log(`\n  Run the authenticated suite:\n    E2E_BASE_URL=${BASE} pnpm --filter @watts/e2e test\n`);
