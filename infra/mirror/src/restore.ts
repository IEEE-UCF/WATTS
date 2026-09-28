// Build (or rebuild) a local mirror of production from a backup snapshot.
// LOCAL ONLY: the target is your local Postgres + MinIO from ./.env; it refuses anything else.
//
//   pnpm mirror:restore                         # latest snapshot → database "watts_mirror"
//   pnpm mirror:restore -- --from=<snapshot dir> --db=watts_mirror_old
//   pnpm mirror:restore -- --scrub              # anonymise personal data, leave résumés out
//   pnpm mirror:restore -- --skip-files         # database only
//
// Then switch the app to it with `pnpm mirror:use` (and back with `pnpm mirror:use dev`).
//
// How: drop + recreate the mirror database, apply THIS branch's migrations, load the
// snapshot's rows (columns the branch doesn't have are dropped, new ones get defaults),
// copy files into local MinIO, and rewrite production Blob URLs to local ones.

import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {
	args,
	DEFAULT_DEST,
	fmtBytes,
	ident,
	isLocalUrl,
	latestSnapshot,
	readEnvFile,
	readManifest,
	STRING_ARRAY_TYPES,
	STRING_TYPES,
	withDatabase,
} from './common';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const a = args();
const dest = a.str('dest', DEFAULT_DEST)!;
const snapshot = a.str('from') ?? latestSnapshot(dest);
const dbName = a.str('db', 'watts_mirror')!;
const SCRUB = a.flag('scrub');
const SKIP_FILES = a.flag('skip-files');

