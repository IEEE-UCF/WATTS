import { z } from 'zod';
import { capabilityProcedure, createTRPCRouter } from '../trpc';
import {
	canEditShortLink,
	createShortLink,
	listShortLinkEventOptions,
	listShortLinkHistory,
	listShortLinks,
	setShortLinkActive,
	updateShortLink,
	type ShortLinkActor,
} from '@watts/core/short-links';
import { shortLinkOrigin } from '@watts/core/short-link-rules';
import type { MemberRoles } from '@watts/core/members';
import { mapDomainError } from '../map-domain-error';

const manageLinks = capabilityProcedure('manage_links');

const ownOrigin = () => shortLinkOrigin(process.env.SHORT_LINK_ORIGIN);

async function actorOf(ctx: { getRoles: () => Promise<MemberRoles | null> }): Promise<ShortLinkActor> {
	const roles = await ctx.getRoles();
	return {
		memberId: roles?.memberId ?? null,
		administrator: roles?.administrator ?? false,
		officerStatus: roles?.officerStatus ?? false,
		permissions: roles?.permissions ?? [],
	};
}

const uuid = z.string().uuid();
// Shape only — @watts/core owns the real rules (http(s) only, slug format, reserved words).
const fields = {
	title: z.string().max(120),
	targetUrl: z.string().max(2000),
	slug: z.string().max(64).nullish(),
	notes: z.string().max(2000).nullish(),
	owner: z.string().max(80).nullish(),
	expiresAt: z.coerce.date().nullish(),
};

export const shortLinkRouter = createTRPCRouter({
	list: manageLinks.query(async ({ ctx }) => {
		const actor = await actorOf(ctx);
		const links = await listShortLinks(ctx.db);
		return links.map((l) => ({ ...l, canEdit: canEditShortLink(actor, l) }));
	}),

	history: manageLinks.input(z.object({ id: uuid })).query(({ ctx, input }) => listShortLinkHistory(ctx.db, input.id)),

	eventOptions: manageLinks.query(({ ctx }) => listShortLinkEventOptions(ctx.db)),

	create: manageLinks.input(z.object(fields)).mutation(async ({ ctx, input }) => {
		try {
			return await createShortLink(ctx.db, input, await actorOf(ctx), { ownOrigin: ownOrigin() });
		} catch (e) {
			mapDomainError(e);
		}
	}),

	update: manageLinks
		.input(z.object({ id: uuid, ...fields, title: fields.title.optional(), targetUrl: fields.targetUrl.optional() }))
		.mutation(async ({ ctx, input }) => {
			const { id, ...patch } = input;
			try {
				return await updateShortLink(ctx.db, id, patch, await actorOf(ctx), { ownOrigin: ownOrigin() });
			} catch (e) {
				mapDomainError(e);
			}
		}),

	setActive: manageLinks.input(z.object({ id: uuid, active: z.boolean() })).mutation(async ({ ctx, input }) => {
		try {
			await setShortLinkActive(ctx.db, input.id, input.active, await actorOf(ctx));
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),
});
