// Back up production to your machine: every table + every storage file, plus an
// inventory report. READ-ONLY against the source — the database work runs in a
// READ ONLY transaction and storage is only listed and downloaded.
//
//   pnpm prod:backup                                   # uses ~/.watts/production.env
//   pnpm prod:backup -- --source-env=path/to/prod.env --dest="D:/backups/watts"
//   pnpm prod:backup -- --skip-files                   # database only
//   pnpm prod:backup -- --skip-private                 # leave résumés / private photos out
//
// Not copied: `sessions` (live login tokens) and the OAuth tokens in `accounts`
// (blanked). Everything else is copied as-is, including members' personal data —
// keep the backup folder private. See README.md.

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';
import {
	args,
	DEFAULT_DEST,
	DEFAULT_SOURCE_ENV,
	fmtBytes,
	ident,
	readEnvFile,
	type ColumnInfo,
	type FileEntry,
	type Manifest,
} from './common';
import { writeReport } from './report';

const a = args();
const sourceEnvPath = a.str('source-env', DEFAULT_SOURCE_ENV)!;
const dest = a.str('dest', DEFAULT_DEST)!;
const SKIP_FILES = a.flag('skip-files');
const SKIP_PRIVATE = a.flag('skip-private');

// Tables whose data is never copied, and columns blanked on the way out.
const EXCLUDED_TABLES: Record<string, string> = { sessions: 'login sessions are not backed up' };
const REDACTED_COLUMNS: Record<string, string[]> = {
	accounts: ['access_token', 'refresh_token', 'id_token', 'session_state'],
};

const STORAGE_KEYS = [
	'STORAGE_PROVIDER',
	'BLOB_READ_WRITE_TOKEN',
	'BLOB_RW_TOKEN_PRIVATE',
	'BLOB_RW_TOKEN_PUBLIC',
	'S3_ENDPOINT',
	'S3_REGION',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY',
	'S3_BUCKET_PUBLIC',
	'S3_BUCKET_PRIVATE',
	'S3_PUBLIC_BASE_URL',
];

