/**
 * URL slugs for public pages (/projects/[slug], /events/[slug]). Slug columns are
 * varchar(64); `maxLength` leaves room for a "-2" style suffix.
 */
export function slugify(text: string, maxLength = 56, fallback = 'page'): string {
	const full = text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (full.length <= maxLength) return full || fallback;
	// Cut at the last whole word that fits ("…-programming", not "…-programming-c").
	const cut = full.slice(0, maxLength + 1);
	const lastDash = cut.lastIndexOf('-');
	const trimmed = (lastDash > 0 ? cut.slice(0, lastDash) : full.slice(0, maxLength)).replace(/-+$/, '');
	return trimmed || fallback;
}

/** `base`, or `base-2`, `base-3`… — the first one not in `taken`. */
export function firstFreeSlug(base: string, taken: Set<string | null>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
	}
}
