import { z } from 'zod';
import { capabilityProcedure, createTRPCRouter, protectedProcedure } from '../trpc';
import {
	addMerchVariant,
	cancelMyMerchOrder,
	createMerchProduct,
	deleteMerchProduct,
	deleteMerchVariant,
	getMerchStorefront,
	listMerchCatalog,
	listMerchOrders,
	listMyMerchOrders,
	MERCH_IMAGE_LABEL_MAX,
	MERCH_MAX_IMAGES,
	MERCH_MAX_QTY_PER_SIZE,
	MERCH_PAYMENT_NOTE,
	moveMerchOrder,
	placeMerchOrder,
	reorderMerchProducts,
	setMerchProductActive,
	updateMerchProduct,
	updateMerchVariant,
} from '@watts/core/merch';
import { mapDomainError } from '../map-domain-error';

// Buyers: any signed-in account (no member profile needed). Store staff: manage_merch.
const manageMerch = capabilityProcedure('manage_merch');

const uuid = z.string().uuid();
const status = z.enum(['requested', 'approved', 'paid', 'delivered', 'denied', 'cancelled']);
// Shape only — @watts/core/merch owns the real rules.
const product = {
	name: z.string().max(120),
	description: z.string().max(1000).nullish(),
	priceCents: z.number().int(),
	images: z
		.array(z.object({ assetId: uuid, label: z.string().max(MERCH_IMAGE_LABEL_MAX).nullish() }))
		.max(MERCH_MAX_IMAGES)
		.optional(),
	active: z.boolean().optional(),
};
const variant = { label: z.string().max(24), stock: z.number().int() };

export const merchRouter = createTRPCRouter({
	// ---- Buyers ----
	storefront: protectedProcedure.query(async ({ ctx }) => ({
		products: await getMerchStorefront(ctx.db),
		paymentNote: MERCH_PAYMENT_NOTE,
		maxQtyPerSize: MERCH_MAX_QTY_PER_SIZE,
	})),

	myOrders: protectedProcedure.query(({ ctx }) => listMyMerchOrders(ctx.db, ctx.session.user.id)),

	placeOrder: protectedProcedure
		.input(
			z.object({
				items: z
					.array(z.object({ variantId: uuid, quantity: z.number().int() }))
					.min(1)
					.max(10),
				note: z.string().max(500).nullish(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const roles = await ctx.getRoles();
			try {
				return await placeMerchOrder(ctx.db, {
					userId: ctx.session.user.id,
					memberId: roles?.memberId ?? null,
					items: input.items,
					note: input.note,
				});
			} catch (e) {
				mapDomainError(e);
			}
		}),

	cancelMyOrder: protectedProcedure.input(z.object({ orderId: uuid })).mutation(async ({ ctx, input }) => {
		const roles = await ctx.getRoles();
		try {
			await cancelMyMerchOrder(ctx.db, {
				orderId: input.orderId,
				userId: ctx.session.user.id,
				memberId: roles?.memberId ?? null,
			});
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),

	// ---- Store staff ----
	listOrders: manageMerch
		.input(z.object({ status: z.union([status, z.literal('closed')]).optional() }))
		.query(({ ctx, input }) => listMerchOrders(ctx.db, input)),

	/** `from` is the status the officer saw — if it changed meanwhile this is a CONFLICT. */
	moveOrder: manageMerch
		.input(z.object({ orderId: uuid, from: status, to: status, officerNote: z.string().max(500).nullish() }))
		.mutation(async ({ ctx, input }) => {
			const roles = await ctx.getRoles();
			try {
				await moveMerchOrder(ctx.db, { ...input, actorMemberId: roles?.memberId ?? null });
				return { success: true };
			} catch (e) {
				mapDomainError(e);
			}
		}),

	catalog: manageMerch.query(({ ctx }) => listMerchCatalog(ctx.db)),

	createProduct: manageMerch.input(z.object(product)).mutation(async ({ ctx, input }) => {
		try {
			return await createMerchProduct(ctx.db, input);
		} catch (e) {
			mapDomainError(e);
		}
	}),

	updateProduct: manageMerch.input(z.object({ id: uuid, ...product })).mutation(async ({ ctx, input }) => {
		const { id, ...rest } = input;
		try {
			await updateMerchProduct(ctx.db, id, rest);
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),

	setProductActive: manageMerch.input(z.object({ id: uuid, active: z.boolean() })).mutation(async ({ ctx, input }) => {
		try {
			await setMerchProductActive(ctx.db, input.id, input.active);
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),

	deleteProduct: manageMerch.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
		try {
			await deleteMerchProduct(ctx.db, input.id);
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),

	reorderProducts: manageMerch.input(z.object({ ids: z.array(uuid).max(200) })).mutation(async ({ ctx, input }) => {
		await reorderMerchProducts(ctx.db, input.ids);
		return { success: true };
	}),

	addVariant: manageMerch.input(z.object({ productId: uuid, ...variant })).mutation(async ({ ctx, input }) => {
		const { productId, ...rest } = input;
		try {
			return await addMerchVariant(ctx.db, productId, rest);
		} catch (e) {
			mapDomainError(e);
		}
	}),

	updateVariant: manageMerch.input(z.object({ id: uuid, ...variant })).mutation(async ({ ctx, input }) => {
		const { id, ...rest } = input;
		try {
			await updateMerchVariant(ctx.db, id, rest);
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),

	deleteVariant: manageMerch.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
		try {
			await deleteMerchVariant(ctx.db, input.id);
			return { success: true };
		} catch (e) {
			mapDomainError(e);
		}
	}),
});
