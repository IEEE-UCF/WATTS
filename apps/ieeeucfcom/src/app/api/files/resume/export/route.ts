// Bulk résumé export — every uploaded résumé in one download.
//   /api/files/resume/export                → .zip, foldered  {gradYear}/{major}/…
//   /api/files/resume/export?format=pdf     → one merged PDF with a table of contents
//   /api/files/resume/export?format=count   → { count, totalBytes, byYear } preview (JSON)
//
// Filter params (see @/lib/resume-export/filters — add new dimensions there):
//   gy=2025,2026   graduation years        dues=1      dues-paid members only
//   officers=1     force-add all officers  ids=uuid,…  force-add specific members
//
// PII — same gate as the single-file download (`review_resumes`), never cached,
// never indexed. Capabilities resolve from the DB so a revoked grant blocks the
// next request.

import { Readable } from 'node:stream';
import archiver from 'archiver';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { db } from '@/lib/database/client';
import { getStorage } from '@watts/storage';
import { slugify } from '@watts/storage/keys';
import { listResumesForExport } from '@watts/core/members';
import { requireCapability } from '@/lib/auth-guards';
import {
	type ResumeExportFilter,
	type SelectionReason,
	applyResumeSelection,
	describeResumeFilter,
	parseResumeFilter,
	selectionReason,
} from '@/lib/resume-export/filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel cap; raise if the plan allows

interface SelectedResume {
	memberId: string;
	firstName: string;
	lastName: string;
	major: string;
	graduationYear: number | null;
	duesPaid: boolean;
	officerStatus: boolean;
	resumeUploadedAt: Date | null;
	resumeKey: string;
	reason: SelectionReason;
	/** year/major, the zip folder and the manifest grouping key */
	folder: string;
	/** full path inside the zip; also the dedupe key */
	path: string;
}

/** Rows that pass the filter (or are force-added), each mapped to its export path. */
async function selectResumes(filter: ResumeExportFilter): Promise<SelectedResume[]> {
	const rows = await listResumesForExport(db);
	const withFlag = rows
		.filter((r): r is typeof r & { resumeKey: string } => Boolean(r.resumeKey))
		.map((r) => ({ ...r, hasResume: true as const }));

	const picked = applyResumeSelection(withFlag, filter);

	const seen = new Set<string>();
	const out: SelectedResume[] = [];
	for (const r of picked) {
		const year = r.graduationYear != null ? String(r.graduationYear) : 'unknown-year';
		const folder = `${year}/${slugify(r.major || 'unspecified-major')}`;
		const stem = `${slugify(`${r.lastName}-${r.firstName}`)}_${r.memberId.slice(0, 8)}`;
		let path = `${folder}/${stem}.pdf`;
		for (let n = 2; seen.has(path); n++) path = `${folder}/${stem}-${n}.pdf`;
		seen.add(path);

		out.push({
			memberId: r.memberId,
			firstName: r.firstName,
			lastName: r.lastName,
			major: r.major,
			graduationYear: r.graduationYear,
			duesPaid: r.duesPaid,
			officerStatus: r.officerStatus,
			resumeUploadedAt: r.resumeUploadedAt,
			resumeKey: r.resumeKey,
			reason: selectionReason({ ...r }, filter) ?? 'filter',
			folder,
			path,
		});
	}

	// year, then major, then name — the order used for zip folders and the PDF TOC.
	out.sort(
		(a, b) =>
			(a.graduationYear ?? 9999) - (b.graduationYear ?? 9999) ||
			a.major.localeCompare(b.major) ||
			a.lastName.localeCompare(b.lastName) ||
			a.firstName.localeCompare(b.firstName),
	);
	return out;
}

function noStoreHeaders(contentType: string, filename?: string): HeadersInit {
	return {
		'Content-Type': contentType,
		...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
		'X-Content-Type-Options': 'nosniff',
		'X-Robots-Tag': 'noindex, nofollow',
		'Cache-Control': 'private, no-store, max-age=0',
	};
}

