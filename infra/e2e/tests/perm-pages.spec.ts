import { test, expect } from '@playwright/test';
import { factsFor, PAGES } from '../lib/access-matrix';
import { pageMatches, pageOutcomeOf, personaRequest, personasReady } from '../lib/perm-client';
import { MATRIX_PERSONAS } from '../lib/personas';

// Every gated page × every persona, against lib/access-matrix.ts. Plain HTTP GETs with
// redirects NOT followed, so we see exactly what middleware / the server guard decided
// (render, 404, → /dashboard, → /auth/signin) without driving a browser.
test.skip(!personasReady(), 'needs the permission personas (local / CI Postgres)');

const probed = PAGES.filter((p) => p.probe);

for (const key of MATRIX_PERSONAS) {
	test(`page gates as ${key}`, async () => {
		const f = factsFor(key);
		const ctx = await personaRequest(key);
		const problems: string[] = [];
		try {
			for (const page of probed) {
				const want = page.expect(f);
				const res = await ctx.get(page.probe!, { maxRedirects: 0 });
				const { outcome, detail } = await pageOutcomeOf(res);
				if (!pageMatches(want, outcome)) problems.push(`${page.probe}: expected ${want}, got ${outcome} (${detail})`);
			}
		} finally {
			await ctx.dispose();
		}
		expect(problems, `${problems.length} page(s) disagree with the matrix for ${key}`).toEqual([]);
	});
}