async function main() {
	// The local dev settings come from ./.env only (not .env.local, which `mirror:use` edits).
	const local = readEnvFile(join(ROOT, '.env'));
	if (!local.DATABASE_URL || !isLocalUrl(local.DATABASE_URL)) {
		throw new Error('Refusing: DATABASE_URL in ./.env is not a local database.');
	}
	const devDb = new URL(local.DATABASE_URL).pathname.slice(1);
	if (dbName === devDb && !a.flag('replace-dev')) {
		throw new Error(`--db=${dbName} is your dev database. Pick another name, or pass --replace-dev to overwrite it.`);
	}
	if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('--db must be lowercase letters, digits and _');
	const targetUrl = withDatabase(local.DATABASE_URL, dbName);
	const m = readManifest(snapshot);
	console.log(`Restoring ${snapshot}\n  from ${m.source.dbHost} (${m.createdAt.slice(0, 16)} UTC) → local database "${dbName}"${SCRUB ? ' [scrubbed]' : ''}\n`);

	// 1. fresh database + this branch's schema ---------------------------------------
	const admin = postgres(local.DATABASE_URL, { max: 1, onnotice: () => {} });
	await admin.unsafe(`drop database if exists ${ident(dbName)} with (force)`);
	await admin.unsafe(`create database ${ident(dbName)}`);
	await admin.end();

	const sql = postgres(targetUrl, { max: 1, onnotice: () => {} });
	try {
		const migrationsFolder = join(ROOT, 'packages', 'db', 'drizzle');
		await migrate(drizzle(sql), { migrationsFolder });
		const local_ = (await sql`select hash from drizzle.__drizzle_migrations`).map((r) => String(r.hash));
		const prodOnly = m.migrations.filter((x) => !local_.includes(x.hash)).length;
		const branchOnly = local_.filter((h) => !m.migrations.some((x) => x.hash === h)).length;
		console.log(`• schema: ${local_.length} migrations from this branch`);
		if (branchOnly) console.log(`  this branch adds ${branchOnly} migration(s) production doesn't have yet (normal on a feature branch)`);
		if (prodOnly) console.log(`  ! production has ${prodOnly} migration(s) this branch doesn't — switch to an up-to-date branch for a faithful mirror`);

		// 2. rows ------------------------------------------------------------------------
		console.log('\n• data');
		await sql`set session_replication_role = replica`; // skip FK checks + triggers while loading
		const targetTables = (await sql`
			select table_name from information_schema.tables
			where table_schema = 'public' and table_type = 'BASE TABLE'`).map((r) => String(r.table_name));
		if (targetTables.length) await sql.unsafe(`truncate ${targetTables.map(ident).join(', ')} restart identity cascade`);
		const failedTables: string[] = [];

		for (const t of m.tables) {
			const file = join(snapshot, 'db', `${t.name}.copy`);
			if (!existsSync(file) || t.rows === 0) continue;
			if (!targetTables.includes(t.name)) {
				console.log(`  ! ${t.name}: not in this branch's schema — skipped`);
				continue;
			}
			// Target column types (e.g. "uuid[]", "event_status_enum", "timestamp with time zone").
			const targetTypes = new Map(
				(
					await sql`
						select a.attname as name, format_type(a.atttypid, a.atttypmod) as type
						from pg_attribute a
						where a.attrelid = ${`public.${ident(t.name)}`}::regclass and a.attnum > 0 and not a.attisdropped`
				).map((r) => [String(r.name), String(r.type)]),
			);
			const keep = t.columns.filter((c) => targetTypes.has(c.name));
			const dropped = t.columns.filter((c) => !targetTypes.has(c.name)).map((c) => c.name);

			// COPY straight into the real table would hang on any constraint error (postgres-js
			// doesn't surface COPY errors on a writable). Stage into an all-text temp table — which
			// can't fail — then INSERT … SELECT with casts, where errors are reported normally.
			await sql.unsafe(`drop table if exists _mirror_stage`);
			await sql.unsafe(`create temp table _mirror_stage (${t.columns.map((c) => `${ident(c.name)} text`).join(', ')})`);
			await pipeline(createReadStream(file), await sql.unsafe(`copy _mirror_stage from stdin`).writable());
			try {
				await sql.unsafe(
					`insert into ${ident(t.name)} (${keep.map((c) => ident(c.name)).join(', ')})
					 select ${keep.map((c) => `${ident(c.name)}::${targetTypes.get(c.name)}`).join(', ')} from _mirror_stage`,
				);
				console.log(`  ${t.name}: ${t.rows} rows${dropped.length ? ` (dropped columns not on this branch: ${dropped.join(', ')})` : ''}`);
			} catch (err) {
				failedTables.push(t.name);
				console.log(`  ! ${t.name}: not loaded — ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		// serial / identity sequences follow the loaded rows
		const seqs = await sql`
			select table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) as seq
			from information_schema.columns
			where table_schema = 'public' and (column_default like 'nextval%' or is_identity = 'YES')`;
		for (const s of seqs) {
			if (!s.seq) continue;
			await sql.unsafe(
				`select setval('${String(s.seq)}', coalesce((select max(${ident(String(s.column_name))}) from ${ident(String(s.table_name))}), 0) + 1, false)`,
			);
		}
		await sql`set session_replication_role = origin`;
		if (failedTables.length) {
			console.log(`  ! ${failedTables.length} table(s) didn't load (${failedTables.join(', ')}). Usually the branch's schema is older or stricter than production's — restore from an up-to-date branch.`);
		}

		// 3. scrub ---------------------------------------------------------------------------
		if (SCRUB) {
			console.log('\n• scrubbing personal data');
			await sql`update users set email = 'user-' || id::text || '@mirror.test'`;
			await sql`
				update members set
					personal_email = 'member-' || id::text || '@mirror.test',
					ucf_email = 'member-' || id::text || '@ucf.mirror.test',
					date_of_birth = '2000-01-01', phone_number = null, ieee_membership_number = null,
					resume_url = null, resume_key = null, resume_file_name = null,
					resume_uploaded_at = null, resume_onedrive_path = null`;
			console.log('  emails, birthdays, phone numbers, IEEE numbers and résumés removed (names kept)');
		}

		// 4. files → local MinIO ---------------------------------------------------------------
		for (const k of Object.keys(local)) if (k.startsWith('S3_')) process.env[k] = local[k];
		process.env.STORAGE_PROVIDER = 'local';
		const localBase = local.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
		if (SKIP_FILES || !m.files.length) {
			console.log(`\n• files: ${SKIP_FILES ? 'skipped (--skip-files)' : 'none in this snapshot'}`);
		} else {
			const { getStorage } = await import('@watts/storage');
			const storage = await getStorage();
			const files = m.files.filter((f) => !(SCRUB && f.key.startsWith('resumes/')));
			let copied = 0;
			let present = 0;
			let absent = 0;
			let bytes = 0;
			for (const f of files) {
				const path = join(dest, 'files', f.bucket, f.key);
				if (!existsSync(path)) {
					absent++;
					continue;
				}
				const head = await storage.head({ key: f.key, bucket: f.bucket });
				if (head && head.size === f.size) {
					present++;
					continue;
				}
				const body = readFileSync(path);
				// Local MinIO only (STORAGE_PROVIDER forced to local above): upload through a presigned PUT.
				const contentType = contentTypeOf(f.key);
				const put = await storage.presignPut({ key: f.key, bucket: f.bucket, contentType, maxBytes: body.length, contentLength: body.length });
				const res = await fetch(put, { method: 'PUT', body, headers: { 'content-type': contentType } });
				if (!res.ok) throw new Error(`upload ${f.bucket}/${f.key} failed: ${res.status}`);
				copied++;
				bytes += body.length;
			}
			console.log(`\n• files → local MinIO: ${copied} copied (${fmtBytes(bytes)}), ${present} already there${absent ? `, ! ${absent} not in the backup folder` : ''}`);
		}

		// 5. production URLs → local URLs ------------------------------------------------------
		if (localBase && m.source.publicBases.length) {
			const cols = await sql`
				select table_name, column_name, udt_name from information_schema.columns
				where table_schema = 'public'`;
			let changed = 0;
			for (const base of m.source.publicBases) {
				for (const c of cols) {
					const t = ident(String(c.table_name));
					const col = ident(String(c.column_name));
					const type = String(c.udt_name);
					let res: { count: number } | null = null;
					if (STRING_TYPES.has(type)) {
						res = await sql.unsafe(`update ${t} set ${col} = replace(${col}, $1, $2) where ${col} like '%' || $1 || '%'`, [base, localBase]);
					} else if (STRING_ARRAY_TYPES.has(type)) {
						res = await sql.unsafe(
							`update ${t} set ${col} = array(select replace(x, $1, $2) from unnest(${col}) with ordinality as u(x, o) order by o)
							 where array_to_string(${col}, ' ') like '%' || $1 || '%'`,
							[base, localBase],
						);
					} else if (type === 'jsonb') {
						res = await sql.unsafe(`update ${t} set ${col} = replace(${col}::text, $1, $2)::jsonb where ${col}::text like '%' || $1 || '%'`, [
							base,
							localBase,
						]);
					}
					changed += res?.count ?? 0;
				}
			}
			console.log(`\n• rewrote ${changed} production file URL(s) to ${localBase}`);
		}
	} finally {
		await sql.end();
	}

	console.log(`\n✅ Mirror ready: database "${dbName}".\n   Switch the app to it:  pnpm mirror:use${dbName === 'watts_mirror' ? '' : ` -- --db=${dbName}`}\n   Back to your dev data: pnpm mirror:use -- --dev\n   Then restart the dev server. Sign in with Discord (sessions aren't copied).`);
}

function contentTypeOf(key: string): string {
	const ext = key.split('.').pop()?.toLowerCase();
	return (
		{ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', pdf: 'application/pdf' }[
			ext ?? ''
		] ?? 'application/octet-stream'
	);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