export async function GET(request: Request): Promise<Response> {
	const gate = await requireCapability('review_resumes');
	if (gate instanceof Response) return gate;

	const params = new URL(request.url).searchParams;
	const formatParam = params.get('format');
	const format = formatParam === 'pdf' ? 'pdf' : formatParam === 'count' ? 'count' : 'zip';
	const filter = parseResumeFilter(params);

	const selected = await selectResumes(filter);
	const storage = await getStorage();
	const today = new Date().toISOString().slice(0, 10);

	if (format === 'count') {
		return Response.json(await buildCount(selected, storage, filter));
	}

	if (selected.length === 0) {
		return new Response('No résumés match the current filter', { status: 404 });
	}

	// Pull every selected résumé's bytes once; both output formats reuse them.
	const files: { entry: SelectedResume; bytes: Buffer }[] = [];
	const missing: string[] = [];
	for (const entry of selected) {
		try {
			files.push({ entry, bytes: await storage.getBytes({ key: entry.resumeKey, bucket: 'private' }) });
		} catch {
			missing.push(entry.path);
		}
	}

	if (format === 'pdf') {
		const pdf = await buildMergedPdf(files, missing, filter);
		return new Response(pdf as unknown as BodyInit, {
			status: 200,
			headers: noStoreHeaders('application/pdf', `watts-resumes-${today}.pdf`),
		});
	}

	return zipResponse(files, missing, filter, `watts-resumes-${today}.zip`);
}

// ── count preview ───────────────────────────────────────────────────────────

async function buildCount(
	selected: SelectedResume[],
	storage: Awaited<ReturnType<typeof getStorage>>,
	filter: ResumeExportFilter,
) {
	const heads = await Promise.all(
		selected.map((s) => storage.head({ key: s.resumeKey, bucket: 'private' }).catch(() => null)),
	);

	let totalBytes = 0;
	let missing = 0;
	const byYear: Record<string, { count: number; bytes: number; byMajor: Record<string, number> }> = {};

	selected.forEach((s, i) => {
		const size = heads[i]?.size ?? 0;
		if (!heads[i]) missing += 1;
		totalBytes += size;
		const yr = s.graduationYear != null ? String(s.graduationYear) : 'unknown';
		const bucket = (byYear[yr] ??= { count: 0, bytes: 0, byMajor: {} });
		bucket.count += 1;
		bucket.bytes += size;
		bucket.byMajor[s.major] = (bucket.byMajor[s.major] ?? 0) + 1;
	});

	return {
		count: selected.length,
		totalBytes,
		missing,
		filter: describeResumeFilter(filter),
		byYear,
	};
}

// ── manifest ────────────────────────────────────────────────────────────────

