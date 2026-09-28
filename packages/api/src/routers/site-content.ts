// Site-content CMS router. Thin: validates payload shapes, resolves who may do what,
// and delegates to @watts/core/site-content (revision engine + read models).
//
//   manage_site_content (staff)  → edits publish immediately, plus the review queue,
//                                   history/restore, officers, sponsors, page media,
//                                   and per-page editor assignments.
//   chairs / leads / assigned    → edit their committee/project page; changes go to review.
//   linked officer               → edit their own officer profile; changes go to review.

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { Members } from '@watts/db/schema';
import {
	approveRevision,
	assignPageEditor,
	buildOfficerSelfSnapshot,
	canEditScope,
	contentActor,
	createOfficerProfile,
	createSponsor,
	deleteOfficerProfile,
	deleteSponsor,
	getOfficerProfileForMember,
	getPageForEdit,
	listEditablePages,
	listMyRevisions,
	listOfficerProfilesForAdmin,
	listPageEditors,
	listPendingRevisions,
	listRevisionHistory,
	listSlotsForAdmin,
	listSponsorsForAdmin,
	publishesDirectly,
	readCurrent,
	rejectRevision,
	reorderOfficerProfiles,
	reorderSponsors,
	restoreRevision,
	revokePageEditor,
	submitChange,
	type CommitteePageSnapshot,
	type ProjectPageSnapshot,
} from '@watts/core/site-content';
import { isSlotKey } from '@watts/core/site-media-slots';
import { authorizeUpload, finalizeUpload } from '@watts/storage/finalize';
import type { MemberRoles } from '@watts/core/members';
import {
	capabilityProcedure,
	createTRPCRouter,
	memberProcedure,
	protectedProcedure,
} from '../trpc';
import { mapDomainError, mapUploadError } from '../map-domain-error';

const SITE_CONTENT_TAG = 'site-content';
const manageSite = capabilityProcedure('manage_site_content');

const uuid = z.string().uuid();
const nullableText = (max: number) =>
	z
		.string()
		.max(max)
		.nullable()
		.transform((v) => (v?.trim() ? v.trim() : null));
