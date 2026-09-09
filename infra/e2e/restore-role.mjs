// Recover the captured user's member row from infra/e2e/.auth/role-backup.json, which
// role-matrix.spec.ts writes at the start of every run. Use this if a run was
// killed before its afterAll could restore you.
//
//   pnpm --filter @watts/e2e role-restore
//
// Standalone (plain JS + pg) so `node` can run it with no TS loader.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';

loadRootEnv();

const backupFile = join(dirname(fileURLToPath(import.meta.url)), '.auth', 'role-backup.json');
if (!existsSync(backupFile)) {
	console.log('No infra/e2e/.auth/role-backup.json — nothing to restore.');
	process.exit(0);
}
if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const snap = JSON.parse(readFileSync(backupFile, 'utf8'));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
	await pool.query(
		'update members set administrator = $1, officer_status = $2, officer_role = $3 where id = $4',
		[snap.administrator, snap.officerStatus, snap.officerRole, snap.memberId],
	);
	await pool.query('delete from member_permissions where member_id = $1', [snap.memberId]);
	for (const p of snap.permissions ?? []) {
		await pool.query(
			'insert into member_permissions (member_id, permission, active, context_type, context_id, expires_at) values ($1, $2, $3, $4, $5, $6)',
			[snap.memberId, p.permission, p.active, p.contextType, p.contextId, p.expiresAt],
		);
	}
	rmSync(backupFile);
	console.log(
		`Restored member ${snap.memberId}: administrator=${snap.administrator} officer_status=${snap.officerStatus} officer_role=${snap.officerRole ?? 'null'} (${(snap.permissions ?? []).length} permission rows).`,
	);
} finally {
	await pool.end();
}