const csvCell = (v: unknown) => {
	const s = v == null ? '' : String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function manifestCsv(entries: SelectedResume[]): string {
	const header = [
		'folder',
		'last_name',
		'first_name',
		'major',
		'graduation_year',
		'resume_updated',
		'dues_paid',
		'officer',
		'included_via',
	].join(',');
	const lines = entries.map((e) =>
		[
			e.folder,
			e.lastName,
			e.firstName,
			e.major,
			e.graduationYear ?? '',
			e.resumeUploadedAt ? e.resumeUploadedAt.toISOString().slice(0, 10) : '',
			e.duesPaid ? 'yes' : 'no',
			e.officerStatus ? 'yes' : 'no',
			e.reason,
		]
			.map(csvCell)
			.join(','),
	);
	return [header, ...lines].join('\r\n') + '\r\n';
}

function summaryText(entries: SelectedResume[], missing: string[], filter: ResumeExportFilter): string {
	const lines: string[] = [
		'WATTS résumé export',
		`generated: ${new Date().toISOString()}`,
		`filter:    ${describeResumeFilter(filter)}`,
		`included:  ${entries.length} résumé(s)`,
		'',
		'by graduation year:',
	];

	const years = [...new Set(entries.map((e) => e.graduationYear))].sort(
		(a, b) => (a ?? 9999) - (b ?? 9999),
	);
	for (const yr of years) {
		const inYear = entries.filter((e) => e.graduationYear === yr);
		lines.push(`  ${yr ?? 'unknown'} — ${inYear.length}`);
		const majors = [...new Set(inYear.map((e) => e.major))].sort();
		for (const m of majors) {
			lines.push(`    ${m} — ${inYear.filter((e) => e.major === m).length}`);
		}
	}

	if (missing.length) {
		lines.push('', `missing from storage: ${missing.length}`);
		for (const m of missing) lines.push(`  ${m}`);
	}
	return lines.join('\n') + '\n';
}

// ── zip: the individual PDFs, foldered by year / major ───────────────────────

function zipResponse(
	files: { entry: SelectedResume; bytes: Buffer }[],
	missing: string[],
	filter: ResumeExportFilter,
	filename: string,
): Response {
	const archive = archiver('zip', { store: true }); // PDFs are already compressed
	archive.on('warning', (err) => {
		if (err.code !== 'ENOENT') console.error('[resume-export] archive warning', err);
	});
	archive.on('error', (err) => {
		console.error('[resume-export] archive error', err);
		archive.destroy(err as Error);
	});

	for (const f of files) archive.append(f.bytes, { name: f.entry.path });

	archive.append(manifestCsv(files.map((f) => f.entry)), { name: 'index.csv' });
	archive.append(summaryText(files.map((f) => f.entry), missing, filter), { name: '_summary.txt' });
	if (missing.length > 0) {
		archive.append(
			`These résumés are in the database but their files were not found in storage:\n\n${missing.join(
				'\n',
			)}\n`,
			{ name: '_errors.txt' },
		);
	}
	void archive.finalize();

	// Node Transform → web stream. The @types/node `stream/web` type and the DOM
	// `BodyInit` don't line up nominally, hence the cast.
	return new Response(Readable.toWeb(archive) as unknown as BodyInit, {
		status: 200,
		headers: noStoreHeaders('application/zip', filename),
	});
}

// ── pdf: every résumé concatenated, TOC first, a divider page per person ─────

// The standard 14 PDF fonts only encode WinAnsi; drop anything outside it so an
// accented name can't throw mid-merge.
const winAnsi = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '');

const PAGE: [number, number] = [612, 792];
const TOC_TOP = 720;
const TOC_BOTTOM = 56;
const TOC_LINE = 15;

type TocLine =
	| { kind: 'year'; text: string }
	| { kind: 'major'; text: string }
	| { kind: 'entry'; text: string; page: number };

