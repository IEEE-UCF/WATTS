// Pure short-link rules (no database imports), so the admin form can check input as
// it's typed and the redirect route can classify a hit without pulling in drizzle.

/** Slugs that would read as site sections, or that we may want under /go later. */
export const RESERVED_SHORT_LINK_SLUGS: ReadonlySet<string> = new Set([
	'admin',
	'api',
	'app',
	'dashboard',
	'edit',
	'go',
	'login',
	'logout',
	'new',
	'retired',
	'settings',
	'signin',
	'staff',
]);

/**
 * The origin printed into every QR code. Fixed rather than taken from the request: a QR
 * made on localhost or a preview deployment must still encode the real site.
 * Override with SHORT_LINK_ORIGIN (e.g. for a staging domain).
 */
export const DEFAULT_SHORT_LINK_ORIGIN = 'https://www.ieeeucf.com'; // apex 307s to www — skip the hop

export function shortLinkOrigin(configured?: string | null): string {
	try {
		return new URL(configured || DEFAULT_SHORT_LINK_ORIGIN).origin;
	} catch {
		return DEFAULT_SHORT_LINK_ORIGIN;
	}
}

/** The address a link's QR encodes (`?s=qr` lets the redirect count scans apart from clicks). */
export function shortLinkUrl(origin: string, slug: string, opts: { qr?: boolean } = {}): string {
	return `${origin}/go/${slug}${opts.qr ? '?s=qr' : ''}`;
}

export const SHORT_LINK_SLUG_MAX = 64;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Lowercase, spaces/punctuation → dashes. Doesn't validate; see `shortLinkSlugProblem`. */
export function normalizeShortLinkSlug(input: string): string {
	return input
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Why `slug` (already normalized) can't be used, or null if it's fine. */
export function shortLinkSlugProblem(slug: string): string | null {
	if (slug.length < 2) return 'The short address needs at least 2 characters.';
	if (slug.length > SHORT_LINK_SLUG_MAX) return `The short address can be at most ${SHORT_LINK_SLUG_MAX} characters.`;
	if (!SLUG_RE.test(slug)) return 'Use only lowercase letters, numbers and dashes.';
	if (RESERVED_SHORT_LINK_SLUGS.has(slug)) return `"${slug}" is reserved — pick another short address.`;
	return null;
}

/**
 * Why `raw` can't be a destination, or null if it's fine. Only http(s): a short link on
 * the official domain must never become a `javascript:` / `data:` URL. `ownOrigin` is
 * the site's public origin — pointing at our own /go/ would just loop.
 */
export function shortLinkTargetProblem(raw: string, ownOrigin?: string): string | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return 'Enter a full address, starting with https://';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only http:// and https:// addresses are allowed.';
	if (!url.hostname.includes('.') && url.hostname !== 'localhost') return 'That address is missing its domain.';
	if (ownOrigin) {
		let own: URL | null = null;
		try {
			own = new URL(ownOrigin);
		} catch {
			own = null;
		}
		const bare = (h: string) => h.replace(/^www\./, '');
		if (own && bare(url.hostname) === bare(own.hostname) && /^\/go(\/|$)/.test(url.pathname)) {
			return "A short link can't point at another short link.";
		}
	}
	return null;
}

/** Live = not archived and not past its expiry. */
export function isShortLinkLive(link: { active: boolean; expiresAt: Date | string | null }, now = new Date()): boolean {
	if (!link.active) return false;
	if (link.expiresAt == null) return true;
	return new Date(link.expiresAt).getTime() > now.getTime();
}

// Link-preview fetchers (Discord, iMessage, Slack…), crawlers and scripted clients.
// They fetch the URL without a person behind it, so they don't count as a click.
const NON_HUMAN_UA =
	/bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebot|embedly|preview|whatsapp|telegram|skypeuripreview|iframely|headless|lighthouse|curl\/|wget\/|python-|httpclient|okhttp|go-http-client|node-fetch|axios\//i;

/** Should this request bump a counter? (No user agent at all = not a browser.) */
export function isCountableHit(userAgent: string | null | undefined, purpose?: string | null): boolean {
	if (!userAgent) return false;
	if (purpose && /prefetch|prerender/i.test(purpose)) return false;
	return !NON_HUMAN_UA.test(userAgent);
}
