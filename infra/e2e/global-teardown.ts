import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deleteSyntheticSession } from './lib/session';

// Only cleans up what global-setup created. A real captured session (no .synthetic
// marker) is left untouched.
const AUTH_FILE = join(process.cwd(), '.auth', 'user.json');
const MARKER = join(process.cwd(), '.auth', '.synthetic');

export default async function globalTeardown(): Promise<void> {
	if (!existsSync(MARKER)) return;
	await deleteSyntheticSession();
	rmSync(MARKER, { force: true });
	rmSync(AUTH_FILE, { force: true });
	console.log('[e2e] removed the synthetic session');
}
