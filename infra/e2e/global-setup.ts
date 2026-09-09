import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createSyntheticSession, dbHostAllowed } from './lib/session';

// Decides what the `authenticated` Playwright project runs with:
//   - a real captured session (.auth/user.json present) -> use it as-is
//   - else, a local / CI Postgres -> mint a guarded synthetic session
//   - else -> nothing; the authenticated specs are skipped
const AUTH_FILE = join(process.cwd(), '.auth', 'user.json');
const MARKER = join(process.cwd(), '.auth', '.synthetic');

export default async function globalSetup(): Promise<void> {
	if (existsSync(AUTH_FILE) && !existsSync(MARKER)) {
		console.log('[e2e] using the captured real Discord session (.auth/user.json)');
		return;
	}
	if (!dbHostAllowed()) {
		console.log(
			'[e2e] no captured session and DATABASE_URL is not local — authenticated specs will be skipped',
		);
		return;
	}

	const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
	let session;
	try {
		session = await createSyntheticSession(baseURL);
	} catch (err) {
		throw new Error(
			`[e2e] DATABASE_URL looks local but the synthetic session could not be created — ` +
				`is Postgres up and migrated? (\`pnpm infra:up && pnpm db:migrate\`)\n${String(err)}`,
		);
	}
	mkdirSync(dirname(AUTH_FILE), { recursive: true });
	writeFileSync(AUTH_FILE, JSON.stringify(session.storageState, null, 2));
	writeFileSync(MARKER, `${session.userId}\n`);
	console.log(`[e2e] minted a synthetic session for ${baseURL} (user ${session.userId})`);
}