const httpUrl = z
	.string()
	.max(500)
	.regex(/^https?:\/\//i, 'Must start with http:// or https://')
	.nullable()
	.or(z.literal('').transform(() => null));
/** An apply/join link: an absolute http(s) URL or a site path like /connect. */
const linkUrl = z
	.string()
	.max(500)
	.regex(/^(https?:\/\/|\/)/i, 'Must be a site path (/connect) or an http(s) link')
	.nullable()
	.or(z.literal('').transform(() => null));

const officerSnapshot = z.object({
	memberId: uuid.nullable(),
	displayName: z.string().trim().min(1).max(255),
	roleTitle: z.string().trim().min(1).max(255),
	group: z.enum(['executive', 'chair']),
	major: nullableText(255),
	yearLabel: nullableText(64),
	bio: nullableText(4000),
	linkedinUrl: httpUrl,
	portraitAssetId: uuid.nullable(),
	active: z.boolean(),
});

const officerSelfFields = officerSnapshot.pick({
	major: true,
	yearLabel: true,
	bio: true,
	linkedinUrl: true,
	portraitAssetId: true,
});

const sponsorSnapshot = z.object({
	companyName: z.string().trim().min(1).max(255),
	tier: z.enum(['Bronze', 'Silver', 'Gold']),
	description: nullableText(2000),
	websiteUrl: httpUrl,
	logoAssetId: uuid.nullable(),
	active: z.boolean(),
});

const committeePageSnapshot = z.object({
	tagline: nullableText(255),
	about: z.string().trim().min(1, 'Add a short description').max(10000),
	applyUrl: linkUrl,
	heroAssetId: uuid.nullable(),
	galleryAssetIds: z.array(uuid).max(30),
	published: z.boolean(),
});

const projectPageSnapshot = z.object({
	tagline: nullableText(255),
	overview: z.string().trim().min(1, 'Add a short description').max(10000),
	heroAssetId: uuid.nullable(),
	galleryAssetIds: z.array(uuid).max(30),
	published: z.boolean(),
});

const entityType = z.enum(['officer_profile', 'sponsor', 'slot', 'committee_page', 'project_page']);

async function actorOf(ctx: { session: { user: { id: string } }; getRoles: () => Promise<MemberRoles | null> }) {
	return contentActor(ctx.session.user.id, await ctx.getRoles());
}

function changed(ctx: { onContentChanged?: (tag: string) => void }) {
	ctx.onContentChanged?.(SITE_CONTENT_TAG);
}

export const siteContentRouter = createTRPCRouter({
	// ---- media upload confirm (anyone who could upload; rules re-checked here) ----

	confirmMedia: protectedProcedure
		.input(
			z.object({
				assetId: uuid,
				contentType: z.string().min(1).max(100),
				byteSize: z.number().int().positive(),
				filename: z.string().max(255),
				width: z.number().int().positive().nullable(),
				height: z.number().int().positive().nullable(),
				mediaKind: z.enum(['image', 'animated', 'document']),
				scopeType: z.enum(['global', 'committee', 'project']).optional(),
				scopeId: uuid.nullish(),
				purpose: z.literal('officer-portrait').optional(),
				officerProfileId: uuid.optional(),
				alt: z.string().max(500).nullish(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				// Re-run the same authorization the upload token used, then validate the bytes.
				const authorized = await authorizeUpload(ctx.db, ctx.session, {
					...input,
					kind: 'site-media',
					photoId: input.assetId,
				});
				const result = await finalizeUpload(ctx.db, authorized.tokenPayload);
				return result.asset!;
			} catch (err) {
				mapUploadError(err);
			}
		}),

	/** Re-render the public pages now — e.g. after the one-off import, which writes directly. */
	refreshCache: manageSite.mutation(({ ctx }) => {
		changed(ctx);
		return { success: true };
	}),

	// ---- staff: page media ----

	listSlots: manageSite.query(({ ctx }) => listSlotsForAdmin(ctx.db)),

	setSlot: manageSite
		.input(z.object({ slotKey: z.string().max(96), assetId: uuid.nullable() }))
		.mutation(async ({ ctx, input }) => {
			if (!isSlotKey(input.slotKey)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown slot' });
			try {
				const res = await submitChange(ctx.db, {
					entityType: 'slot',
					entityId: input.slotKey,
					snapshot: { assetId: input.assetId },
					actor: await actorOf(ctx),
					direct: true,
				});
				changed(ctx);
				return res;
			} catch (e) {
				mapDomainError(e);
			}
		}),

	// ---- staff: officers ----

	listOfficers: manageSite.query(({ ctx }) => listOfficerProfilesForAdmin(ctx.db)),

	memberOptions: manageSite.query(({ ctx }) =>
		ctx.db
			.select({ id: Members.id, firstName: Members.firstName, lastName: Members.lastName })
			.from(Members)
			.where(eq(Members.active, true))
			.orderBy(asc(Members.firstName), asc(Members.lastName)),
	),

	createOfficer: manageSite.input(officerSnapshot).mutation(async ({ ctx, input }) => {
		try {
			const res = await createOfficerProfile(ctx.db, input, await actorOf(ctx));
			changed(ctx);
			return res;
		} catch (e) {
			mapDomainError(e);
		}
	}),

	updateOfficer: manageSite
		.input(z.object({ id: uuid, snapshot: officerSnapshot }))
		.mutation(async ({ ctx, input }) => {
			try {
				const res = await submitChange(ctx.db, {
					entityType: 'officer_profile',
					entityId: input.id,
					snapshot: input.snapshot,
					actor: await actorOf(ctx),
					direct: true,
				});
				changed(ctx);
				return res;
			} catch (e) {
				mapDomainError(e);
			}
		}),

	deleteOfficer: manageSite.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
		await deleteOfficerProfile(ctx.db, input.id);
		changed(ctx);
		return { success: true };
	}),

	reorderOfficers: manageSite.input(z.object({ ids: z.array(uuid).max(200) })).mutation(async ({ ctx, input }) => {
		await reorderOfficerProfiles(ctx.db, input.ids);
		changed(ctx);
		return { success: true };
	}),

	// ---- staff: sponsors ----

	listSponsors: manageSite.query(({ ctx }) => listSponsorsForAdmin(ctx.db)),

	createSponsor: manageSite.input(sponsorSnapshot).mutation(async ({ ctx, input }) => {
		try {
			const res = await createSponsor(ctx.db, input, await actorOf(ctx));
			changed(ctx);
			return res;
		} catch (e) {
			mapDomainError(e);
		}
	}),

	updateSponsor: manageSite
		.input(z.object({ id: uuid, snapshot: sponsorSnapshot }))
		.mutation(async ({ ctx, input }) => {
			try {
				const res = await submitChange(ctx.db, {
					entityType: 'sponsor',
					entityId: input.id,
					snapshot: input.snapshot,
					actor: await actorOf(ctx),
					direct: true,
				});
				changed(ctx);
				return res;
			} catch (e) {
				mapDomainError(e);
			}
		}),

	deleteSponsor: manageSite.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
		await deleteSponsor(ctx.db, input.id);
		changed(ctx);
		return { success: true };
	}),

	reorderSponsors: manageSite.input(z.object({ ids: z.array(uuid).max(200) })).mutation(async ({ ctx, input }) => {
		await reorderSponsors(ctx.db, input.ids);
		changed(ctx);
		return { success: true };
	}),

	// ---- staff: review queue + history ----

	listPending: manageSite.query(({ ctx }) => listPendingRevisions(ctx.db)),

	approve: manageSite
		.input(z.object({ revisionId: uuid, note: z.string().max(1000).nullish() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const res = await approveRevision(ctx.db, input.revisionId, await actorOf(ctx), input.note);
				changed(ctx);
				return res;
			} catch (e) {
				mapDomainError(e);
			}
		}),

	reject: manageSite
		.input(z.object({ revisionId: uuid, note: z.string().max(1000).nullish() }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await rejectRevision(ctx.db, input.revisionId, await actorOf(ctx), input.note);
			} catch (e) {
				mapDomainError(e);
			}
		}),

	history: manageSite
		.input(z.object({ entityType, entityId: z.string().max(96) }))
		.query(({ ctx, input }) => listRevisionHistory(ctx.db, input.entityType, input.entityId)),

	restore: manageSite.input(z.object({ revisionId: uuid })).mutation(async ({ ctx, input }) => {
		try {
			const res = await restoreRevision(ctx.db, input.revisionId, await actorOf(ctx));
			changed(ctx);
			return res;
		} catch (e) {
			mapDomainError(e);
		}
	}),

	// ---- staff: per-page editor assignments ----

	listPageEditors: manageSite.query(({ ctx }) => listPageEditors(ctx.db)),

	assignPageEditor: manageSite
		.input(
			z.object({
				scopeType: z.enum(['committee', 'project']),
				scopeId: uuid,
				memberId: uuid,
				expiresAt: z.string().datetime().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const actor = await actorOf(ctx);
			try {
				await assignPageEditor(ctx.db, {
					scope: { type: input.scopeType, id: input.scopeId },
					memberId: input.memberId,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
					grantedByMemberId: actor.memberId,
				});
				return { success: true };
			} catch (e) {
				mapDomainError(e);
			}
		}),

	revokePageEditor: manageSite.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
		await revokePageEditor(ctx.db, input.id);
		return { success: true };
	}),

	// ---- members: their own officer profile ----

	myOfficerProfile: memberProcedure.query(async ({ ctx }) => {
		const profile = await getOfficerProfileForMember(ctx.db, ctx.member.id);
		if (!profile) return null;
		const mine = (await listMyRevisions(ctx.db, ctx.member.id)).filter(
			(r) => r.entityType === 'officer_profile' && r.entityId === profile.id,
		);
		return { profile, latestSubmission: mine[0] ?? null };
	}),

	submitMyOfficerProfile: memberProcedure.input(officerSelfFields).mutation(async ({ ctx, input }) => {
		const profile = await getOfficerProfileForMember(ctx.db, ctx.member.id);
		if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'No officer profile is linked to you' });
		const actor = await actorOf(ctx);
		try {
			const snapshot = await buildOfficerSelfSnapshot(ctx.db, profile.id, input);
			const direct = publishesDirectly(actor);
			const res = await submitChange(ctx.db, {
				entityType: 'officer_profile',
				entityId: profile.id,
				snapshot,
				actor,
				direct,
			});
			if (direct) changed(ctx);
			return res;
		} catch (e) {
			mapDomainError(e);
		}
	}),

	// ---- members: committee / project pages they can edit ----

	editablePages: protectedProcedure.query(async ({ ctx }) => {
		const roles = await ctx.getRoles();
		return listEditablePages(ctx.db, roles);
	}),

	pageForEdit: protectedProcedure
		.input(z.object({ type: z.enum(['committee', 'project']), slug: z.string().max(64) }))
		.query(async ({ ctx, input }) => {
			const actor = await actorOf(ctx);
			try {
				const page = await getPageForEdit(ctx.db, input.type, input.slug);
				if (!(await canEditScope(ctx.db, actor, { type: input.type, id: page.id }))) {
					throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot edit this page' });
				}
				const myLatest = actor.memberId
					? (await listMyRevisions(ctx.db, actor.memberId)).find(
						(r) =>
							r.entityType === (input.type === 'committee' ? 'committee_page' : 'project_page') &&
								r.entityId === page.id,
					) ?? null
					: null;
				return { ...page, canPublish: publishesDirectly(actor), myLatest };
			} catch (e) {
				if (e instanceof TRPCError) throw e;
				mapDomainError(e);
			}
		}),

	submitCommitteePage: protectedProcedure
		// draft: staff save to the review queue instead of publishing, so they can preview first.
		.input(z.object({ id: uuid, snapshot: committeePageSnapshot, draft: z.boolean().optional() }))
		.mutation(async ({ ctx, input }) => {
			const actor = await actorOf(ctx);
			if (!(await canEditScope(ctx.db, actor, { type: 'committee', id: input.id }))) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot edit this page' });
			}
			try {
				const staff = publishesDirectly(actor);
				const direct = staff && !input.draft;
				const snapshot: CommitteePageSnapshot = { ...input.snapshot };
				if (!staff) {
					// Only staff decide whether a page is live.
					const current = (await readCurrent(ctx.db, 'committee_page', input.id)) as CommitteePageSnapshot;
					snapshot.published = current.published;
				}
				const res = await submitChange(ctx.db, {
					entityType: 'committee_page',
					entityId: input.id,
					snapshot,
					actor,
					direct,
				});
				if (direct) changed(ctx);
				return res;
			} catch (e) {
				mapDomainError(e);
			}
		}),

	submitProjectPage: protectedProcedure
		// draft: staff save to the review queue instead of publishing, so they can preview first.
		.input(z.object({ id: uuid, snapshot: projectPageSnapshot, draft: z.boolean().optional() }))
		.mutation(async ({ ctx, input }) => {
			const actor = await actorOf(ctx);
			if (!(await canEditScope(ctx.db, actor, { type: 'project', id: input.id }))) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot edit this page' });
			}
			try {
				const staff = publishesDirectly(actor);
				const direct = staff && !input.draft;
				const snapshot: ProjectPageSnapshot = { ...input.snapshot };
				if (!staff) {
					const current = (await readCurrent(ctx.db, 'project_page', input.id)) as ProjectPageSnapshot;
					snapshot.published = current.published;
				}
				const res = await submitChange(ctx.db, {
					entityType: 'project_page',
					entityId: input.id,
					snapshot,
					actor,
					direct,
				});
				if (direct) changed(ctx);
				return res;
			} catch (e) {
				mapDomainError(e);
			}
		}),

	myRevisions: memberProcedure.query(({ ctx }) => listMyRevisions(ctx.db, ctx.member.id)),
});
