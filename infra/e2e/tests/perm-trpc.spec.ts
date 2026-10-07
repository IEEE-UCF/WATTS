import { test, expect } from '@playwright/test';
import { apiOutcome, factsFor, PROCEDURES } from '../lib/access-matrix';
import { apiOutcomeOf, personaRequest, personasReady, trpc } from '../lib/perm-client';
import { MATRIX_PERSONAS } from '../lib/personas';

// Every tRPC procedure × every persona, against lib/access-matrix.ts.
//
// Side-effect free by construction: each procedure that takes input is sent a bare
// string, which no input schema accepts. The auth middleware runs BEFORE input
// parsing (gates are `.use()`d on the base procedure, `.input()` comes after), so:
//   denied  → 401 UNAUTHORIZED / 403 FORBIDDEN  (body never runs)
//   allowed → 400 BAD_REQUEST                   (body never runs either)
// Queries without input just run (they're reads). Mutations without input are only
// probed where the matrix expects a denial.
test.skip(!personasReady(), 'needs the permission personas (local / CI Postgres)');

const PROBE = '__perm_probe__';

for (const key of MATRIX_PERSONAS) {
	test(`tRPC gates as ${key}`, async () => {
		const f = factsFor(key);
		const ctx = await personaRequest(key);
		const problems: string[] = [];
		try {
			for (const [path, entry] of Object.entries(PROCEDURES)) {
				const want = apiOutcome(entry.gate, f);
				if (entry.type === 'mutation' && !entry.input && want === 'allow') continue;
				const r = await trpc(ctx, path, entry.type, entry.input ? PROBE : undefined);
				const got = apiOutcomeOf(r.status, r.code);
				const why = `${r.status} ${r.code ?? ''}${r.message ? ` "${r.message}"` : ''}`.trim();
				if (got !== want) problems.push(`${path}: expected ${want}, got ${got} (${why})`);
				else if (want === 'allow' && entry.input && r.code !== 'BAD_REQUEST')
					problems.push(`${path}: allowed, but the probe input wasn't rejected — is .input() before the gate? (${why})`);
			}
		} finally {
			await ctx.dispose();
		}
		expect(problems, `${problems.length} procedure(s) disagree with the matrix for ${key}`).toEqual([]);
	});
}
