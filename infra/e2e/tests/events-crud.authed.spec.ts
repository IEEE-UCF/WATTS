import { test, expect } from '@playwright/test';
import { loadRootEnv } from '@watts/config/load-env';
import pg from 'pg';
import { dbHostAllowed } from '../lib/session';

// Runs in the `authenticated` project (real captured session OR the guarded
// synthetic admin+officer session minted by global-setup). The synthetic user
// holds `manage_events`, so /admin/events and the create form are reachable.
//
// Google Calendar is never contacted: CI / local test runs have no
// GOOGLE_SERVICE_ACCOUNT_JSON, so @watts/calendar no-ops and rows land with
// syncStatus 'skipped'. The test only asserts the sync did not error.

loadRootEnv();

const STAMP = Date.now();
const TITLE = `E2E CRUD ${STAMP}`;
const TITLE_EDITED = `${TITLE} (edited)`;
const TITLE_PREFIX = 'E2E CRUD ';

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
	// No factories in this suite — clean our rows directly. Same local-only guard
	// as the role helper: never touch a remote DB.
	if (!dbHostAllowed() || !process.env.DATABASE_URL) return;
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
	try {
		await pool.query('delete from events where title like $1', [`${TITLE_PREFIX}%`]);
	} finally {
		await pool.end();
	}
});

test('staff can create, edit and delete an event from /admin/events', async ({ page }) => {
	await page.goto('/admin/events', { waitUntil: 'domcontentloaded' });
	await expect(page).not.toHaveURL(/\/auth\/signin/);
	await expect(page.getByRole('heading', { name: /event management/i })).toBeVisible();

	// ── create ──
	await page.getByRole('button', { name: '+ New event' }).click();
	await page.fill('#title', TITLE);
	await page.fill('#location', 'HEC 101');
	await page.fill('#description', 'Created by the Playwright event-CRUD spec.');
	await page.fill('#startTime', '2099-01-15T18:00');
	await page.fill('#endTime', '2099-01-15T19:30');

	// The category select must be present and populated from the label seed.
	const labelOptions = page.locator('#labelId option');
	expect(await labelOptions.count()).toBeGreaterThan(1);
	await page.locator('#labelId').selectOption({ index: 1 });

	await page.screenshot({
		path: 'screenshots/admin-events-create-form.png',
		fullPage: true,
		animations: 'disabled',
	});

	await page.getByRole('button', { name: 'Create event' }).click();

	const row = page.getByRole('row', { name: new RegExp(TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
	await expect(row).toBeVisible();
	await expect(row).not.toContainText('error'); // sync must not have failed

	// ── edit ──
	await row.getByRole('button', { name: 'edit' }).click();
	await expect(page.locator('#title')).toHaveValue(TITLE);
	await page.fill('#title', TITLE_EDITED);
	await page.getByRole('button', { name: 'Save changes' }).click();

	const editedRow = page.getByRole('row', {
		name: new RegExp(TITLE_EDITED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
	});
	await expect(editedRow).toBeVisible();

	// ── delete (soft / archive) ──
	page.once('dialog', (d) => d.accept());
	await editedRow.getByRole('button', { name: 'delete' }).click();

	// Archived rows leave the default grid and the public feed…
	await expect(editedRow).toBeHidden();
	const feed = await page.request.get(
		'/api/trpc/event.getAll?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D',
	);
	expect(feed.ok()).toBeTruthy();
	expect(await feed.text()).not.toContain(TITLE_EDITED);

	// …but are still reachable via "Show archived", where they can be purged.
	await page.getByLabel(/Show archived/).check();
	await expect(editedRow).toBeVisible();
	await expect(editedRow).toContainText('archived');
	page.once('dialog', (d) => d.accept());
	await editedRow.getByRole('button', { name: 'delete permanently' }).click();
	await expect(editedRow).toBeHidden();
});
