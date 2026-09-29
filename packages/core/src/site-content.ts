// Site-content CMS domain layer: permissions, the revision/review engine, entity
// CRUD, and the public read models. Design: apps/ieeeucfcom/docs/site-content/ARCHITECTURE.md.
//
// Every content edit is a revision. Callers (the tRPC router) validate the payload
// shape, check `canEditScope` / linked-officer rules, and call `submitChange`:
//   - `direct` (the caller has manage_site_content) → applied to the live table and
//     recorded as `published`; the previous published revision becomes `superseded`.
//   - otherwise → recorded as `pending` for the review queue; nothing goes live.
//
// No transactions: the website's Neon HTTP driver has none. Writes are ordered so a
// partial failure leaves the live row and the history consistent enough to retry
// (apply live first, then record the revision).

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import {
	Committees,
	CommitteeMembers,
	ContentRevisions,
	MediaAssets,
	Members,
	OfficerProfiles,
	PageEditors,
	ProjectCategories,
	ProjectMembers,
	Projects,
	SiteMediaSlots,
	Sponsorships,
} from '@watts/db/schema';
import { hasCapability, type CapabilitySubject } from '@watts/permissions';
import { DomainError } from './errors';
import { getSlotDefinition, SITE_MEDIA_SLOTS, type SlotKind } from './site-media-slots';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentScope =
	| { type: 'global' }
	| { type: 'committee'; id: string }
	| { type: 'project'; id: string };

export type ContentEntityType =
	| 'officer_profile'
	| 'sponsor'
	| 'slot'
	| 'committee_page'
	| 'project_page';

/** Who is acting. `userId` is the auth user; `memberId` may be null for a user without a profile. */
export interface ContentActor extends CapabilitySubject {
	userId: string;
	memberId: string | null;
}

/** Build the actor from an auth user id and their resolved roles (null = no member profile). */
export function contentActor(
	userId: string,
	roles: (CapabilitySubject & { memberId?: string | null }) | null,
): ContentActor {
	return {
		userId,
		memberId: roles?.memberId ?? null,
		administrator: roles?.administrator ?? false,
		officerStatus: roles?.officerStatus ?? false,
		permissions: roles?.permissions ?? [],
	};
}

export type OfficerGroup = 'executive' | 'chair';
export type SponsorTier = 'Bronze' | 'Silver' | 'Gold';

export interface OfficerSnapshot {
	memberId: string | null;
	displayName: string;
	roleTitle: string;
	group: OfficerGroup;
	major: string | null;
	yearLabel: string | null;
	bio: string | null;
	linkedinUrl: string | null;
	portraitAssetId: string | null;
	active: boolean;
}

/** The subset a linked officer may change on their own profile. */
export type OfficerSelfFields = Pick<
	OfficerSnapshot,
	'major' | 'yearLabel' | 'bio' | 'linkedinUrl' | 'portraitAssetId'
>;

export interface SponsorSnapshot {
	companyName: string;
	tier: SponsorTier;
	description: string | null;
	websiteUrl: string | null;
	logoAssetId: string | null;
	active: boolean;
}

export interface SlotSnapshot {
	assetId: string | null;
}

export interface CommitteePageSnapshot {
	tagline: string | null;
	about: string;
	applyUrl: string | null;
	heroAssetId: string | null;
	galleryAssetIds: string[];
	published: boolean;
}

export interface ProjectPageSnapshot {
	tagline: string | null;
	overview: string;
	heroAssetId: string | null;
	galleryAssetIds: string[];
	published: boolean;
}

export type ContentSnapshot =
	| OfficerSnapshot
	| SponsorSnapshot
	| SlotSnapshot
	| CommitteePageSnapshot
	| ProjectPageSnapshot;

