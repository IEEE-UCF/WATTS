import { test, expect } from '@playwright/test';
import { closeDb, restore, setRole, snapshot, type RoleSnapshot } from '../lib/role';

// Runs in the `authenticated` project (needs e2e/.auth/user.json + E2E_BASE_URL).
// Mutates the captured user's real member row (the same writes the members-manager
// UI makes), so it must be serial and restore the original state.
//
// Access model this pins down:
//   - admin/layout.tsx floor = admin OR officer. A plain member never gets past it,
//     regardless of granted capabilities.
//   - /admin/dashboard additionally requires `administrator` (officers redirected).
//   - /admin/members = officer OR admin.
//   - /admin/photos, /admin/resumes call hasCapability(cap), which is
//     `administrator || officerStatus || permissions.includes(cap)` — so EVERY officer
//     sees them; the capability only ever gates a non-officer member (who is already
//     blocked by the layout floor anyway).
//   - /staff has no /admin floor: admin OR officer OR any staff-capability grant.
test.describe.configure({ mode: 'serial' });

const R = 'render' as const;
const D = 'dashboard' as const;
type Want = typeof R | typeof D;

// /settings and /admin/members render-cells 500 under `next dev` (useSession +
// static optimization) — tracked as fixme in authed.spec.ts, kept out of here.
const MATRIX: { path: string; member: Want; officer: Want; admin: Want }[] = [
	{ path: '/dashboard', member: R, officer: R, admin: R },
	{ path: '/staff', member: D, officer: R, admin: R },
	{ path: '/admin/dashboard', member: D, officer: D, admin: R },
	{ path: '/admin/photos', member: D, officer: R, admin: R },
	{ path: '/admin/resumes', member: D, officer: R, admin: R },
];

let original: RoleSnapshot;
test.beforeAll(async () => {
	original = await snapshot();
});
test.afterAll(async () => {
	try {
		await restore(original);
	} catch (err) {
		console.error(
			'\n!!! ROLE RESTORE FAILED — your member row may be wrong.\n' +
				'    Recover with: pnpm --filter @watts/e2e role-restore\n',
			err,
		);
		throw err;
	} finally {
		await closeDb();
	}
});

async function expectLanding(page: import('@playwright/test').Page, path: string, want: Want) {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await expect(page).not.toHaveURL(/\/auth\/signin/);
	if (want === R) {
		await expect(page).toHaveURL(new RegExp(path.replace(/[/]/g, '\\/') + '(\\/|\\?|$)'));
		await expect(page.locator('body')).toBeVisible();
	} else {
		await expect(page).toHaveURL(/\/dashboard(\/|\?|$)/);
	}
}

for (const role of ['member', 'officer', 'admin'] as const) {
	test.describe(`as ${role}`, () => {
		test.beforeAll(() => setRole(role));
		for (const row of MATRIX) {
			const want = row[role];
			test(`${row.path} → ${want === R ? 'renders' : 'redirects to /dashboard'}`, async ({ page }) => {
				await expectLanding(page, row.path, want);
			});
		}
	});
}

// A plain member (below the /admin floor) with a single staff-capability grant:
// /staff opens, /admin/* still doesn't.
test.describe('as member + one staff capability (scan_attendance)', () => {
	test.beforeAll(() => setRole('member', ['scan_attendance']));

	test('/staff → renders (hasStaffCapability)', async ({ page }) => {
		await expectLanding(page, '/staff', R);
	});
	test('/admin/photos → still redirects (below the admin/officer floor)', async ({ page }) => {
		await expectLanding(page, '/admin/photos', D);
	});
});

// The gap you noticed: staff/page.tsx is a server component whose guard only runs
// on navigation. Revoke access while the user sits on /staff and nothing ejects
// them until the next request.
test.describe('as officer, access revoked while on /staff', () => {
	test.beforeAll(() => setRole('officer'));

	test('stays put while idle; ejected on the next navigation', async ({ page }) => {
		await page.goto('/staff', { waitUntil: 'domcontentloaded' });
		await expect(page).toHaveURL(/\/staff/);

		await setRole('member'); // officer_status revoked in the DB — no navigation

		await page.waitForTimeout(1500);
		await expect(page, 'idle: still on /staff — the server guard was not re-run').toHaveURL(/\/staff/);

		await page.reload({ waitUntil: 'domcontentloaded' });
		await expect(page, 'after reload: middleware + guard eject to /dashboard').toHaveURL(/\/dashboard/);
	});
});
