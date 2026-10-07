// Helpers for the perm-*.spec.ts suites: an APIRequestContext per persona, a raw
// tRPC caller (superjson wire format, no batching), and outcome classifiers.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';
import type { ApiOutcome, PageOutcome } from './access-matrix';
import { ANON, PERSONA_IDS_PATH, storageStatePath } from './personas';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export function personasReady(): boolean {
	return existsSync(join(process.cwd(), PERSONA_IDS_PATH));
}

export function personaIds(): { memberIds: Record<string, string>; userIds: Record<string, string> } {
	return JSON.parse(readFileSync(join(process.cwd(), PERSONA_IDS_PATH), 'utf8'));
}

/** A request context signed in as `key` (or with no cookie for `anon`). Dispose when done. */
export function personaRequest(key: string): Promise<APIRequestContext> {
	return request.newContext({
		baseURL: BASE_URL,
		ignoreHTTPSErrors: true,
		storageState: key === ANON ? undefined : storageStatePath(key),
	});
}

export interface TrpcResult {
	status: number;
	code: string | null; // TRPC error code, e.g. FORBIDDEN
	message: string | null;
	data: unknown;
}

/** Call one tRPC procedure over HTTP exactly as the web client does (superjson, unbatched). */
export async function trpc(
	ctx: APIRequestContext,
	path: string,
	type: 'query' | 'mutation',
	input?: unknown,
): Promise<TrpcResult> {
	const wire = input === undefined ? undefined : { json: input };
	const res =
		type === 'query'
			? await ctx.get(`/api/trpc/${path}${wire ? `?input=${encodeURIComponent(JSON.stringify(wire))}` : ''}`, {
					maxRedirects: 0,
				})
			: await ctx.post(`/api/trpc/${path}`, {
					data: wire ?? {},
					headers: { 'content-type': 'application/json' },
					maxRedirects: 0,
				});
	let body: { result?: { data?: { json?: unknown } }; error?: { json?: { message?: string; data?: { code?: string } } } } = {};
	try {
		body = await res.json();
	} catch {
		// non-JSON (e.g. a 5xx HTML page) — status alone tells the story
	}
	return {
		status: res.status(),
		code: body.error?.json?.data?.code ?? null,
		message: body.error?.json?.message ?? null,
		data: body.result?.data?.json,
	};
}

/** Map an HTTP / tRPC response to the matrix's access outcome. */
export function apiOutcomeOf(status: number, code?: string | null): ApiOutcome {
	if (status === 401 || code === 'UNAUTHORIZED') return 'unauth';
	if (status === 403 || code === 'FORBIDDEN') return 'forbidden';
	return 'allow';
}

/**
 * Classify a page GET made with maxRedirects: 0. Redirects come either as a 3xx with
 * Location (middleware, or a server redirect() before streaming) or, once streaming has
 * started, as a 200 carrying Next's <meta id="__next-page-redirect"> tag.
 */
export async function pageOutcomeOf(res: import('@playwright/test').APIResponse): Promise<{ outcome: PageOutcome | 'other'; detail: string }> {
	const status = res.status();
	let location = res.headers()['location'] ?? null;
	if (status === 200 && !location) {
		const html = await res.text();
		const meta = html.match(/id="__next-page-redirect"[^>]*content="\d+;url=([^"]+)"/);
		if (meta) location = meta[1];
		else if (/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(html) && /PAGE NOT FOUND/.test(html)) return { outcome: 'notfound', detail: '200 + not-found fallback' };
	}
	if (location) {
		const target = new URL(location, BASE_URL).pathname;
		if (target.startsWith('/auth/signin')) return { outcome: 'signin', detail: `→ ${target}` };
		if (target.startsWith('/dashboard')) return { outcome: 'dashboard', detail: `→ ${target}` };
		return { outcome: 'other', detail: `${status} → ${target}` };
	}
	if (status === 404) return { outcome: 'notfound', detail: '404' };
	if (status === 200) return { outcome: 'render', detail: '200' };
	return { outcome: 'other', detail: String(status) };
}

/** Does an observed page outcome satisfy the expected one? */
export function pageMatches(expected: PageOutcome, observed: PageOutcome | 'other'): boolean {
	if (expected === 'reachable') return observed === 'render' || observed === 'notfound';
	return expected === observed;
}
