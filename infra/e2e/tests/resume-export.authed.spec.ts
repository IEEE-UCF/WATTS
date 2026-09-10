import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { dbHostAllowed } from '../lib/session';
import {
	RESUME_FIXTURES,
	STORAGE_IS_LOCAL,
	cleanResumeFixtures,
	seedResumeFixtures,
	storageReachable,
} from '../lib/resume-fixtures';

// Runs in the `authenticated` project (real captured session OR the guarded
// synthetic admin+officer session from global-setup). The synthetic user is an
// administrator, so it clears `review_resumes` and can hit /admin/resumes and the
// export route.
//
// Fixtures: three synthetic members with real one-page PDFs in the private bucket
// (2024 CS / 2024 EE / 2025 CS-officer). Seeded here, removed in afterAll — same
// local-only guard as lib/session.ts.

const EXPORT = '/api/files/resume/export';
const runnable = dbHostAllowed() && Boolean(process.env.DATABASE_URL) && STORAGE_IS_LOCAL;

// Open the résumé dashboard and wait for the tRPC list to resolve before
// asserting on anything derived from it. Generous timeout so a cold `next dev`
// route compile (E2E_BASE_URL=:3050) doesn't flake the first hit.
async function openResumeDashboard(page: import('@playwright/test').Page) {
	await page.goto('/admin/resumes', { waitUntil: 'load' });
	await expect(page).not.toHaveURL(/\/auth\/signin/);
	await expect(page.getByText('Loading…')).toBeHidden({ timeout: 20_000 });
}

test.describe('résumé bulk export', () => {
	test.skip(!runnable, 'needs a local Postgres + local object storage (MinIO)');
	test.describe.configure({ mode: 'serial' });

	let seeded = false;
	test.beforeAll(async () => {
		// Object storage is a separate service from the Postgres the rest of the
		// authed suite needs. If it isn't up (e.g. CI without the minio service),
		// skip rather than fail the whole run.
		test.skip(!(await storageReachable()), 'object storage (MinIO) not reachable');
		await seedResumeFixtures();
		seeded = true;
	});
	test.afterAll(async () => {
		if (seeded) await cleanResumeFixtures();
	});

	test('/admin/resumes shows the filter bar and export actions', async ({ page }) => {
		await openResumeDashboard(page);
		await expect(page.getByText('CLASS OF', { exact: false })).toBeVisible();
		await expect(page.getByText('always include officers', { exact: false })).toBeVisible();
		await expect(page.getByRole('link', { name: /Export \d+ · \.zip/ })).toBeVisible();
		await expect(page.getByRole('link', { name: 'one PDF' })).toBeVisible();
		await page.screenshot({
			path: 'screenshots/resume-export-dashboard.png',
			fullPage: true,
			animations: 'disabled',
		});
	});

	test('picking a graduation year narrows the set and updates the export link', async ({ page }) => {
		await openResumeDashboard(page);
		const zip = page.getByRole('link', { name: /Export \d+ · \.zip/ });

		// 2024 = exactly the two fixture members (no other résumé in the repo is 2024)
		await page.getByRole('button', { name: '2024', exact: true }).click();
		await expect(zip).toHaveAttribute('href', `${EXPORT}?gy=2024`);
		await expect(zip).toHaveText(/Export 2 · \.zip/);

		// officers get force-added past the year filter — at least Charlie (2025), and
		// possibly other seeded officers. Count only ever goes up; the href gains officers=1.
		await page.getByRole('checkbox', { name: /always include officers/ }).check();
		await expect(zip).toHaveAttribute('href', `${EXPORT}?gy=2024&officers=1`);
		await expect(zip).toHaveText(/Export ([3-9]|\d\d+) · \.zip/);

		await page.screenshot({
			path: 'screenshots/resume-export-filtered.png',
			fullPage: true,
			animations: 'disabled',
		});
	});

	test('format=count reports totals grouped by year → major', async ({ request }) => {
		const res = await request.get(`${EXPORT}?format=count`);
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body.count).toBeGreaterThanOrEqual(RESUME_FIXTURES.length);
		expect(body.totalBytes).toBeGreaterThan(0);
		expect(body.byYear['2024']).toBeTruthy();
		expect(body.byYear['2025']).toBeTruthy();
		expect(body.byYear['2024'].byMajor['Computer Science (BS)']).toBeGreaterThanOrEqual(1);
	});

	test('gy filter is honoured by the count endpoint', async ({ request }) => {
		const res = await request.get(`${EXPORT}?gy=2024&format=count`);
		const body = await res.json();
		expect(body.count).toBe(2); // Alpha + Bravo
		expect(Object.keys(body.byYear)).toEqual(['2024']);
	});

	test('officers=1 force-adds officers past the year filter', async ({ request }) => {
		const base = await (await request.get(`${EXPORT}?gy=2024&format=count`)).json();
		const withOfficers = await (
			await request.get(`${EXPORT}?gy=2024&officers=1&format=count`)
		).json();
		// at least Charlie (2025 CS officer) joins; other seeded officers may too
		expect(withOfficers.count).toBeGreaterThan(base.count);
		expect(withOfficers.byYear['2025']?.byMajor?.['Computer Science (BS)']).toBeGreaterThanOrEqual(1);
	});

	test('a filter that matches nothing is a 404', async ({ request }) => {
		const res = await request.get(`${EXPORT}?gy=1900`);
		expect(res.status()).toBe(404);
	});

	test('the zip download is a real archive, foldered by year/major, with a manifest', async ({
		request,
	}) => {
		const res = await request.get(EXPORT);
		expect(res.ok()).toBeTruthy();
		expect(res.headers()['content-type']).toContain('application/zip');
		expect(res.headers()['content-disposition']).toMatch(/watts-resumes-\d{4}-\d{2}-\d{2}\.zip/);

		const buf = await res.body();
		expect(buf.subarray(0, 2).toString('latin1')).toBe('PK'); // local file header
		const text = buf.toString('latin1');
		expect(text).toContain('index.csv');
		expect(text).toContain('_summary.txt');
		expect(text).toContain('2024/computer-science-bs/');
		expect(text).toContain('2025/computer-science-bs/');
	});

	test('format=pdf returns one merged PDF with a divider page per résumé', async ({ request }) => {
		const res = await request.get(`${EXPORT}?format=pdf`);
		expect(res.ok()).toBeTruthy();
		expect(res.headers()['content-type']).toContain('application/pdf');

		const buf = await res.body();
		expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		const merged = await PDFDocument.load(buf, { ignoreEncryption: true });
		// contents page + 3 × (divider + 1 résumé page)
		expect(merged.getPageCount()).toBeGreaterThanOrEqual(1 + RESUME_FIXTURES.length * 2);
	});

	// The anonymous 401 gate is covered in auth-gates.spec.ts (anon project).
});
