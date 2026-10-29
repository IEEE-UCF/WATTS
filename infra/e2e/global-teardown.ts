import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deletePersonas } from './lib/persona-db';
import { dbHostAllowed, deleteSyntheticSession } from './lib/session';

// Only cleans up what global-setup created. A real captured session (no .synthetic
// marker) is left untouched.
const AUTH_DIR = join(process.cwd(), '.auth');
const AUTH_FILE = join(AUTH_DIR, 'user.json');
const MARKER = join(AUTH_DIR, '.synthetic');

export default async function globalTeardown(): Promise<void> {
	if (dbHostAllowed()) {
		await deletePersonas();
		if (existsSync(AUTH_DIR)) {
			for (const f of readdirSync(AUTH_DIR).filter((name) => name.startsWith('perm-'))) rmSync(join(AUTH_DIR, f), { force: true });
		}
		console.log('[e2e] removed the permission personas');
	}
	if (!existsSync(MARKER)) return;
	await deleteSyntheticSession();
	rmSync(MARKER, { force: true });
	rmSync(AUTH_FILE, { force: true });
	console.log('[e2e] removed the synthetic session');
}
