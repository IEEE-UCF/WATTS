// Remove a leftover synthetic session/user if a run was killed before
// global-teardown. Standalone (plain JS + pg) so `node` needs no TS loader.
//
//   pnpm --filter @watts/e2e session-clean

import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';

loadRootEnv();

const dir = dirname(fileURLToPath(import.meta.url));
const marker = join(dir, '.auth', '.synthetic');
const authFile = join(dir, '.auth', 'user.json');
const wasSynthetic = existsSync(marker);

const SAFE = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const url = process.env.DATABASE_URL;
if (!url || !SAFE.has(new URL(url).hostname)) {
	console.log('DATABASE_URL is not a local database — nothing to do.');
	process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
try {
	const { rows } = await pool.query("select id from users where email = 'e2e-synthetic@watts.local'");
	if (rows[0]) {
		const id = rows[0].id;
		const member = await pool.query('select id from members where user_id = $1', [id]);
		for (const m of member.rows) {
			await pool.query('delete from member_permissions where member_id = $1', [m.id]);
		}
		await pool.query('delete from sessions where user_id = $1', [id]);
		await pool.query('delete from members where user_id = $1', [id]);
		await pool.query('delete from accounts where user_id = $1', [id]);
		await pool.query('delete from users where id = $1', [id]);
		console.log(`removed synthetic user ${id}`);
	} else {
		console.log('no synthetic user in the database');
	}
} finally {
	await pool.end();
}

if (wasSynthetic) {
	rmSync(marker, { force: true });
	rmSync(authFile, { force: true });
	console.log('removed .auth/.synthetic + .auth/user.json');
}
