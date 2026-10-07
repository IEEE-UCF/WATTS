import { test, expect } from '@playwright/test';
import { factsFor, ROUTES, UPLOAD_KINDS } from '../lib/access-matrix';
import { apiOutcomeOf, personaIds, personaRequest, personasReady } from '../lib/perm-client';
import { FIX, MATRIX_PERSONAS } from '../lib/personas';

// The non-tRPC HTTP routes × every persona. Each probe is chosen so an ALLOWED caller
// stops before anything is written or streamed:
//   - résumé export ?gy=1900 → 404 (no matches)
//   - résumé / event photo → 404 (the fixture rows point at objects that don't exist)
//   - uploads → 400 (unsupported content type) — or, for site-media (which validates
//     the file before the scope), a presigned URL that is never used.
test.skip(!personasReady(), 'needs the permission personas (local / CI Postgres)');

const env = { resumeAudience: process.env.RESUME_UPLOAD_AUDIENCE ?? 'admins' };
const localStorage = (process.env.STORAGE_PROVIDER ?? 'local') !== 'vercel';
const route = (r: string) => {
	const found = ROUTES.find((x) => x.route === r);
	if (!found?.expect) throw new Error(`no probed matrix entry for ${r}`);
	return found.expect;
};

for (const key of MATRIX_PERSONAS) {
	test(`HTTP route gates as ${key}`, async () => {
		const f = factsFor(key);
		const ids = personaIds();
		const ctx = await personaRequest(key);
		const problems: string[] = [];
		const check = async (label: string, want: string, res: import('@playwright/test').APIResponse) => {
			const got = apiOutcomeOf(res.status());
			if (got !== want) problems.push(`${label}: expected ${want}, got ${got} (${res.status()} ${(await res.text()).slice(0, 120)})`);
		};
		try {
			await check(
				'GET /api/files/resume/export',
				route('/api/files/resume/export')(f, env),
				await ctx.get('/api/files/resume/export?gy=1900', { maxRedirects: 0 }),
			);
			await check(
				"GET /api/files/resume/[member's]",
				route('/api/files/resume/[memberId]')(f, env),
				await ctx.get(`/api/files/resume/${ids.memberIds.member}`, { maxRedirects: 0 }),
			);
			await check(
				'GET /api/files/event-photo/[private]',
				route('/api/files/event-photo/[id]')(f, env),
				await ctx.get(`/api/files/event-photo/${FIX.privatePhoto}`, { maxRedirects: 0 }),
			);
			if (localStorage) {
				for (const { kind, expect: want } of UPLOAD_KINDS) {
					const intent =
						kind === 'site-media'
							? { kind, contentType: 'image/png', byteSize: 1, mediaKind: 'image', scopeType: 'committee', scopeId: FIX.committeeA }
							: { kind, contentType: 'text/plain', byteSize: 1, eventId: FIX.event, projectId: FIX.projectA };
					await check(`POST /api/blob/upload kind=${kind}`, want(f, env), await ctx.post('/api/blob/upload', { data: intent, maxRedirects: 0 }));
				}
			}
		} finally {
			await ctx.dispose();
		}
		expect(problems, `${problems.length} route(s) disagree with the matrix for ${key}`).toEqual([]);
	});
}