async function buildMergedPdf(
	files: { entry: SelectedResume; bytes: Buffer }[],
	missing: string[],
	filter: ResumeExportFilter,
): Promise<Buffer> {
	const merged = await PDFDocument.create();
	const font = await merged.embedFont(StandardFonts.Helvetica);
	const bold = await merged.embedFont(StandardFonts.HelveticaBold);
	const grey = rgb(0.35, 0.35, 0.35);

	// pass 1 — load each résumé, learn its page count (so the TOC can cite pages)
	const loaded = await Promise.all(
		files.map(async (f) => {
			try {
				const doc = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
				return { entry: f.entry, doc, pageCount: doc.getPageCount() };
			} catch {
				missing.push(`${f.entry.path}\t(unreadable PDF)`);
				return { entry: f.entry, doc: null as PDFDocument | null, pageCount: 0 };
			}
		}),
	);

	// TOC line plan: a "Class of YYYY" row, a major row, then one row per person.
	const lines: TocLine[] = [];
	let lastYear: number | null | undefined;
	let lastMajor: string | undefined;
	for (const l of loaded) {
		if (l.entry.graduationYear !== lastYear) {
			lastYear = l.entry.graduationYear;
			lastMajor = undefined;
			lines.push({ kind: 'year', text: `Class of ${lastYear ?? 'unknown'}` });
		}
		if (l.entry.major !== lastMajor) {
			lastMajor = l.entry.major;
			lines.push({ kind: 'major', text: l.entry.major });
		}
		lines.push({ kind: 'entry', text: `${l.entry.lastName}, ${l.entry.firstName}`, page: 0 });
	}

	const linesPerPage = Math.floor((TOC_TOP - TOC_BOTTOM) / TOC_LINE);
	// +4 lines of header on the first TOC page (title + filter + count + gap)
	const tocPageCount = Math.max(1, Math.ceil((lines.length + 4) / linesPerPage));

	// assign real page numbers now that we know how many TOC pages precede them.
	// entry lines are in the same order as `loaded`.
	let pageNo = tocPageCount + 1;
	let idx = 0;
	for (const line of lines) {
		if (line.kind !== 'entry') continue;
		line.page = pageNo;
		pageNo += 1 + loaded[idx].pageCount; // divider page + résumé pages
		idx++;
	}

	// reserve TOC pages, then lay down content
	const tocPages: PDFPage[] = [];
	for (let i = 0; i < tocPageCount; i++) tocPages.push(merged.addPage(PAGE));

	for (const l of loaded) {
		const divider = merged.addPage(PAGE);
		divider.drawText(winAnsi(`${l.entry.firstName} ${l.entry.lastName}`.trim()) || 'Unknown', {
			x: 56,
			y: 700,
			size: 26,
			font: bold,
		});
		const sub = winAnsi(
			[l.entry.major, l.entry.graduationYear ? `Class of ${l.entry.graduationYear}` : null]
				.filter(Boolean)
				.join('  ·  '),
		);
		if (sub) divider.drawText(sub, { x: 56, y: 668, size: 12, font, color: grey });

		if (l.doc) {
			const pages = await merged.copyPages(l.doc, l.doc.getPageIndices());
			for (const p of pages) merged.addPage(p);
		} else {
			divider.drawText('(this résumé PDF could not be read and was skipped)', {
				x: 56,
				y: 636,
				size: 12,
				font,
				color: rgb(0.7, 0.1, 0.1),
			});
		}
	}

	drawToc(tocPages, lines, filter, loaded.length, font, bold, grey);
	return Buffer.from(await merged.save());
}

function drawToc(
	pages: PDFPage[],
	lines: TocLine[],
	filter: ResumeExportFilter,
	count: number,
	font: PDFFont,
	bold: PDFFont,
	grey: ReturnType<typeof rgb>,
) {
	let pi = 0;
	let y = TOC_TOP;
	const page = () => pages[Math.min(pi, pages.length - 1)];

	page().drawText('Contents', { x: 56, y, size: 20, font: bold });
	y -= 22;
	page().drawText(winAnsi(describeResumeFilter(filter)), { x: 56, y, size: 10, font, color: grey });
	y -= 14;
	page().drawText(`${count} résumé${count === 1 ? '' : 's'}`, { x: 56, y, size: 10, font, color: grey });
	y -= 22;

	for (const line of lines) {
		if (y < TOC_BOTTOM && pi < pages.length - 1) {
			pi++;
			y = TOC_TOP;
		}
		if (line.kind === 'year') {
			page().drawText(winAnsi(line.text), { x: 56, y, size: 13, font: bold });
		} else if (line.kind === 'major') {
			page().drawText(winAnsi(line.text), { x: 72, y, size: 10, font, color: grey });
		} else {
			page().drawText(winAnsi(line.text), { x: 88, y, size: 10, font });
			page().drawText(String(line.page), { x: 540, y, size: 10, font, color: grey });
		}
		y -= TOC_LINE;
	}
}