async function main() {
	const env = readEnvFile(sourceEnvPath);
	if (!env.DATABASE_URL) throw new Error(`DATABASE_URL missing in ${sourceEnvPath}`);
	const dbUrl = new URL(env.DATABASE_URL);
	if (dbUrl.hostname.includes('-pooler.')) {
		console.warn('! DATABASE_URL is the Neon *pooled* URL — use the unpooled one (DATABASE_URL_UNPOOLED) for a backup.');
	}
	const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
	const snapshot = join(dest, 'snapshots', stamp);
	mkdirSync(join(snapshot, 'db'), { recursive: true });
	console.log(`Backing up ${dbUrl.hostname}/${dbUrl.pathname.slice(1)} → ${snapshot}\n`);

	const manifest: Manifest = {
		version: 1,
		createdAt: new Date().toISOString(),
		source: {
			dbHost: dbUrl.hostname,
			dbName: dbUrl.pathname.slice(1),
			storage: env.STORAGE_PROVIDER === 'local' ? 'local' : 'vercel',
			publicBases: [],
		},
		migrations: [],
		tables: [],
		files: [],
	};

	// 1. database -------------------------------------------------------------
	const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
	try {
		await sql.begin('isolation level repeatable read read only', async (txn) => {
			// postgres-js types a transaction as non-callable; at runtime it is the same tagged template.
			const tx = txn as unknown as postgres.Sql;
			const [{ has }] = await tx`select to_regclass('drizzle.__drizzle_migrations') is not null as has`;
			if (has) {
				const rows = await tx`select hash, created_at from drizzle.__drizzle_migrations order by created_at`;
				manifest.migrations = rows.map((r) => ({ hash: String(r.hash), createdAt: String(r.created_at) }));
			}
			const tables = await tx`
				select table_name from information_schema.tables
				where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
			for (const { table_name: name } of tables as unknown as { table_name: string }[]) {
				const cols = (await tx`
					select column_name as name, udt_name as type from information_schema.columns
					where table_schema = 'public' and table_name = ${name} order by ordinal_position`) as unknown as ColumnInfo[];
				if (EXCLUDED_TABLES[name]) {
					manifest.tables.push({ name, columns: cols, rows: 0, note: EXCLUDED_TABLES[name] });
					console.log(`  ${name}: skipped (${EXCLUDED_TABLES[name]})`);
					continue;
				}
				const redact = new Set(REDACTED_COLUMNS[name] ?? []);
				const select = cols
					.map((c) => (redact.has(c.name) ? `NULL::${ident(c.type)} as ${ident(c.name)}` : ident(c.name)))
					.join(', ');
				const readable = await tx.unsafe(`copy (select ${select} from ${ident(name)}) to stdout`).readable();
				let rows = 0;
				readable.on('data', (chunk: Buffer) => {
					for (const b of chunk) if (b === 10) rows++;
				});
				await pipeline(readable, createWriteStream(join(snapshot, 'db', `${name}.copy`)));
				manifest.tables.push({ name, columns: cols, rows, note: redact.size ? `blanked: ${[...redact].join(', ')}` : undefined });
				console.log(`  ${name}: ${rows} rows`);
			}
		});
	} finally {
		await sql.end();
	}

	// 2. storage --------------------------------------------------------------
	if (SKIP_FILES) {
		manifest.filesSkipped = '--skip-files';
		console.log('\nFiles: skipped (--skip-files)');
	} else {
		for (const k of STORAGE_KEYS) {
			if (env[k] !== undefined) process.env[k] = env[k];
			else delete process.env[k];
		}
		if (!process.env.STORAGE_PROVIDER) process.env.STORAGE_PROVIDER = env.BLOB_READ_WRITE_TOKEN ? 'vercel' : 'local';
		const { getStorage } = await import('@watts/storage');
		const storage = await getStorage();

		const found = new Map<string, FileEntry>();
		for (const bucket of ['public', 'private'] as const) {
			let cursor: string | undefined;
			do {
				const page = await storage.list({ bucket, cursor });
				for (const o of page.objects) {
					// One Vercel store can back both buckets: the URL host says which access a blob has.
					const actual = o.url ? (new URL(o.url).hostname.includes('.public.') ? 'public' : 'private') : bucket;
					found.set(`${actual}/${o.key}`, {
						bucket: actual,
						key: o.key,
						size: o.size,
						uploadedAt: new Date(o.uploadedAt).toISOString(),
						url: o.url,
					});
				}
				cursor = page.nextCursor;
			} while (cursor);
		}
		let files = [...found.values()].sort((x, y) => (x.bucket + x.key).localeCompare(y.bucket + y.key));
		manifest.source.publicBases =
			manifest.source.storage === 'local'
				? [env.S3_PUBLIC_BASE_URL].filter((x): x is string => Boolean(x))
				: [...new Set(files.filter((f) => f.bucket === 'public' && f.url).map((f) => new URL(f.url!).origin))];

		const byFolder = new Map<string, { n: number; bytes: number }>();
		for (const f of files) {
			const folder = `${f.bucket}/${f.key.includes('/') ? f.key.split('/')[0] : '(root)'}`;
			const s = byFolder.get(folder) ?? { n: 0, bytes: 0 };
			byFolder.set(folder, { n: s.n + 1, bytes: s.bytes + f.size });
		}
		console.log(`\nFiles in storage: ${files.length} (${fmtBytes(files.reduce((t, f) => t + f.size, 0))})`);
		for (const [folder, s] of byFolder) console.log(`  ${folder}: ${s.n} (${fmtBytes(s.bytes)})`);
		if (SKIP_PRIVATE) {
			files = files.filter((f) => f.bucket === 'public');
			manifest.filesSkipped = '--skip-private';
		}

		// Only fetch what changed since the last backup.
		const filesDir = join(dest, 'files');
		const indexPath = join(filesDir, 'index.json');
		const index: Record<string, { size: number; uploadedAt: string; sha256?: string }> = existsSync(indexPath)
			? JSON.parse(readFileSync(indexPath, 'utf8'))
			: {};
		const todo = files.filter((f) => {
			const prev = index[`${f.bucket}/${f.key}`];
			const onDisk = existsSync(join(filesDir, f.bucket, f.key));
			if (prev && onDisk && prev.size === f.size && prev.uploadedAt === f.uploadedAt) {
				f.sha256 = prev.sha256;
				return false;
			}
			return true;
		});
		console.log(`\nDownloading ${todo.length} new/changed file(s) (${files.length - todo.length} already up to date)…`);
		let done = 0;
		let failed = 0;
		const queue = [...todo];
		await Promise.all(
			Array.from({ length: 6 }, async () => {
				for (let f = queue.shift(); f; f = queue.shift()) {
					const target = normalize(join(filesDir, f.bucket, f.key));
					if (!target.startsWith(normalize(join(filesDir, f.bucket)))) {
						console.warn(`  ! skipped suspicious key ${f.key}`);
						continue;
					}
					try {
						const body = await storage.getBytes({ key: f.key, bucket: f.bucket });
						mkdirSync(dirname(target), { recursive: true });
						writeFileSync(target, body);
						f.sha256 = createHash('sha256').update(body).digest('hex');
						index[`${f.bucket}/${f.key}`] = { size: f.size, uploadedAt: f.uploadedAt, sha256: f.sha256 };
					} catch (err) {
						failed++;
						console.warn(`  ! ${f.bucket}/${f.key}: ${err instanceof Error ? err.message : String(err)}`);
					}
					if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
				}
			}),
		);
		mkdirSync(filesDir, { recursive: true });
		writeFileSync(indexPath, JSON.stringify(index, null, 1));
		manifest.files = files;
		if (failed) console.warn(`  ! ${failed} file(s) failed to download — re-run to retry`);
	}

	writeFileSync(join(snapshot, 'manifest.json'), JSON.stringify(manifest, null, 1));
	const report = writeReport(snapshot, dest);
	console.log(`\n✅ Backup complete: ${snapshot}\n   Inventory: ${report}`);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
