// Shared helpers for the production backup / local mirror scripts.
// Layout of a backup folder (default: ~/Desktop/WATTS production backup):
//
//   files/<public|private>/<key>     current copy of every storage object (only changed files re-download)
//   files/index.json                 what's in files/ (size + uploadedAt per object)
//   snapshots/<timestamp>/
//     manifest.json                  source host, migrations, tables, columns, row counts, file list
//     db/<table>.copy                table data in Postgres COPY text format
//     REPORT.md                      inventory: files by folder, where each is referenced, missing + orphaned files

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

export const DEFAULT_SOURCE_ENV = join(homedir(), '.watts', 'production.env');
export const DEFAULT_DEST = join(homedir(), 'Desktop', 'WATTS production backup');

/** `--name=value` / `--flag` arguments. */
export function args() {
	const out = new Map<string, string | true>();
	for (const a of process.argv.slice(2)) {
		if (!a.startsWith('--')) continue;
		const [k, ...v] = a.slice(2).split('=');
		out.set(k, v.length ? v.join('=') : true);
	}
	return {
		str: (k: string, fallback?: string) => {
			const v = out.get(k);
			return typeof v === 'string' ? v : fallback;
		},
		flag: (k: string) => out.has(k),
	};
}

/** Read an env file WITHOUT touching process.env or the repo's .env files. */
export function readEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) {
		throw new Error(
			`Env file not found: ${path}\nCreate it with the production values (see infra/mirror/README.md).`,
		);
	}
	return parseDotenv(readFileSync(path, 'utf8'));
}

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres']);

export function isLocalUrl(url: string): boolean {
	return LOCAL_HOSTS.has(new URL(url).hostname);
}

export function withDatabase(url: string, db: string): string {
	const u = new URL(url);
	u.pathname = `/${db}`;
	return u.toString();
}

export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function latestSnapshot(dest: string): string {
	const dir = join(dest, 'snapshots');
	const all = existsSync(dir) ? readdirSync(dir).sort() : [];
	if (!all.length) throw new Error(`No snapshots in ${dir} — run the backup first.`);
	return join(dir, all[all.length - 1]);
}

export const fmtBytes = (n: number) =>
	n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface ColumnInfo {
	name: string;
	/** information_schema udt_name, e.g. text, varchar, _text, jsonb, uuid */
	type: string;
}

export interface FileEntry {
	bucket: 'public' | 'private';
	key: string;
	size: number;
	uploadedAt: string;
	url?: string;
	sha256?: string;
}

export interface Manifest {
	version: 1;
	createdAt: string;
	source: { dbHost: string; dbName: string; storage: 'vercel' | 'local'; publicBases: string[] };
	migrations: { hash: string; createdAt: string }[];
	tables: { name: string; columns: ColumnInfo[]; rows: number; note?: string }[];
	files: FileEntry[];
	filesSkipped?: string;
}

export function readManifest(snapshot: string): Manifest {
	return JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8')) as Manifest;
}

// ---------------------------------------------------------------------------
// COPY text format (https://www.postgresql.org/docs/current/sql-copy.html#id-1.9.3.55.9.2)
// One row per line, fields separated by TAB, NULL = \N, backslash escapes inside values.
// Tabs/newlines inside values are always escaped, so splitting on them is safe.
// ---------------------------------------------------------------------------

export function copyFields(line: string): string[] {
	return line.split('\t');
}

export function copyDecode(field: string): string | null {
	if (field === '\\N') return null;
	return field.replace(/\\(.)/g, (_, c: string) =>
		c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === 'b' ? '\b' : c === 'f' ? '\f' : c === 'v' ? '\v' : c,
	);
}

/** Parse a Postgres array literal like {a,"b c",NULL} into strings (one level). */
export function parsePgArray(literal: string): (string | null)[] {
	if (!literal.startsWith('{') || !literal.endsWith('}')) return [literal];
	const body = literal.slice(1, -1);
	const out: (string | null)[] = [];
	let i = 0;
	while (i < body.length) {
		if (body[i] === '"') {
			let v = '';
			i++;
			while (i < body.length && body[i] !== '"') {
				if (body[i] === '\\') i++;
				v += body[i++];
			}
			out.push(v);
			i += 2; // closing quote + comma
		} else {
			const end = body.indexOf(',', i);
			const raw = body.slice(i, end === -1 ? body.length : end);
			out.push(raw === 'NULL' ? null : raw);
			i = end === -1 ? body.length : end + 1;
		}
	}
	return out;
}

export const STRING_TYPES = new Set(['text', 'varchar', 'bpchar', 'citext']);
export const STRING_ARRAY_TYPES = new Set(['_text', '_varchar']);