export interface PublicAsset {
	id: string;
	url: string;
	kind: 'image' | 'animated' | 'document';
	width: number | null;
	height: number | null;
	alt: string | null;
	contentType: string;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Site-wide editors publish straight to the live site; everyone else goes to review. */
export function publishesDirectly(actor: CapabilitySubject | null | undefined): boolean {
	return hasCapability(actor, 'manage_site_content');
}

async function hasActivePageEditorRow(db: WattsDb, memberId: string, scope: ContentScope & { id: string }) {
	const [row] = await db
		.select({ id: PageEditors.id })
		.from(PageEditors)
		.where(
			and(
				eq(PageEditors.memberId, memberId),
				eq(PageEditors.scopeType, scope.type),
				eq(PageEditors.scopeId, scope.id),
				or(isNull(PageEditors.expiresAt), gt(PageEditors.expiresAt, new Date())),
			),
		)
		.limit(1);
	return Boolean(row);
}

export async function isCommitteeChair(db: WattsDb, committeeId: string, memberId: string): Promise<boolean> {
	const [committee] = await db
		.select({ chairId: Committees.chairId })
		.from(Committees)
		.where(eq(Committees.id, committeeId))
		.limit(1);
	if (committee?.chairId === memberId) return true;
	const [row] = await db
		.select({ id: CommitteeMembers.id })
		.from(CommitteeMembers)
		.where(
			and(
				eq(CommitteeMembers.committeeId, committeeId),
				eq(CommitteeMembers.memberId, memberId),
				eq(CommitteeMembers.isChair, true),
			),
		)
		.limit(1);
	return Boolean(row);
}

async function isLeadOf(db: WattsDb, projectId: string, memberId: string): Promise<boolean> {
	const [row] = await db
		.select({ isLead: ProjectMembers.isLead })
		.from(ProjectMembers)
		.where(and(eq(ProjectMembers.projectId, projectId), eq(ProjectMembers.memberId, memberId)))
		.limit(1);
	return row?.isLead ?? false;
}

/**
 * May this actor edit content in `scope`?
 *   - manage_site_content → everything
 *   - committee: its chair, or an unexpired page_editors assignment
 *   - project: a lead, or an unexpired page_editors assignment
 *   - global (page media, officers, sponsors): manage_site_content only
 */
export async function canEditScope(
	db: WattsDb,
	actor: (CapabilitySubject & { memberId?: string | null }) | null | undefined,
	scope: ContentScope,
): Promise<boolean> {
	if (!actor) return false;
	if (publishesDirectly(actor)) return true;
	if (scope.type === 'global' || !actor.memberId) return false;
	if (await hasActivePageEditorRow(db, actor.memberId, scope)) return true;
	return scope.type === 'committee'
		? isCommitteeChair(db, scope.id, actor.memberId)
		: isLeadOf(db, scope.id, actor.memberId);
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function toPublicAsset(a: typeof MediaAssets.$inferSelect): PublicAsset {
	return {
		id: a.id,
		url: a.url,
		kind: a.kind,
		width: a.width,
		height: a.height,
		alt: a.alt,
		contentType: a.contentType,
	};
}

export async function getAssetsByIds(db: WattsDb, ids: string[]): Promise<Map<string, PublicAsset>> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return new Map();
	const rows = await db.select().from(MediaAssets).where(inArray(MediaAssets.id, unique));
	return new Map(rows.map((r) => [r.id, toPublicAsset(r)]));
}

interface AssetRule {
	kinds: SlotKind[];
	/** Staff may attach any asset; others only assets in this scope (or that they uploaded). */
	scope: ContentScope;
}

/**
 * Every referenced asset must exist and be the right kind. Non-staff may only attach
 * assets from their own page's scope, or assets they uploaded themselves — so a
 * delegated editor can't pull arbitrary files onto a page.
 */
async function assertAssetsUsable(db: WattsDb, ids: (string | null)[], rule: AssetRule, actor: ContentActor) {
	const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
	if (wanted.length === 0) return;
	const rows = await db.select().from(MediaAssets).where(inArray(MediaAssets.id, wanted));
	if (rows.length !== wanted.length) throw new DomainError('BAD_REQUEST', 'A referenced file does not exist');
	const staff = publishesDirectly(actor);
	for (const a of rows) {
		if (!rule.kinds.includes(a.kind)) {
			throw new DomainError('BAD_REQUEST', `That file is a ${a.kind}, expected ${rule.kinds.join(' or ')}`);
		}
		if (staff) continue;
		const sameScope =
			rule.scope.type === 'global'
				? a.scopeType === 'global'
				: a.scopeType === rule.scope.type && a.scopeId === rule.scope.id;
		if (!sameScope && a.uploadedByUserId !== actor.userId) {
			throw new DomainError('FORBIDDEN', 'You can only use files uploaded for this page');
		}
	}
}

// ---------------------------------------------------------------------------
// Live-row readers + appliers (one pair per entity type)
// ---------------------------------------------------------------------------

async function readOfficer(db: WattsDb, id: string): Promise<OfficerSnapshot> {
	const [r] = await db.select().from(OfficerProfiles).where(eq(OfficerProfiles.id, id)).limit(1);
	if (!r) throw new DomainError('NOT_FOUND', 'Officer profile not found');
	return {
		memberId: r.memberId,
		displayName: r.displayName,
		roleTitle: r.roleTitle,
		group: r.group,
		major: r.major,
		yearLabel: r.yearLabel,
		bio: r.bio,
		linkedinUrl: r.linkedinUrl,
		portraitAssetId: r.portraitAssetId,
		active: r.active,
	};
}

async function readSponsor(db: WattsDb, id: string): Promise<SponsorSnapshot> {
	const [r] = await db.select().from(Sponsorships).where(eq(Sponsorships.id, id)).limit(1);
	if (!r) throw new DomainError('NOT_FOUND', 'Sponsor not found');
	return {
		companyName: r.companyName,
		tier: r.tier,
		description: r.description,
		websiteUrl: r.websiteUrl,
		logoAssetId: r.logoAssetId,
		active: r.active,
	};
}

async function readSlot(db: WattsDb, key: string): Promise<SlotSnapshot> {
	if (!getSlotDefinition(key)) throw new DomainError('NOT_FOUND', `Unknown slot ${key}`);
	const [r] = await db.select().from(SiteMediaSlots).where(eq(SiteMediaSlots.slotKey, key)).limit(1);
	return { assetId: r?.assetId ?? null };
}

function committeeSnapshotOf(r: typeof Committees.$inferSelect): CommitteePageSnapshot {
	return {
		tagline: r.tagline,
		about: r.about,
		applyUrl: r.applyUrl,
		heroAssetId: r.heroAssetId,
		galleryAssetIds: r.galleryAssetIds ?? [],
		published: r.published,
	};
}

function projectSnapshotOf(r: typeof Projects.$inferSelect): ProjectPageSnapshot {
	return {
		tagline: r.tagline,
		overview: r.overview,
		heroAssetId: r.heroAssetId,
		galleryAssetIds: r.galleryAssetIds ?? [],
		published: r.published,
	};
}

async function readCommitteePage(db: WattsDb, id: string): Promise<CommitteePageSnapshot> {
	const [r] = await db.select().from(Committees).where(eq(Committees.id, id)).limit(1);
	if (!r) throw new DomainError('NOT_FOUND', 'Committee not found');
	return committeeSnapshotOf(r);
}

async function readProjectPage(db: WattsDb, id: string): Promise<ProjectPageSnapshot> {
	const [r] = await db.select().from(Projects).where(eq(Projects.id, id)).limit(1);
	if (!r) throw new DomainError('NOT_FOUND', 'Project not found');
	return projectSnapshotOf(r);
}

export function readCurrent(db: WattsDb, type: ContentEntityType, id: string): Promise<ContentSnapshot> {
	switch (type) {
		case 'officer_profile':
			return readOfficer(db, id);
		case 'sponsor':
			return readSponsor(db, id);
		case 'slot':
			return readSlot(db, id);
		case 'committee_page':
			return readCommitteePage(db, id);
		case 'project_page':
			return readProjectPage(db, id);
	}
}

async function applySnapshot(
	db: WattsDb,
	type: ContentEntityType,
	id: string,
	snap: ContentSnapshot,
	actor: ContentActor,
): Promise<void> {
	const now = new Date();
	switch (type) {
		case 'officer_profile': {
			const s = snap as OfficerSnapshot;
			await db
				.update(OfficerProfiles)
				.set({ ...s, updatedAt: now })
				.where(eq(OfficerProfiles.id, id));
			return;
		}
		case 'sponsor': {
			const s = snap as SponsorSnapshot;
			await db
				.update(Sponsorships)
				.set({ ...s, updatedAt: now })
				.where(eq(Sponsorships.id, id));
			return;
		}
		case 'slot': {
			const s = snap as SlotSnapshot;
			await db
				.insert(SiteMediaSlots)
				.values({ slotKey: id, assetId: s.assetId, updatedByUserId: actor.userId })
				.onConflictDoUpdate({
					target: SiteMediaSlots.slotKey,
					set: { assetId: s.assetId, updatedByUserId: actor.userId, updatedAt: now },
				});
			return;
		}
		case 'committee_page': {
			const s = snap as CommitteePageSnapshot;
			await db
				.update(Committees)
				.set({ ...s, updatedAt: now })
				.where(eq(Committees.id, id));
			return;
		}
		case 'project_page': {
			const s = snap as ProjectPageSnapshot;
			await db
				.update(Projects)
				.set({ ...s, updatedAt: now })
				.where(eq(Projects.id, id));
			return;
		}
	}
}

/** Kind + scope rules for the files an entity snapshot references. */
async function validateSnapshotAssets(
	db: WattsDb,
	type: ContentEntityType,
	id: string,
	snap: ContentSnapshot,
	actor: ContentActor,
) {
	switch (type) {
		case 'officer_profile': {
			const s = snap as OfficerSnapshot;
			return assertAssetsUsable(db, [s.portraitAssetId], { kinds: ['image'], scope: { type: 'global' } }, actor);
		}
		case 'sponsor': {
			const s = snap as SponsorSnapshot;
			return assertAssetsUsable(db, [s.logoAssetId], { kinds: ['image'], scope: { type: 'global' } }, actor);
		}
		case 'slot': {
			const def = getSlotDefinition(id);
			if (!def) throw new DomainError('NOT_FOUND', `Unknown slot ${id}`);
			const s = snap as SlotSnapshot;
			// An animated slot may also hold a still image (e.g. to stop the motion).
			const kinds: SlotKind[] = def.kind === 'animated' ? ['animated', 'image'] : [def.kind];
			return assertAssetsUsable(db, [s.assetId], { kinds, scope: { type: 'global' } }, actor);
		}
		case 'committee_page':
		case 'project_page': {
			const s = snap as CommitteePageSnapshot | ProjectPageSnapshot;
			const scope: ContentScope = { type: type === 'committee_page' ? 'committee' : 'project', id };
			return assertAssetsUsable(
				db,
				[s.heroAssetId, ...s.galleryAssetIds],
				{ kinds: ['image', 'animated'], scope },
				actor,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Revision engine
// ---------------------------------------------------------------------------

export interface SubmitChangeInput {
	entityType: ContentEntityType;
	entityId: string;
	snapshot: ContentSnapshot;
	actor: ContentActor;
	/** true → publish now (caller verified manage_site_content); false → review queue. */
	direct: boolean;
}

export interface SubmitChangeResult {
	revisionId: string;
	status: 'published' | 'pending';
}

async function supersedePublished(db: WattsDb, type: ContentEntityType, id: string, keep: string) {
	const rows = await db
		.select({ id: ContentRevisions.id })
		.from(ContentRevisions)
		.where(
			and(
				eq(ContentRevisions.entityType, type),
				eq(ContentRevisions.entityId, id),
				eq(ContentRevisions.status, 'published'),
			),
		);
	const stale = rows.map((r) => r.id).filter((rid) => rid !== keep);
	if (stale.length > 0) {
		await db
			.update(ContentRevisions)
			.set({ status: 'superseded' })
			.where(inArray(ContentRevisions.id, stale));
	}
}

/**
 * Rows that existed before the CMS (or before their first edit) have no history, so
 * the first change would overwrite them with nothing to restore. Before that first
 * change, record the live state as a superseded "original" revision.
 */
async function recordBaseline(db: WattsDb, type: ContentEntityType, id: string) {
	const [seen] = await db
		.select({ id: ContentRevisions.id })
		.from(ContentRevisions)
		.where(
			and(
				eq(ContentRevisions.entityType, type),
				eq(ContentRevisions.entityId, id),
				inArray(ContentRevisions.status, ['published', 'superseded']),
			),
		)
		.limit(1);
	if (seen) return;
	await db.insert(ContentRevisions).values({
		entityType: type,
		entityId: id,
		snapshot: await readCurrent(db, type, id),
		status: 'superseded',
		reviewNote: 'Original content, recorded before the first CMS change',
	});
}

async function publish(
	db: WattsDb,
	type: ContentEntityType,
	id: string,
	snap: ContentSnapshot,
	actor: ContentActor,
	opts: { baseline?: boolean } = {},
): Promise<string> {
	// Rows created through the CMS start with this revision, so they need no baseline.
	if (opts.baseline !== false) await recordBaseline(db, type, id);
	await applySnapshot(db, type, id, snap, actor);
	const [rev] = await db
		.insert(ContentRevisions)
		.values({
			entityType: type,
			entityId: id,
			snapshot: snap,
			status: 'published',
			authorMemberId: actor.memberId,
			reviewerMemberId: actor.memberId,
			reviewedAt: new Date(),
		})
		.returning();
	await supersedePublished(db, type, id, rev.id);
	return rev.id;
}

export async function submitChange(db: WattsDb, input: SubmitChangeInput): Promise<SubmitChangeResult> {
	const { entityType, entityId, snapshot, actor } = input;
	await readCurrent(db, entityType, entityId); // existence check (NOT_FOUND)
	await validateSnapshotAssets(db, entityType, entityId, snapshot, actor);

	if (input.direct) {
		return { revisionId: await publish(db, entityType, entityId, snapshot, actor), status: 'published' };
	}

	if (!actor.memberId) throw new DomainError('FORBIDDEN', 'A member profile is required to submit changes');
	// One open submission per entity per author — a new one replaces the old.
	await db
		.update(ContentRevisions)
		.set({ status: 'superseded' })
		.where(
			and(
				eq(ContentRevisions.entityType, entityType),
				eq(ContentRevisions.entityId, entityId),
				eq(ContentRevisions.authorMemberId, actor.memberId),
				eq(ContentRevisions.status, 'pending'),
			),
		);
	const [rev] = await db
		.insert(ContentRevisions)
		.values({ entityType, entityId, snapshot, status: 'pending', authorMemberId: actor.memberId })
		.returning();
	return { revisionId: rev.id, status: 'pending' };
}

async function getRevision(db: WattsDb, revisionId: string) {
	const [rev] = await db.select().from(ContentRevisions).where(eq(ContentRevisions.id, revisionId)).limit(1);
	if (!rev) throw new DomainError('NOT_FOUND', 'Revision not found');
	return rev;
}

/** Reviewer approves a pending revision: it goes live exactly as submitted. */
export async function approveRevision(db: WattsDb, revisionId: string, reviewer: ContentActor, note?: string | null) {
	const rev = await getRevision(db, revisionId);
	if (rev.status !== 'pending') throw new DomainError('CONFLICT', `This change is already ${rev.status}`);
	const type = rev.entityType as ContentEntityType;
	// File/scope rules were enforced against the author when they submitted.
	await readCurrent(db, type, rev.entityId);
	await recordBaseline(db, type, rev.entityId);
	await applySnapshot(db, type, rev.entityId, rev.snapshot as ContentSnapshot, reviewer);
	await db
		.update(ContentRevisions)
		.set({ status: 'published', reviewerMemberId: reviewer.memberId, reviewNote: note ?? null, reviewedAt: new Date() })
		.where(eq(ContentRevisions.id, revisionId));
	await supersedePublished(db, type, rev.entityId, revisionId);
	return { entityType: type, entityId: rev.entityId };
}

export async function rejectRevision(db: WattsDb, revisionId: string, reviewer: ContentActor, note?: string | null) {
	const rev = await getRevision(db, revisionId);
	if (rev.status !== 'pending') throw new DomainError('CONFLICT', `This change is already ${rev.status}`);
	await db
		.update(ContentRevisions)
		.set({ status: 'rejected', reviewerMemberId: reviewer.memberId, reviewNote: note ?? null, reviewedAt: new Date() })
		.where(eq(ContentRevisions.id, revisionId));
	return { entityType: rev.entityType as ContentEntityType, entityId: rev.entityId };
}

/** Put an old version back live, as a NEW published revision (history is never rewritten). */
export async function restoreRevision(db: WattsDb, revisionId: string, actor: ContentActor) {
	const rev = await getRevision(db, revisionId);
	if (rev.status === 'pending') throw new DomainError('BAD_REQUEST', 'Approve or reject a pending change instead');
	const type = rev.entityType as ContentEntityType;
	await readCurrent(db, type, rev.entityId);
	const id = await publish(db, type, rev.entityId, rev.snapshot as ContentSnapshot, actor);
	return { revisionId: id, entityType: type, entityId: rev.entityId };
}

const revisionColumns = {
	id: ContentRevisions.id,
	entityType: ContentRevisions.entityType,
	entityId: ContentRevisions.entityId,
	snapshot: ContentRevisions.snapshot,
	status: ContentRevisions.status,
	reviewNote: ContentRevisions.reviewNote,
	createdAt: ContentRevisions.createdAt,
	reviewedAt: ContentRevisions.reviewedAt,
	authorMemberId: ContentRevisions.authorMemberId,
	authorFirstName: Members.firstName,
	authorLastName: Members.lastName,
};

export async function listRevisionHistory(db: WattsDb, entityType: ContentEntityType, entityId: string) {
	const items = await db
		.select(revisionColumns)
		.from(ContentRevisions)
		.leftJoin(Members, eq(Members.id, ContentRevisions.authorMemberId))
		.where(and(eq(ContentRevisions.entityType, entityType), eq(ContentRevisions.entityId, entityId)))
		.orderBy(desc(ContentRevisions.createdAt))
		.limit(50);
	const assets = await getAssetsByIds(db, items.flatMap((i) => referencedAssetIds(i.snapshot)));
	return { items, assets: Object.fromEntries(assets) };
}

/** The review queue, each item paired with what's live now so the UI can diff. */
export async function listPendingRevisions(db: WattsDb) {
	const rows = await db
		.select(revisionColumns)
		.from(ContentRevisions)
		.leftJoin(Members, eq(Members.id, ContentRevisions.authorMemberId))
		.where(eq(ContentRevisions.status, 'pending'))
		.orderBy(asc(ContentRevisions.createdAt));
	const items = await Promise.all(
		rows.map(async (r) => ({
			...r,
			current: await readCurrent(db, r.entityType as ContentEntityType, r.entityId).catch(() => null),
			label: await entityLabel(db, r.entityType as ContentEntityType, r.entityId),
			previewPath: await pagePreviewPath(db, r.entityType as ContentEntityType, r.entityId, r.id),
		})),
	);
	// Files referenced by either side, so reviewers see the actual images.
	const assets = await getAssetsByIds(
		db,
		items.flatMap((i) => [...referencedAssetIds(i.snapshot), ...referencedAssetIds(i.current)]),
	);
	return { items, assets: Object.fromEntries(assets) };
}

/** Asset ids in a snapshot (any `…AssetId` / `…AssetIds` field). */
export function referencedAssetIds(snapshot: unknown): string[] {
	if (!snapshot || typeof snapshot !== 'object') return [];
	const out: string[] = [];
	for (const [k, v] of Object.entries(snapshot)) {
		if (k.endsWith('AssetId') && typeof v === 'string') out.push(v);
		if (k.endsWith('AssetIds') && Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'));
	}
	return out;
}

/** An author's own submissions that are still pending or were recently reviewed. */
export function listMyRevisions(db: WattsDb, memberId: string) {
	return db
		.select(revisionColumns)
		.from(ContentRevisions)
		.leftJoin(Members, eq(Members.id, ContentRevisions.authorMemberId))
		.where(
			and(
				eq(ContentRevisions.authorMemberId, memberId),
				inArray(ContentRevisions.status, ['pending', 'rejected', 'published']),
			),
		)
		.orderBy(desc(ContentRevisions.createdAt))
		.limit(20);
}

async function entityLabel(db: WattsDb, type: ContentEntityType, id: string): Promise<string> {
	try {
		switch (type) {
			case 'officer_profile':
				return `Officer: ${(await readOfficer(db, id)).displayName}`;
			case 'sponsor':
				return `Sponsor: ${(await readSponsor(db, id)).companyName}`;
			case 'slot':
				return `Page media: ${getSlotDefinition(id)?.label ?? id}`;
			case 'committee_page': {
				const [c] = await db.select({ t: Committees.title }).from(Committees).where(eq(Committees.id, id)).limit(1);
				return `Committee page: ${c?.t ?? id}`;
			}
			case 'project_page': {
				const [p] = await db.select({ t: Projects.title }).from(Projects).where(eq(Projects.id, id)).limit(1);
				return `Project page: ${p?.t ?? id}`;
			}
		}
	} catch {
		return `${type}: ${id}`;
	}
}

// ---------------------------------------------------------------------------
// Officers
// ---------------------------------------------------------------------------

export async function listOfficerProfilesForAdmin(db: WattsDb) {
	const rows = await db
		.select({ profile: OfficerProfiles, memberFirstName: Members.firstName, memberLastName: Members.lastName })
		.from(OfficerProfiles)
		.leftJoin(Members, eq(Members.id, OfficerProfiles.memberId))
		.orderBy(desc(OfficerProfiles.active), asc(OfficerProfiles.group), asc(OfficerProfiles.sortOrder));
	const assets = await getAssetsByIds(db, rows.map((r) => r.profile.portraitAssetId ?? ''));
	return rows.map((r) => ({
		...r.profile,
		linkedMemberName: r.memberFirstName ? `${r.memberFirstName} ${r.memberLastName}` : null,
		portrait: r.profile.portraitAssetId ? (assets.get(r.profile.portraitAssetId) ?? null) : null,
	}));
}

/** Staff only. Creates the row and its first (published) revision. */
export async function createOfficerProfile(db: WattsDb, snap: OfficerSnapshot, actor: ContentActor) {
	await validateSnapshotAssets(db, 'officer_profile', '', snap, actor);
	const [last] = await db
		.select({ sortOrder: OfficerProfiles.sortOrder })
		.from(OfficerProfiles)
		.orderBy(desc(OfficerProfiles.sortOrder))
		.limit(1);
	const [row] = await db
		.insert(OfficerProfiles)
		.values({ ...snap, sortOrder: (last?.sortOrder ?? 0) + 1 })
		.returning();
	await publish(db, 'officer_profile', row.id, snap, actor, { baseline: false });
	return { id: row.id };
}

export async function deleteOfficerProfile(db: WattsDb, id: string) {
	await db.delete(OfficerProfiles).where(eq(OfficerProfiles.id, id));
}

/** Display order is layout, not content — not versioned. */
export async function reorderOfficerProfiles(db: WattsDb, orderedIds: string[]) {
	for (const [i, id] of orderedIds.entries()) {
		await db.update(OfficerProfiles).set({ sortOrder: i }).where(eq(OfficerProfiles.id, id));
	}
}

export async function getOfficerProfileForMember(db: WattsDb, memberId: string) {
	const [row] = await db.select().from(OfficerProfiles).where(eq(OfficerProfiles.memberId, memberId)).limit(1);
	if (!row) return null;
	const assets = await getAssetsByIds(db, [row.portraitAssetId ?? '']);
	return { ...row, portrait: row.portraitAssetId ? (assets.get(row.portraitAssetId) ?? null) : null };
}

/** A linked officer's own edit: merge their allowed fields over the live profile. */
export async function buildOfficerSelfSnapshot(
	db: WattsDb,
	profileId: string,
	fields: OfficerSelfFields,
): Promise<OfficerSnapshot> {
	const current = await readOfficer(db, profileId);
	return { ...current, ...fields };
}

// ---------------------------------------------------------------------------
// Sponsors
// ---------------------------------------------------------------------------

export async function listSponsorsForAdmin(db: WattsDb) {
	const rows = await db
		.select()
		.from(Sponsorships)
		.orderBy(desc(Sponsorships.active), asc(Sponsorships.sortOrder), asc(Sponsorships.companyName));
	const assets = await getAssetsByIds(db, rows.map((r) => r.logoAssetId ?? ''));
	return rows.map((r) => ({ ...r, logo: r.logoAssetId ? (assets.get(r.logoAssetId) ?? null) : null }));
}

export async function createSponsor(db: WattsDb, snap: SponsorSnapshot, actor: ContentActor) {
	await validateSnapshotAssets(db, 'sponsor', '', snap, actor);
	const [last] = await db
		.select({ sortOrder: Sponsorships.sortOrder })
		.from(Sponsorships)
		.orderBy(desc(Sponsorships.sortOrder))
		.limit(1);
	const [row] = await db
		.insert(Sponsorships)
		.values({ ...snap, sortOrder: (last?.sortOrder ?? 0) + 1 })
		.returning();
	await publish(db, 'sponsor', row.id, snap, actor, { baseline: false });
	return { id: row.id };
}

export async function deleteSponsor(db: WattsDb, id: string) {
	await db.delete(Sponsorships).where(eq(Sponsorships.id, id));
}

export async function reorderSponsors(db: WattsDb, orderedIds: string[]) {
	for (const [i, id] of orderedIds.entries()) {
		await db.update(Sponsorships).set({ sortOrder: i }).where(eq(Sponsorships.id, id));
	}
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export async function listSlotsForAdmin(db: WattsDb) {
	const rows = await db.select().from(SiteMediaSlots);
	const byKey = new Map(rows.map((r) => [r.slotKey, r]));
	const assets = await getAssetsByIds(db, rows.map((r) => r.assetId ?? ''));
	return SITE_MEDIA_SLOTS.map((def) => {
		const row = byKey.get(def.key);
		return {
			...def,
			asset: row?.assetId ? (assets.get(row.assetId) ?? null) : null,
			updatedAt: row?.updatedAt ?? null,
		};
	});
}

// ---------------------------------------------------------------------------
// Page editors (explicit per-page assignments)
// ---------------------------------------------------------------------------

export async function listPageEditors(db: WattsDb) {
	const rows = await db
		.select({
			id: PageEditors.id,
			scopeType: PageEditors.scopeType,
			scopeId: PageEditors.scopeId,
			memberId: PageEditors.memberId,
			expiresAt: PageEditors.expiresAt,
			createdAt: PageEditors.createdAt,
			firstName: Members.firstName,
			lastName: Members.lastName,
		})
		.from(PageEditors)
		.innerJoin(Members, eq(Members.id, PageEditors.memberId))
		.orderBy(desc(PageEditors.createdAt));
	const committeeIds = rows.filter((r) => r.scopeType === 'committee').map((r) => r.scopeId);
	const projectIds = rows.filter((r) => r.scopeType === 'project').map((r) => r.scopeId);
	const committees = committeeIds.length
		? await db.select({ id: Committees.id, title: Committees.title }).from(Committees).where(inArray(Committees.id, committeeIds))
		: [];
	const projects = projectIds.length
		? await db.select({ id: Projects.id, title: Projects.title }).from(Projects).where(inArray(Projects.id, projectIds))
		: [];
	const titles = new Map([...committees, ...projects].map((x) => [x.id, x.title]));
	return rows.map((r) => ({ ...r, scopeTitle: titles.get(r.scopeId) ?? '(deleted)' }));
}

export async function assignPageEditor(
	db: WattsDb,
	input: { scope: ContentScope & { id: string }; memberId: string; expiresAt: Date | null; grantedByMemberId: string | null },
) {
	const exists =
		input.scope.type === 'committee'
			? await db.select({ id: Committees.id }).from(Committees).where(eq(Committees.id, input.scope.id)).limit(1)
			: await db.select({ id: Projects.id }).from(Projects).where(eq(Projects.id, input.scope.id)).limit(1);
	if (exists.length === 0) throw new DomainError('NOT_FOUND', `That ${input.scope.type} does not exist`);
	await db
		.insert(PageEditors)
		.values({
			scopeType: input.scope.type,
			scopeId: input.scope.id,
			memberId: input.memberId,
			expiresAt: input.expiresAt,
			grantedByMemberId: input.grantedByMemberId,
		})
		.onConflictDoUpdate({
			target: [PageEditors.scopeType, PageEditors.scopeId, PageEditors.memberId],
			set: { expiresAt: input.expiresAt, grantedByMemberId: input.grantedByMemberId },
		});
}

export async function revokePageEditor(db: WattsDb, id: string) {
	await db.delete(PageEditors).where(eq(PageEditors.id, id));
}

// ---------------------------------------------------------------------------
// Committee / project pages
// ---------------------------------------------------------------------------

export interface EditablePage {
	type: 'committee' | 'project';
	id: string;
	slug: string | null;
	title: string;
	published: boolean;
	/** Why this member may edit it. */
	via: 'staff' | 'chair' | 'lead' | 'assigned';
}

/** Pages the actor can edit: all of them for staff; otherwise chair/lead/assigned. */
export async function listEditablePages(
	db: WattsDb,
	actor: (CapabilitySubject & { memberId?: string | null }) | null,
): Promise<EditablePage[]> {
	if (!actor) return [];
	const committees = await db
		.select({ id: Committees.id, slug: Committees.slug, title: Committees.title, published: Committees.published, chairId: Committees.chairId })
		.from(Committees)
		.where(eq(Committees.active, true));
	const projects = await db
		.select({ id: Projects.id, slug: Projects.slug, title: Projects.title, published: Projects.published })
		.from(Projects)
		.where(eq(Projects.active, true));

	if (publishesDirectly(actor)) {
		return [
			...committees.map((c) => ({ type: 'committee' as const, id: c.id, slug: c.slug, title: c.title, published: c.published, via: 'staff' as const })),
			...projects.map((p) => ({ type: 'project' as const, id: p.id, slug: p.slug, title: p.title, published: p.published, via: 'staff' as const })),
		];
	}
	const memberId = actor.memberId;
	if (!memberId) return [];

	const [chairRows, leadRows, assigned] = await Promise.all([
		db
			.select({ committeeId: CommitteeMembers.committeeId })
			.from(CommitteeMembers)
			.where(and(eq(CommitteeMembers.memberId, memberId), eq(CommitteeMembers.isChair, true))),
		db
			.select({ projectId: ProjectMembers.projectId })
			.from(ProjectMembers)
			.where(and(eq(ProjectMembers.memberId, memberId), eq(ProjectMembers.isLead, true))),
		db
			.select({ scopeType: PageEditors.scopeType, scopeId: PageEditors.scopeId })
			.from(PageEditors)
			.where(and(eq(PageEditors.memberId, memberId), or(isNull(PageEditors.expiresAt), gt(PageEditors.expiresAt, new Date())))),
	]);
	const chairOf = new Set([...chairRows.map((r) => r.committeeId), ...committees.filter((c) => c.chairId === memberId).map((c) => c.id)]);
	const leadOf = new Set(leadRows.map((r) => r.projectId));
	const assignedIds = new Set(assigned.map((a) => `${a.scopeType}:${a.scopeId}`));

	const out: EditablePage[] = [];
	for (const c of committees) {
		const via = chairOf.has(c.id) ? 'chair' : assignedIds.has(`committee:${c.id}`) ? 'assigned' : null;
		if (via) out.push({ type: 'committee', id: c.id, slug: c.slug, title: c.title, published: c.published, via });
	}
	for (const p of projects) {
		const via = leadOf.has(p.id) ? 'lead' : assignedIds.has(`project:${p.id}`) ? 'assigned' : null;
		if (via) out.push({ type: 'project', id: p.id, slug: p.slug, title: p.title, published: p.published, via });
	}
	return out;
}

/** Resolve a page by type + slug for the editor (published or not). */
export async function getPageForEdit(db: WattsDb, type: 'committee' | 'project', slug: string) {
	if (type === 'committee') {
		const [c] = await db.select().from(Committees).where(eq(Committees.slug, slug)).limit(1);
		if (!c) throw new DomainError('NOT_FOUND', 'Committee not found');
		const snap = await readCommitteePage(db, c.id);
		const assets = await getAssetsByIds(db, [snap.heroAssetId ?? '', ...snap.galleryAssetIds]);
		return { type, id: c.id, slug, title: c.title, snapshot: snap as CommitteePageSnapshot | ProjectPageSnapshot, assets: [...assets.values()] };
	}
	const [p] = await db.select().from(Projects).where(eq(Projects.slug, slug)).limit(1);
	if (!p) throw new DomainError('NOT_FOUND', 'Project not found');
	const snap = await readProjectPage(db, p.id);
	const assets = await getAssetsByIds(db, [snap.heroAssetId ?? '', ...snap.galleryAssetIds]);
	return { type, id: p.id, slug, title: p.title, snapshot: snap as CommitteePageSnapshot | ProjectPageSnapshot, assets: [...assets.values()] };
}

// ---------------------------------------------------------------------------
// Public read models (rendered by static pages, cached + tag-revalidated)
// ---------------------------------------------------------------------------

export interface PublicOfficer {
	id: string;
	displayName: string;
	roleTitle: string;
	group: OfficerGroup;
	major: string | null;
	yearLabel: string | null;
	bio: string | null;
	linkedinUrl: string | null;
	portrait: PublicAsset | null;
}

export interface PublicSponsor {
	id: string;
	companyName: string;
	tier: SponsorTier;
	websiteUrl: string | null;
	logo: PublicAsset | null;
}

export interface PublicSiteContent {
	/** Only slots with an uploaded asset; missing keys render their code default. */
	slots: Record<string, PublicAsset>;
	/** Empty ⇒ the page keeps its code roster (nothing imported yet). */
	officers: PublicOfficer[];
	/** Active sponsors that have a CMS logo. Empty ⇒ the page keeps its code list. */
	sponsors: PublicSponsor[];
}

export async function getPublicSiteContent(db: WattsDb): Promise<PublicSiteContent> {
	const [slotRows, officerRows, sponsorRows] = await Promise.all([
		db.select().from(SiteMediaSlots),
		db
			.select()
			.from(OfficerProfiles)
			.where(eq(OfficerProfiles.active, true))
			.orderBy(asc(OfficerProfiles.group), asc(OfficerProfiles.sortOrder)),
		// Only sponsors with a CMS logo: the pre-existing `sponsorships` table may hold
		// old rows that were never shown on the site, and must not appear by surprise.
		db
			.select()
			.from(Sponsorships)
			.where(and(eq(Sponsorships.active, true), isNotNull(Sponsorships.logoAssetId)))
			.orderBy(asc(Sponsorships.sortOrder), asc(Sponsorships.companyName)),
	]);
	const assets = await getAssetsByIds(db, [
		...slotRows.map((r) => r.assetId ?? ''),
		...officerRows.map((r) => r.portraitAssetId ?? ''),
		...sponsorRows.map((r) => r.logoAssetId ?? ''),
	]);
	const slots: Record<string, PublicAsset> = {};
	for (const r of slotRows) {
		const a = r.assetId ? assets.get(r.assetId) : undefined;
		if (a && getSlotDefinition(r.slotKey)) slots[r.slotKey] = a;
	}
	return {
		slots,
		officers: officerRows.map((o) => ({
			id: o.id,
			displayName: o.displayName,
			roleTitle: o.roleTitle,
			group: o.group,
			major: o.major,
			yearLabel: o.yearLabel,
			bio: o.bio,
			linkedinUrl: o.linkedinUrl,
			portrait: o.portraitAssetId ? (assets.get(o.portraitAssetId) ?? null) : null,
		})),
		sponsors: sponsorRows.map((s) => ({
			id: s.id,
			companyName: s.companyName,
			tier: s.tier,
			websiteUrl: s.websiteUrl,
			logo: s.logoAssetId ? (assets.get(s.logoAssetId) ?? null) : null,
		})),
	};
}

export interface PublicContentPage {
	type: 'committee' | 'project';
	id: string;
	slug: string;
	title: string;
	tagline: string | null;
	body: string;
	leadNames: string[];
	applyUrl: string | null;
	hero: PublicAsset | null;
	gallery: PublicAsset[];
	/** Project pages: legacy `photo_urls` shown when no gallery has been curated yet. */
	legacyPhotoUrls: string[];
	/** Facts filled in from the project record (null on committee pages). */
	project: PublicProjectFacts | null;
}

/** A person shown on a public page: name, portrait and a short "Major · '27" line. */
export interface PublicPerson {
	id: string;
	name: string;
	initials: string;
	portraitUrl: string | null;
	detail: string | null;
	isLead: boolean;
}

export interface PublicProjectFacts {
	status: 'current' | 'past';
	category: string | null;
	skills: string[];
	hardware: string[];
	software: string[];
	/** Leads first, then everyone else by name. */
	team: PublicPerson[];
}

/** "Python, C++ ,, ROS" → ["Python", "C++", "ROS"]. The tag fields are comma-separated text. */
export function splitTags(value: string | null | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}

function toPublicPerson(m: {
	id: string;
	first: string;
	last: string;
	portraitUrl: string | null;
	major: string;
	graduationYear: number;
	isLead: boolean;
}): PublicPerson {
	// Majors are stored as catalog names, e.g. "Computer Engineering (BS)".
	const major = m.major.replace(/\s*\([^)]*\)\s*$/, '');
	return {
		id: m.id,
		name: `${m.first} ${m.last}`.trim(),
		initials: `${m.first.charAt(0)}${m.last.charAt(0)}`.toUpperCase(),
		portraitUrl: m.portraitUrl,
		detail: `${major} · '${String(m.graduationYear).slice(-2)}`,
		isLead: m.isLead,
	};
}

/** Render model for a committee page from `snap` (live fields or a revision snapshot). */
async function buildCommitteePage(
	db: WattsDb,
	k: typeof Committees.$inferSelect,
	snap: CommitteePageSnapshot,
): Promise<PublicContentPage> {
	const [chair] = k.chairId
		? await db
			.select({ first: Members.firstName, last: Members.lastName })
			.from(Members)
			.where(eq(Members.id, k.chairId))
			.limit(1)
		: [];
	const assets = await getAssetsByIds(db, [snap.heroAssetId ?? '', ...snap.galleryAssetIds]);
	return {
		type: 'committee',
		id: k.id,
		slug: k.slug ?? '',
		title: k.title,
		tagline: snap.tagline,
		body: snap.about,
		leadNames: chair ? [`${chair.first} ${chair.last}`] : [],
		applyUrl: snap.applyUrl,
		hero: snap.heroAssetId ? (assets.get(snap.heroAssetId) ?? null) : null,
		gallery: snap.galleryAssetIds.map((id) => assets.get(id)).filter((a): a is PublicAsset => Boolean(a)),
		legacyPhotoUrls: [],
		project: null,
	};
}

/** Render model for a project page from `snap` (live fields or a revision snapshot). */
async function buildProjectPage(
	db: WattsDb,
	p: typeof Projects.$inferSelect,
	snap: ProjectPageSnapshot,
): Promise<PublicContentPage> {
	const members = await db
		.select({
			id: Members.id,
			first: Members.firstName,
			last: Members.lastName,
			portraitUrl: Members.portraitUrl,
			major: Members.major,
			graduationYear: Members.graduationYear,
			isLead: ProjectMembers.isLead,
		})
		.from(ProjectMembers)
		.innerJoin(Members, eq(Members.id, ProjectMembers.memberId))
		.where(and(eq(ProjectMembers.projectId, p.id), eq(Members.active, true)))
		.orderBy(desc(ProjectMembers.isLead), asc(Members.firstName), asc(Members.lastName));
	const leads = members.filter((m) => m.isLead);
	const [category] = p.categoryId
		? await db
			.select({ name: ProjectCategories.name })
			.from(ProjectCategories)
			.where(eq(ProjectCategories.id, p.categoryId))
			.limit(1)
		: [];
	const assets = await getAssetsByIds(db, [snap.heroAssetId ?? '', ...snap.galleryAssetIds]);
	return {
		type: 'project',
		id: p.id,
		slug: p.slug ?? '',
		title: p.title,
		tagline: snap.tagline,
		body: snap.overview,
		leadNames: leads.length ? leads.map((l) => `${l.first} ${l.last}`) : p.projectLead ? [p.projectLead] : [],
		applyUrl: null,
		hero: snap.heroAssetId ? (assets.get(snap.heroAssetId) ?? null) : null,
		gallery: snap.galleryAssetIds.map((id) => assets.get(id)).filter((a): a is PublicAsset => Boolean(a)),
		legacyPhotoUrls: p.photoUrls ?? [],
		project: {
			status: p.status,
			category: category?.name ?? null,
			skills: splitTags(p.skills),
			hardware: splitTags(p.hardwareInfo),
			software: splitTags(p.softwareInfo),
			team: members.map(toPublicPerson),
		},
	};
}

export async function getPublishedCommitteePage(db: WattsDb, slug: string): Promise<PublicContentPage | null> {
	const [k] = await db
		.select()
		.from(Committees)
		.where(and(eq(Committees.slug, slug), eq(Committees.published, true), eq(Committees.active, true)))
		.limit(1);
	return k ? buildCommitteePage(db, k, committeeSnapshotOf(k)) : null;
}

export async function getPublishedProjectPage(db: WattsDb, slug: string): Promise<PublicContentPage | null> {
	const [p] = await db
		.select()
		.from(Projects)
		.where(and(eq(Projects.slug, slug), eq(Projects.published, true), eq(Projects.active, true)))
		.limit(1);
	return p ? buildProjectPage(db, p, projectSnapshotOf(p)) : null;
}

export interface PagePreview {
	page: PublicContentPage;
	/** Whether the page is currently live at its public URL. */
	livePublished: boolean;
	/** Whether the previewed content would be published (the snapshot's own flag). */
	published: boolean;
	/** Set when previewing a revision rather than the saved page. */
	revision: {
		id: string;
		status: 'pending' | 'published' | 'rejected' | 'superseded';
		createdAt: Date;
		authorName: string | null;
	} | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Preview of a committee/project page for someone who may edit it: the saved page
 * (published or not), or — with `revisionId` — a submitted revision rendered as if it
 * were approved. Only staff and the revision's author may preview a revision.
 * Returns null for anything the actor may not see, so callers can 404 without
 * revealing whether the page exists.
 */
export async function getPagePreview(
	db: WattsDb,
	actor: ContentActor,
	type: 'committee' | 'project',
	slug: string,
	revisionId?: string | null,
): Promise<PagePreview | null> {
	const row =
		type === 'committee'
			? (await db.select().from(Committees).where(eq(Committees.slug, slug)).limit(1))[0]
			: (await db.select().from(Projects).where(eq(Projects.slug, slug)).limit(1))[0];
	if (!row) return null;
	if (!(await canEditScope(db, actor, { type, id: row.id }))) return null;

	const live = type === 'committee'
		? committeeSnapshotOf(row as typeof Committees.$inferSelect)
		: projectSnapshotOf(row as typeof Projects.$inferSelect);
	let snap: CommitteePageSnapshot | ProjectPageSnapshot = live;
	let revision: PagePreview['revision'] = null;

	if (revisionId) {
		if (!UUID_RE.test(revisionId)) return null;
		const [rev] = await db
			.select(revisionColumns)
			.from(ContentRevisions)
			.leftJoin(Members, eq(Members.id, ContentRevisions.authorMemberId))
			.where(eq(ContentRevisions.id, revisionId))
			.limit(1);
		const entityType: ContentEntityType = type === 'committee' ? 'committee_page' : 'project_page';
		if (!rev || rev.entityType !== entityType || rev.entityId !== row.id) return null;
		if (!publishesDirectly(actor) && rev.authorMemberId !== actor.memberId) return null;
		snap = rev.snapshot as CommitteePageSnapshot | ProjectPageSnapshot;
		revision = {
			id: rev.id,
			status: rev.status,
			createdAt: rev.createdAt,
			authorName: rev.authorFirstName ? `${rev.authorFirstName} ${rev.authorLastName}` : null,
		};
	}

	const page =
		type === 'committee'
			? await buildCommitteePage(db, row as typeof Committees.$inferSelect, snap as CommitteePageSnapshot)
			: await buildProjectPage(db, row as typeof Projects.$inferSelect, snap as ProjectPageSnapshot);
	return { page, livePublished: live.published && row.active, published: snap.published, revision };
}

/** Editor/preview path for a revision of a committee/project page; null for other entities. */
async function pagePreviewPath(db: WattsDb, type: ContentEntityType, id: string, revisionId: string) {
	if (type === 'committee_page') {
		const [c] = await db.select({ slug: Committees.slug }).from(Committees).where(eq(Committees.id, id)).limit(1);
		return c?.slug ? `/pages/committee/${c.slug}/preview?revision=${revisionId}` : null;
	}
	if (type === 'project_page') {
		const [p] = await db.select({ slug: Projects.slug }).from(Projects).where(eq(Projects.id, id)).limit(1);
		return p?.slug ? `/pages/project/${p.slug}/preview?revision=${revisionId}` : null;
	}
	return null;
}

export async function listPublishedPageSlugs(db: WattsDb) {
	const [committees, projects] = await Promise.all([
		db
			.select({ slug: Committees.slug })
			.from(Committees)
			.where(and(eq(Committees.published, true), eq(Committees.active, true))),
		db
			.select({ slug: Projects.slug })
			.from(Projects)
			.where(and(eq(Projects.published, true), eq(Projects.active, true))),
	]);
	return {
		committees: committees.map((c) => c.slug).filter((s): s is string => Boolean(s)),
		projects: projects.map((p) => p.slug).filter((s): s is string => Boolean(s)),
	};
}
