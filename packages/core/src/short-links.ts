// Officer short links: /go/<slug> → any http(s) address, with a branded QR code made
// in the admin tool. The QR encodes the short address, so a printed flyer keeps
// working when the destination changes. Every change is written to
// short_link_history; a slug can't change once the link has been used.
import { and, asc, desc, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { WattsDb } from '@watts/db';
import { Events, Members, PageRedirects, ShortLinkHistory, ShortLinks } from '@watts/db/schema';
import { hasCapability, type CapabilitySubject } from '@watts/permissions';
import { DomainError } from './errors';
import { findRedirect, recordRedirect } from './redirects';
import {
	isShortLinkLive,
	normalizeShortLinkSlug,
	shortLinkSlugProblem,
	shortLinkTargetProblem,
} from './short-link-rules';
import { firstFreeSlug } from './slugs';

/** Who is acting. `memberId` is null for an admin account without a member profile. */
export interface ShortLinkActor extends CapabilitySubject {
	memberId: string | null;
}

export interface CreateShortLinkInput {
	title: string;
	targetUrl: string;
	/** Optional; derived from the title when blank. */
	slug?: string | null;
	notes?: string | null;
	owner?: string | null;
	expiresAt?: Date | null;
}

export type UpdateShortLinkInput = Partial<CreateShortLinkInput>;

export type ShortLinkHitSource = 'qr' | 'link';

export type ShortLinkResolution =
	| { status: 'ok'; targetUrl: string }
	| { status: 'retired'; title: string }
	| { status: 'not_found' };

type ShortLinkRow = typeof ShortLinks.$inferSelect;

/**
 * Officers and admins can edit any link. A member who was *granted* manage_links can
 * edit only the links they made — a delegated grant shouldn't let someone retarget an
 * officer's printed QR code.
 */
export function canEditShortLink(
	actor: ShortLinkActor,
	link: Pick<ShortLinkRow, 'createdByMemberId'>,
): boolean {
	if (actor.administrator || actor.officerStatus) return true;
	if (!hasCapability(actor, 'manage_links')) return false;
	return actor.memberId != null && link.createdByMemberId === actor.memberId;
}

function cleanText(v: string | null | undefined, max: number): string | null {
	const t = v?.trim();
	return t ? t.slice(0, max) : null;
}

function checkTarget(raw: string, ownOrigin: string | undefined): string {
	const problem = shortLinkTargetProblem(raw, ownOrigin);
	if (problem) throw new DomainError('BAD_REQUEST', problem);
	return new URL(raw.trim()).toString();
}

function checkTitle(raw: string): string {
	const title = raw.trim();
	if (!title) throw new DomainError('BAD_REQUEST', 'Give the link a title.');
	if (title.length > 120) throw new DomainError('BAD_REQUEST', 'The title can be at most 120 characters.');
	return title;
}

/**
 * Is `slug` free for `forLinkId`? Taken by another link's current slug, or by another
 * link's *old* slug (printed QRs still redirect there), means no.
 */
async function slugOwner(db: WattsDb, slug: string): Promise<string | null> {
	const [current] = await db
		.select({ id: ShortLinks.id })
		.from(ShortLinks)
		.where(eq(ShortLinks.slug, slug))
		.limit(1);
	if (current) return current.id;
	return findRedirect(db, 'link', slug);
}

async function assertSlugFree(db: WattsDb, slug: string, forLinkId?: string): Promise<void> {
	const owner = await slugOwner(db, slug);
	if (owner && owner !== forLinkId) {
		throw new DomainError('CONFLICT', `/go/${slug} is already taken — pick another short address.`);
	}
}

async function suggestSlug(db: WattsDb, title: string): Promise<string> {
	let base = normalizeShortLinkSlug(title).slice(0, 40).replace(/-+$/, '');
	if (shortLinkSlugProblem(base)) base = 'link';
	const taken = new Set<string | null>();
	const like = `${base}%`;
	const [current, old] = await Promise.all([
		db.select({ s: ShortLinks.slug }).from(ShortLinks).where(sql`${ShortLinks.slug} like ${like}`),
		db
			.select({ s: PageRedirects.oldSlug })
			.from(PageRedirects)
			.where(and(eq(PageRedirects.type, 'link'), sql`${PageRedirects.oldSlug} like ${like}`)),
	]);
	for (const r of [...current, ...old]) taken.add(r.s);
	return firstFreeSlug(base, taken);
}

function historyValue(v: unknown): string | null {
	if (v == null) return null;
	if (v instanceof Date) return v.toISOString();
	return String(v);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listShortLinks(db: WattsDb) {
	const creator = alias(Members, 'creator');
	const updater = alias(Members, 'updater');
	return db
		.select({
			id: ShortLinks.id,
			slug: ShortLinks.slug,
			targetUrl: ShortLinks.targetUrl,
			title: ShortLinks.title,
			notes: ShortLinks.notes,
			owner: ShortLinks.owner,
			qrScans: ShortLinks.qrScans,
			linkClicks: ShortLinks.linkClicks,
			lastClickedAt: ShortLinks.lastClickedAt,
			active: ShortLinks.active,
			expiresAt: ShortLinks.expiresAt,
			createdByMemberId: ShortLinks.createdByMemberId,
			createdAt: ShortLinks.createdAt,
			updatedAt: ShortLinks.updatedAt,
			createdByName: sql<string | null>`nullif(trim(concat(${creator.firstName}, ' ', ${creator.lastName})), '')`,
			updatedByName: sql<string | null>`nullif(trim(concat(${updater.firstName}, ' ', ${updater.lastName})), '')`,
		})
		.from(ShortLinks)
		.leftJoin(creator, eq(creator.id, ShortLinks.createdByMemberId))
		.leftJoin(updater, eq(updater.id, ShortLinks.updatedByMemberId))
		.orderBy(desc(ShortLinks.active), desc(ShortLinks.createdAt));
}

export async function listShortLinkHistory(db: WattsDb, linkId: string) {
	return db
		.select({
			id: ShortLinkHistory.id,
			field: ShortLinkHistory.field,
			oldValue: ShortLinkHistory.oldValue,
			newValue: ShortLinkHistory.newValue,
			changedAt: ShortLinkHistory.changedAt,
			changedByName: sql<string | null>`nullif(trim(concat(${Members.firstName}, ' ', ${Members.lastName})), '')`,
		})
		.from(ShortLinkHistory)
		.leftJoin(Members, eq(Members.id, ShortLinkHistory.changedByMemberId))
		.where(eq(ShortLinkHistory.linkId, linkId))
		.orderBy(desc(ShortLinkHistory.changedAt));
}

/** Events an officer might want a QR for: anything from the last 30 days on. */
export async function listShortLinkEventOptions(db: WattsDb) {
	const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	return db
		.select({ id: Events.id, number: Events.number, title: Events.title, startTime: Events.startTime })
		.from(Events)
		.where(and(eq(Events.active, true), gt(Events.startTime, since)))
		.orderBy(asc(Events.startTime))
		.limit(100);
}

export async function createShortLink(
	db: WattsDb,
	input: CreateShortLinkInput,
	actor: ShortLinkActor,
	opts: { ownOrigin?: string } = {},
): Promise<{ id: string; slug: string }> {
	const title = checkTitle(input.title);
	const targetUrl = checkTarget(input.targetUrl, opts.ownOrigin);

	let slug: string;
	if (input.slug?.trim()) {
		slug = normalizeShortLinkSlug(input.slug);
		const problem = shortLinkSlugProblem(slug);
		if (problem) throw new DomainError('BAD_REQUEST', problem);
		await assertSlugFree(db, slug);
	} else {
		slug = await suggestSlug(db, title);
	}

	// No transactions: production runs on neon-http. Link first, then its history row.
	const [row] = await db
		.insert(ShortLinks)
		.values({
			slug,
			targetUrl,
			title,
			notes: cleanText(input.notes, 2000),
			owner: cleanText(input.owner, 80),
			expiresAt: input.expiresAt ?? null,
			createdByMemberId: actor.memberId,
			updatedByMemberId: actor.memberId,
		})
		.onConflictDoNothing({ target: ShortLinks.slug })
		// Bare returning(): the WattsDb driver union can't type the partial-select form.
		.returning();
	if (!row) throw new DomainError('CONFLICT', `/go/${slug} is already taken — pick another short address.`);
	await db.insert(ShortLinkHistory).values({
		linkId: row.id,
		field: 'created',
		newValue: targetUrl,
		changedByMemberId: actor.memberId,
	});
	return { id: row.id, slug: row.slug };
}

async function loadEditable(db: WattsDb, id: string, actor: ShortLinkActor): Promise<ShortLinkRow> {
	const [link] = await db.select().from(ShortLinks).where(eq(ShortLinks.id, id)).limit(1);
	if (!link) throw new DomainError('NOT_FOUND', 'Link not found.');
	if (!canEditShortLink(actor, link)) {
		throw new DomainError('FORBIDDEN', 'You can only edit links you created. Ask an officer to change this one.');
	}
	return link;
}

export async function updateShortLink(
	db: WattsDb,
	id: string,
	input: UpdateShortLinkInput,
	actor: ShortLinkActor,
	opts: { ownOrigin?: string } = {},
): Promise<{ id: string; slug: string }> {
	const link = await loadEditable(db, id, actor);
	const next: Partial<typeof ShortLinks.$inferInsert> = {};

	if (input.title !== undefined) next.title = checkTitle(input.title);
	if (input.targetUrl !== undefined) next.targetUrl = checkTarget(input.targetUrl, opts.ownOrigin);
	if (input.notes !== undefined) next.notes = cleanText(input.notes, 2000);
	if (input.owner !== undefined) next.owner = cleanText(input.owner, 80);
	if (input.expiresAt !== undefined) next.expiresAt = input.expiresAt;

	if (input.slug !== undefined && input.slug !== null) {
		const slug = normalizeShortLinkSlug(input.slug);
		if (slug !== link.slug) {
			if (link.qrScans + link.linkClicks > 0) {
				throw new DomainError(
					'FORBIDDEN',
					"This link has already been used, so its short address can't change — printed QR codes would stop working. Make a new link instead.",
				);
			}
			const problem = shortLinkSlugProblem(slug);
			if (problem) throw new DomainError('BAD_REQUEST', problem);
			await assertSlugFree(db, slug, link.id);
			next.slug = slug;
		}
	}

	const tracked = ['title', 'targetUrl', 'slug', 'owner', 'expiresAt', 'notes'] as const;
	const changes = tracked
		.filter((f) => next[f] !== undefined && historyValue(next[f]) !== historyValue(link[f]))
		.map((f) => ({
			linkId: link.id,
			field: f,
			oldValue: historyValue(link[f]),
			newValue: historyValue(next[f]),
			changedByMemberId: actor.memberId,
		}));
	if (changes.length === 0) return { id: link.id, slug: link.slug };

	// No transactions (neon-http). The old address is kept first so it never dangles:
	// a QR may already be printed even with no scans yet.
	if (next.slug && next.slug !== link.slug) await recordRedirect(db, 'link', link.slug, link.id);
	const [row] = await db
		.update(ShortLinks)
		.set({ ...next, updatedByMemberId: actor.memberId })
		.where(eq(ShortLinks.id, link.id))
		.returning();
	await db.insert(ShortLinkHistory).values(changes);
	return { id: link.id, slug: row?.slug ?? link.slug };
}

export async function setShortLinkActive(
	db: WattsDb,
	id: string,
	active: boolean,
	actor: ShortLinkActor,
): Promise<void> {
	const link = await loadEditable(db, id, actor);
	if (link.active === active) return;
	await db
		.update(ShortLinks)
		.set({ active, updatedByMemberId: actor.memberId })
		.where(eq(ShortLinks.id, link.id));
	await db.insert(ShortLinkHistory).values({
		linkId: link.id,
		field: 'active',
		oldValue: String(link.active),
		newValue: String(active),
		changedByMemberId: actor.memberId,
	});
}

// ---------------------------------------------------------------------------
// Public redirect
// ---------------------------------------------------------------------------

const liveWhere = () =>
	and(
		eq(ShortLinks.active, true),
		or(isNull(ShortLinks.expiresAt), gt(ShortLinks.expiresAt, sql`now()`)),
	);

/** Bump the right counter on a live link and return its destination — one query. */
async function countHit(db: WattsDb, where: SQL, source: ShortLinkHitSource): Promise<string | null> {
	const counter =
		source === 'qr'
			? { qrScans: sql`${ShortLinks.qrScans} + 1` }
			: { linkClicks: sql`${ShortLinks.linkClicks} + 1` };
	const [row] = await db
		.update(ShortLinks)
		// updatedAt pinned to itself: a click isn't an edit (the column has $onUpdate).
		.set({ ...counter, lastClickedAt: new Date(), updatedAt: sql`${ShortLinks.updatedAt}` })
		.where(and(where, liveWhere()))
		.returning();
	return row?.targetUrl ?? null;
}

async function resolveRow(db: WattsDb, where: SQL, source: ShortLinkHitSource | null): Promise<ShortLinkResolution | null> {
	if (source) {
		const target = await countHit(db, where, source);
		if (target) return { status: 'ok', targetUrl: target };
	}
	const [row] = await db
		.select({ targetUrl: ShortLinks.targetUrl, title: ShortLinks.title, active: ShortLinks.active, expiresAt: ShortLinks.expiresAt })
		.from(ShortLinks)
		.where(where)
		.limit(1);
	if (!row) return null;
	return isShortLinkLive(row) ? { status: 'ok', targetUrl: row.targetUrl } : { status: 'retired', title: row.title };
}

/**
 * Where /go/<slug> should send someone. `source` = which counter to bump, or null for
 * hits that shouldn't count (bots, link previews). A live link's counted hit is a
 * single UPDATE … RETURNING; renamed slugs fall back to page_redirects.
 */
export async function resolveShortLink(
	db: WattsDb,
	rawSlug: string,
	source: ShortLinkHitSource | null,
): Promise<ShortLinkResolution> {
	const slug = normalizeShortLinkSlug(rawSlug);
	if (!slug) return { status: 'not_found' };
	const direct = await resolveRow(db, eq(ShortLinks.slug, slug), source);
	if (direct) return direct;
	const aliasOf = await findRedirect(db, 'link', slug);
	if (!aliasOf) return { status: 'not_found' };
	return (await resolveRow(db, eq(ShortLinks.id, aliasOf), source)) ?? { status: 'not_found' };
}
