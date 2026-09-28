// Inventory report for a backup snapshot: which files exist, where the database
// references them, and what is missing or unreferenced. Written by the backup; can be
// re-run on any snapshot:
//
//   pnpm mirror:report                      # latest snapshot in the default backup folder
//   pnpm mirror:report -- --from=<snapshot dir>

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	args,
	copyDecode,
	copyFields,
	DEFAULT_DEST,
	fmtBytes,
	latestSnapshot,
	parsePgArray,
	readManifest,
	STRING_ARRAY_TYPES,
	STRING_TYPES,
	type FileEntry,
} from './common';

const REPO_PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'ieeeucfcom', 'public');
const KEY_PREFIXES = ['resumes', 'event-photos', 'event-flyers', 'project-photos', 'site-media'];
const URL_RE = /https?:\/\/[^\s"'<>\\)]+/g;
const PUBLIC_PATH_RE = /^\/[^\s?#]+\.(png|jpe?g|gif|webp|avif|svg|pdf|mp4|webm)$/i;
const APP_HOSTS = ['ieeeucf.com', 'www.ieeeucf.com', 'localhost'];

interface ColumnStats {
	resolved: number;
	missing: number;
	publicOk: number;
	publicMissing: number;
	appRoute: number;
	external: number;
}

export function writeReport(snapshot: string, dest?: string): string {
	const m = readManifest(snapshot);
	const files = m.files;
	const byKey = new Map<string, FileEntry[]>();
	const byUrl = new Map<string, FileEntry>();
	for (const f of files) {
		byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
		if (f.url) byUrl.set(f.url, f);
	}
	const prefixes = new Set([...KEY_PREFIXES, ...files.map((f) => f.key.split('/')[0])]);
	const referenced = new Set<FileEntry>();
	const stats = new Map<string, ColumnStats>();
	const missing: string[] = [];
	const publicMissing: string[] = [];
	const externalHosts = new Map<string, { n: number; cols: Set<string> }>();

	const resolveUrl = (u: string): FileEntry | 'missing' | 'app' | 'external' => {
		const exact = byUrl.get(u);
		if (exact) return exact;
		for (const base of m.source.publicBases) {
			if (u.startsWith(`${base}/`)) {
				const key = decodeURIComponent(u.slice(base.length + 1).split('?')[0]);
				return byKey.get(key)?.[0] ?? 'missing';
			}
		}
		let host = '';
		try {
			host = new URL(u).hostname;
		} catch {
			return 'external';
		}
		if (host.endsWith('blob.vercel-storage.com')) return 'missing';
		if (APP_HOSTS.includes(host)) return 'app';
		return 'external';
	};

	for (const t of m.tables) {
		const path = join(snapshot, 'db', `${t.name}.copy`);
		if (!existsSync(path)) continue;
		const cols = t.columns
			.map((c, i) => ({ ...c, i }))
			.filter((c) => STRING_TYPES.has(c.type) || STRING_ARRAY_TYPES.has(c.type) || c.type === 'jsonb' || c.type === 'json');
		if (!cols.length) continue;
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			if (!line) continue;
			const fields = copyFields(line);
			const rowId = copyDecode(fields[0]) ?? '?';
			for (const c of cols) {
				const raw = copyDecode(fields[c.i]);
				if (raw === null || raw === '') continue;
				const where = `${t.name}.${c.name}`;
				const s =
					stats.get(where) ?? { resolved: 0, missing: 0, publicOk: 0, publicMissing: 0, appRoute: 0, external: 0 };
				const values = STRING_ARRAY_TYPES.has(c.type) ? parsePgArray(raw) : [raw];
				for (const v of values) {
					if (!v) continue;
					const candidates = c.type.startsWith('json') ? (v.match(URL_RE) ?? []) : [v];
					for (const val of candidates) {
						if (/^https?:\/\//.test(val)) {
							for (const u of val.match(URL_RE) ?? []) {
								const r = resolveUrl(u);
								if (r === 'missing') {
									s.missing++;
									missing.push(`${where} (row ${rowId}): ${u}`);
								} else if (r === 'app') s.appRoute++;
								else if (r === 'external') {
									s.external++;
									const host = new URL(u).hostname;
									const e = externalHosts.get(host) ?? { n: 0, cols: new Set<string>() };
									e.n++;
									e.cols.add(where);
									externalHosts.set(host, e);
								} else {
									s.resolved++;
									referenced.add(r);
								}
							}
						} else if (prefixes.has(val.split('/')[0]) && val.includes('/') && !val.includes(' ')) {
							const hit = byKey.get(val);
							if (hit) {
								s.resolved++;
								hit.forEach((f) => referenced.add(f));
							} else if (files.length) {
								s.missing++;
								missing.push(`${where} (row ${rowId}): ${val}`);
							}
						} else if (PUBLIC_PATH_RE.test(val)) {
							if (existsSync(join(REPO_PUBLIC, decodeURIComponent(val)))) s.publicOk++;
							else {
								s.publicMissing++;
								publicMissing.push(`${where} (row ${rowId}): ${val}`);
							}
						}
					}
				}
				if (Object.values(s).some((n) => n > 0)) stats.set(where, s);
			}
		}
	}

	const orphans = files.filter((f) => !referenced.has(f));
	const folderOf = (f: FileEntry) => `${f.bucket}/${f.key.includes('/') ? f.key.split('/')[0] : '(root)'}`;
	const folders = new Map<string, { n: number; bytes: number; orphans: number }>();
	for (const f of files) {
		const s = folders.get(folderOf(f)) ?? { n: 0, bytes: 0, orphans: 0 };
		folders.set(folderOf(f), { n: s.n + 1, bytes: s.bytes + f.size, orphans: s.orphans + (referenced.has(f) ? 0 : 1) });
	}

	const repoPublic = new Map<string, { n: number; bytes: number }>();
	const walk = (dir: string, top: string) => {
		for (const name of existsSync(dir) ? readdirSync(dir) : []) {
			const p = join(dir, name);
			const st = statSync(p);
			if (st.isDirectory()) walk(p, top || name);
			else {
				const k = top || '(root)';
				const s = repoPublic.get(k) ?? { n: 0, bytes: 0 };
				repoPublic.set(k, { n: s.n + 1, bytes: s.bytes + st.size });
			}
		}
	};
	walk(REPO_PUBLIC, '');

	const L: string[] = [];
	const list = (items: string[], max = 60) => {
		for (const x of items.slice(0, max)) L.push(`- ${x}`);
		if (items.length > max) L.push(`- …and ${items.length - max} more`);
	};
	L.push(`# Production inventory — ${m.createdAt.slice(0, 16).replace('T', ' ')} UTC`, '');
	L.push(`Source: \`${m.source.dbHost}/${m.source.dbName}\`, storage: ${m.source.storage}. ${m.migrations.length} migrations applied.`, '');
	L.push('## Database', '', '| Table | Rows | Note |', '| --- | ---: | --- |');
	for (const t of m.tables) L.push(`| ${t.name} | ${t.rows} | ${t.note ?? ''} |`);
	L.push('', '## Files in storage', '');
	if (m.filesSkipped === '--skip-files' || (!files.length && m.filesSkipped)) L.push(`Not collected (${m.filesSkipped}).`);
	else {
		L.push(`${files.length} files, ${fmtBytes(files.reduce((t, f) => t + f.size, 0))}${m.filesSkipped ? ` (${m.filesSkipped})` : ''}.`, '');
		L.push('| Folder | Files | Size | Not referenced by the DB |', '| --- | ---: | ---: | ---: |');
		for (const [k, s] of [...folders].sort()) L.push(`| ${k} | ${s.n} | ${fmtBytes(s.bytes)} | ${s.orphans} |`);
	}
	L.push('', '## Where the database points at files', '');
	L.push('| Column | In storage | Missing | Repo public/ | public/ missing | App routes | External |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
	for (const [k, s] of [...stats].sort())
		L.push(`| ${k} | ${s.resolved} | ${s.missing} | ${s.publicOk} | ${s.publicMissing} | ${s.appRoute} | ${s.external} |`);
	L.push('', '"Repo public/" = a path like `/events/x.png` served from the website\'s `public/` folder (ships with every deploy). "App routes" = links into the site itself (e.g. `/api/files/resume/…`).', '');
	L.push('## Referenced but missing from storage', '');
	if (missing.length) list(missing);
	else L.push('None.');
	L.push('', '## Referenced `public/` paths that are not in the repo', '');
	if (publicMissing.length) list(publicMissing);
	else L.push('None.');
	L.push('', '## Files in storage that nothing references', '');
	if (orphans.length) list(orphans.map((f) => `${f.bucket}/${f.key} (${fmtBytes(f.size)}, uploaded ${f.uploadedAt.slice(0, 10)})`));
	else L.push('None.');
	L.push('', '## External links by host', '', '| Host | Values | Columns |', '| --- | ---: | --- |');
	for (const [h, e] of [...externalHosts].sort((x, y) => y[1].n - x[1].n)) L.push(`| ${h} | ${e.n} | ${[...e.cols].join(', ')} |`);
	L.push('', '## Built-in images in the repo (`apps/ieeeucfcom/public`)', '', '| Folder | Files | Size |', '| --- | ---: | ---: |');
	for (const [k, s] of [...repoPublic].sort()) L.push(`| ${k} | ${s.n} | ${fmtBytes(s.bytes)} |`);
	if (dest) L.push('', `File copies live in \`${join(dest, 'files')}\`.`);

	const out = join(snapshot, 'REPORT.md');
	writeFileSync(out, `${L.join('\n')}\n`);
	return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const a = args();
	const dest = a.str('dest', DEFAULT_DEST)!;
	const snapshot = a.str('from') ?? latestSnapshot(dest);
	console.log(`Report written: ${writeReport(snapshot, dest)}`);
}
