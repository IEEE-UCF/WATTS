// Merch store: signed-in users request shirts, officers walk each order through
// requested → approved → paid → delivered (payment happens in person).
//
// Concurrency: prod talks to Neon over HTTP (drizzle-orm/neon-http), which has no
// interactive transactions. So every write here is ONE SQL statement — data-modifying
// CTEs where several tables change together — and the database enforces the rules:
//   - merch_variants_reserved_check (0 <= reserved <= stock) → nobody oversells, even
//     when two orders race for the last shirt (the second UPDATE waits, re-reads the
//     row, fails the CHECK, and its whole statement — order included — is undone);
//   - merch_orders_open_unique → one open order per person (double-click, two tabs);
//   - status changes are compare-and-set (`WHERE status = <what the clicker saw>`),
//     so two officers clicking at once can't both win.
import { asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import {
	MediaAssets,
	Members,
	MerchOrderItems,
	MerchOrders,
	MerchProducts,
	MerchVariants,
	Users,
} from '@watts/db/schema';
import { DomainError } from './errors';

export type MerchOrderStatus = (typeof MerchOrders.$inferSelect)['status'];

/** Shown to buyers in the order form and on an approved order. */
export const MERCH_PAYMENT_NOTE =
	'No payment now. Once an officer approves your request, pay in person (cash, Venmo or Zelle) at a GBM or office hours.';

export const MERCH_MAX_QTY_PER_SIZE = 3;
export const MERCH_OPEN_STATUSES = ['requested', 'approved', 'paid'] as const satisfies readonly MerchOrderStatus[];

/**
 * Every allowed status move. `release` = the order's reserved units go back to stock.
 * The undo moves (one step back) exist for misclicks; they clear that stage's stamp.
 */
const TRANSITIONS: Record<string, { release?: boolean; buyer?: boolean }> = {
	'requested>approved': {},
	'requested>denied': { release: true },
	'requested>cancelled': { release: true, buyer: true },
	'approved>paid': {},
	'approved>cancelled': { release: true },
	'paid>delivered': {},
	'approved>requested': {},
	'paid>approved': {},
	'delivered>paid': {},
};

export function canMoveMerchOrder(from: MerchOrderStatus, to: MerchOrderStatus): boolean {
	return `${from}>${to}` in TRANSITIONS;
}

// ---------------------------------------------------------------------------
// Raw-SQL helpers (one statement per write — see the header)
// ---------------------------------------------------------------------------

/** Rows from db.execute on any of our three drivers (array, or { rows }). */
async function run<T>(db: WattsDb, query: SQL): Promise<T[]> {
	const result = await (db as unknown as { execute: (q: SQL) => Promise<unknown> }).execute(query);
	if (Array.isArray(result)) return result as T[];
	return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** Postgres error code + constraint name, unwrapping drizzle's query-error wrapper. */
function pgError(e: unknown): { code?: string; constraint?: string } {
	let cur: unknown = e;
	for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
		const o = cur as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
		if (typeof o.code === 'string' && /^[0-9A-Z]{5}$/.test(o.code)) {
			const constraint = (o.constraint ?? o.constraint_name) as string | undefined;
			return { code: o.code, constraint };
		}
		cur = o.cause;
	}
	return {};
}

// ---------------------------------------------------------------------------
// Store (buyers)
// ---------------------------------------------------------------------------

export interface MerchVariantView {
	id: string;
	label: string;
	stock: number;
	reserved: number;
	left: number;
	soldOut: boolean;
	sortOrder: number;
}

export interface MerchProductView {
	id: string;
	name: string;
	description: string | null;
	priceCents: number;
	imageAssetId: string | null;
	imageUrl: string | null;
	active: boolean;
	sortOrder: number;
	variants: MerchVariantView[];
}

async function loadProducts(db: WattsDb, onlyActive: boolean): Promise<MerchProductView[]> {
	const products = await db
		.select({
			id: MerchProducts.id,
			name: MerchProducts.name,
			description: MerchProducts.description,
			priceCents: MerchProducts.priceCents,
			imageAssetId: MerchProducts.imageAssetId,
			imageUrl: MediaAssets.url,
			active: MerchProducts.active,
			sortOrder: MerchProducts.sortOrder,
		})
		.from(MerchProducts)
		.leftJoin(MediaAssets, eq(MediaAssets.id, MerchProducts.imageAssetId))
		.where(onlyActive ? eq(MerchProducts.active, true) : undefined)
		.orderBy(asc(MerchProducts.sortOrder), asc(MerchProducts.createdAt));
	if (products.length === 0) return [];

	const variants = await db
		.select()
		.from(MerchVariants)
		.where(
			inArray(
				MerchVariants.productId,
				products.map((p) => p.id),
			),
		)
		.orderBy(asc(MerchVariants.sortOrder), asc(MerchVariants.createdAt));

	return products.map((p) => ({
		...p,
		variants: variants
			.filter((v) => v.productId === p.id)
			.map((v) => ({
				id: v.id,
				label: v.label,
				stock: v.stock,
				reserved: v.reserved,
				left: Math.max(0, v.stock - v.reserved),
				soldOut: v.stock - v.reserved <= 0,
				sortOrder: v.sortOrder,
			})),
	}));
}

/** Visible products with how many of each size are left. */
export function getMerchStorefront(db: WattsDb): Promise<MerchProductView[]> {
	return loadProducts(db, true);
}

export interface PlaceMerchOrderInput {
	userId: string;
	memberId: string | null;
	items: { variantId: string; quantity: number }[];
	note?: string | null;
}

/** Merge duplicate sizes and check quantities — the same rules the form applies. */
function cleanItems(items: PlaceMerchOrderInput['items']): { variantId: string; quantity: number }[] {
	const merged = new Map<string, number>();
	for (const it of items) {
		if (!Number.isInteger(it.quantity) || it.quantity < 1) {
			throw new DomainError('BAD_REQUEST', 'Each shirt needs a quantity of at least 1.');
		}
		merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + it.quantity);
	}
	if (merged.size === 0) throw new DomainError('BAD_REQUEST', 'Pick at least one shirt.');
	for (const qty of merged.values()) {
		if (qty > MERCH_MAX_QTY_PER_SIZE) {
			throw new DomainError('BAD_REQUEST', `You can order at most ${MERCH_MAX_QTY_PER_SIZE} of each size.`);
		}
	}
	// Sorted, so concurrent multi-size orders take row locks in the same order.
	return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([variantId, quantity]) => ({ variantId, quantity }));
}

/** After a CHECK failure: name the size(s) that can't cover the request. */
async function soldOutMessage(db: WattsDb, items: { variantId: string; quantity: number }[]): Promise<string> {
	const rows = await db
		.select({
			id: MerchVariants.id,
			label: MerchVariants.label,
			stock: MerchVariants.stock,
			reserved: MerchVariants.reserved,
			name: MerchProducts.name,
		})
		.from(MerchVariants)
		.innerJoin(MerchProducts, eq(MerchProducts.id, MerchVariants.productId))
		.where(
			inArray(
				MerchVariants.id,
				items.map((i) => i.variantId),
			),
		);
	const short = items
		.map((it) => {
			const v = rows.find((r) => r.id === it.variantId);
			if (!v) return null;
			const left = Math.max(0, v.stock - v.reserved);
			if (left >= it.quantity) return null;
			return left === 0 ? `${v.name} ${v.label} just sold out` : `only ${left} left of ${v.name} ${v.label}`;
		})
		.filter(Boolean);
	if (short.length === 0) return 'Those sizes just sold out — refresh and try again.';
	const msg = short.join('; ');
	return `${msg.charAt(0).toUpperCase()}${msg.slice(1)} — pick another size.`;
}

/**
 * Place an order: reserve stock, insert the order, insert its items — one statement.
 * If any size can't cover its quantity the CHECK fails and nothing is written. If a
 * product was hidden meanwhile, total_cents comes out NULL and the NOT NULL aborts it.
 */
export async function placeMerchOrder(db: WattsDb, input: PlaceMerchOrderInput): Promise<{ id: string }> {
	const items = cleanItems(input.items);
	const note = input.note?.trim().slice(0, 500) || null;

	const [buyer] = await db
		.select({ name: Users.name, email: Users.email })
		.from(Users)
		.where(eq(Users.id, input.userId))
		.limit(1);
	if (!buyer) throw new DomainError('NOT_FOUND', 'Account not found.');
	let buyerName = buyer.name;
	if (input.memberId) {
		const [m] = await db
			.select({ first: Members.firstName, last: Members.lastName })
			.from(Members)
			.where(eq(Members.id, input.memberId))
			.limit(1);
		if (m) buyerName = `${m.first} ${m.last}`.trim();
	}

	const values = sql.join(
		items.map((i) => sql`(${i.variantId}::uuid, ${i.quantity}::int)`),
		sql`, `,
	);
	const statement = sql`
		with req (variant_id, qty) as (values ${values}),
		reserve as (
			update merch_variants v
			set reserved = v.reserved + req.qty, updated_at = now()
			from req
			where v.id = req.variant_id
			returning v.id, v.product_id, v.label, req.qty
		),
		priced as (
			select r.id as variant_id, r.label, r.qty, p.name, p.price_cents
			from reserve r
			join merch_products p on p.id = r.product_id and p.active
		),
		ord as (
			insert into merch_orders (user_id, member_id, buyer_name, buyer_email, total_cents, note)
			select ${input.userId}::uuid, ${input.memberId}::uuid, ${buyerName}, ${buyer.email},
				case when count(*) = ${items.length} then sum(qty * price_cents)::int end,
				${note}
			from priced
			returning id
		)
		insert into merch_order_items (order_id, variant_id, product_name, variant_label, quantity, unit_price_cents)
		select ord.id, priced.variant_id, priced.name, priced.label, priced.qty, priced.price_cents
		from ord cross join priced
		returning order_id
	`;

	for (let attempt = 0; ; attempt++) {
		try {
			const rows = await run<{ order_id: string }>(db, statement);
			const id = rows[0]?.order_id;
			if (!id) throw new DomainError('BAD_REQUEST', 'One of those shirts isn’t available anymore — refresh and try again.');
			return { id };
		} catch (e) {
			if (e instanceof DomainError) throw e;
			const { code, constraint } = pgError(e);
			if (code === '40P01' && attempt === 0) continue; // deadlock with a concurrent order — retry once
			if (code === '23514' && constraint === 'merch_variants_reserved_check') {
				throw new DomainError('CONFLICT', await soldOutMessage(db, items));
			}
			if (code === '23505' && constraint === 'merch_orders_open_unique') {
				throw new DomainError(
					'CONFLICT',
					'You already have an open order. Cancel it, or wait until it’s delivered, before ordering again.',
				);
			}
			if (code === '23502') {
				throw new DomainError('BAD_REQUEST', 'One of those shirts isn’t available anymore — refresh and try again.');
			}
			if (code === '40P01') throw new DomainError('CONFLICT', 'The store is busy — please try again.');
			throw e;
		}
	}
}

// ---------------------------------------------------------------------------
// Orders (both sides)
// ---------------------------------------------------------------------------

export interface MerchOrderItemView {
	id: string;
	variantId: string;
	productName: string;
	variantLabel: string;
	quantity: number;
	unitPriceCents: number;
}

export type MerchOrderView = typeof MerchOrders.$inferSelect & { items: MerchOrderItemView[] };

async function withItems(db: WattsDb, orders: (typeof MerchOrders.$inferSelect)[]): Promise<MerchOrderView[]> {
	if (orders.length === 0) return [];
	const items = await db
		.select({
			id: MerchOrderItems.id,
			orderId: MerchOrderItems.orderId,
			variantId: MerchOrderItems.variantId,
			productName: MerchOrderItems.productName,
			variantLabel: MerchOrderItems.variantLabel,
			quantity: MerchOrderItems.quantity,
			unitPriceCents: MerchOrderItems.unitPriceCents,
		})
		.from(MerchOrderItems)
		.where(
			inArray(
				MerchOrderItems.orderId,
				orders.map((o) => o.id),
			),
		)
		.orderBy(asc(MerchOrderItems.productName), asc(MerchOrderItems.variantLabel));
	return orders.map((o) => ({
		...o,
		items: items.filter((i) => i.orderId === o.id).map(({ orderId: _orderId, ...rest }) => rest),
	}));
}

/** A buyer's orders, newest first. */
export async function listMyMerchOrders(db: WattsDb, userId: string): Promise<MerchOrderView[]> {
	const orders = await db
		.select()
		.from(MerchOrders)
		.where(eq(MerchOrders.userId, userId))
		.orderBy(desc(MerchOrders.createdAt))
		.limit(20);
	return withItems(db, orders);
}

/** Officer queue, newest first. `closed` = denied + cancelled. */
export async function listMerchOrders(
	db: WattsDb,
	filter: { status?: MerchOrderStatus | 'closed' } = {},
): Promise<{ orders: MerchOrderView[]; counts: Record<MerchOrderStatus, number> }> {
	const where =
		filter.status === 'closed'
			? inArray(MerchOrders.status, ['denied', 'cancelled'])
			: filter.status
				? eq(MerchOrders.status, filter.status)
				: undefined;
	const [orders, countRows] = await Promise.all([
		db.select().from(MerchOrders).where(where).orderBy(desc(MerchOrders.createdAt)).limit(500),
		db
			.select({ status: MerchOrders.status, n: sql<number>`count(*)::int` })
			.from(MerchOrders)
			.groupBy(MerchOrders.status),
	]);
	const counts = { requested: 0, approved: 0, paid: 0, delivered: 0, denied: 0, cancelled: 0 } as Record<
		MerchOrderStatus,
		number
	>;
	for (const r of countRows) counts[r.status] = r.n;
	return { orders: await withItems(db, orders), counts };
}

/**
 * Move an order from `from` (the status the clicker saw) to `to`. Compare-and-set:
 * if someone else changed it first, nothing happens and this throws CONFLICT.
 * Moves that close an order release its reserved units in the same statement.
 */
export async function moveMerchOrder(
	db: WattsDb,
	args: {
		orderId: string;
		from: MerchOrderStatus;
		to: MerchOrderStatus;
		actorMemberId: string | null;
		officerNote?: string | null;
		/** Set for a buyer cancelling their own order. */
		buyerUserId?: string;
	},
): Promise<void> {
	const rule = TRANSITIONS[`${args.from}>${args.to}`];
	if (!rule) throw new DomainError('BAD_REQUEST', `An order can’t go from ${args.from} to ${args.to}.`);
	if (args.buyerUserId && !rule.buyer) throw new DomainError('FORBIDDEN', 'Only officers can make that change.');

	const actor = args.actorMemberId;
	const note = args.officerNote?.trim().slice(0, 500);
	const stamp: SQL = {
		approved: args.from === 'requested' ? sql`approved_at = now(), approved_by_member_id = ${actor}::uuid,` : sql``,
		paid: args.from === 'approved' ? sql`paid_at = now(), paid_by_member_id = ${actor}::uuid,` : sql``,
		delivered: sql`delivered_at = now(), delivered_by_member_id = ${actor}::uuid,`,
		denied: sql`closed_at = now(), closed_by_member_id = ${actor}::uuid,`,
		cancelled: sql`closed_at = now(), closed_by_member_id = ${actor}::uuid,`,
		// undo: clear the stage we're stepping back out of
		requested: sql`approved_at = null, approved_by_member_id = null,`,
	}[args.to];
	const undoStamp: SQL =
		args.from === 'paid' && args.to === 'approved'
			? sql`paid_at = null, paid_by_member_id = null,`
			: args.from === 'delivered' && args.to === 'paid'
				? sql`delivered_at = null, delivered_by_member_id = null,`
				: sql``;
	const noteSet = note ? sql`officer_note = ${note},` : sql``;
	const buyerOnly = args.buyerUserId ? sql`and user_id = ${args.buyerUserId}::uuid` : sql``;

	const update = sql`
		update merch_orders
		set status = ${args.to}::merch_order_status_enum, ${stamp} ${undoStamp} ${noteSet} updated_at = now()
		where id = ${args.orderId}::uuid and status = ${args.from}::merch_order_status_enum ${buyerOnly}
		returning id
	`;
	const statement = rule.release
		? sql`
			with changed as (${update}),
			released as (
				update merch_variants v
				set reserved = v.reserved - i.quantity, updated_at = now()
				from merch_order_items i
				join changed c on c.id = i.order_id
				where v.id = i.variant_id
				returning v.id
			)
			select id from changed
		`
		: update;

	const rows = await run<{ id: string }>(db, statement);
	if (rows.length === 0) {
		const [current] = await db
			.select({ status: MerchOrders.status, userId: MerchOrders.userId })
			.from(MerchOrders)
			.where(eq(MerchOrders.id, args.orderId))
			.limit(1);
		if (!current || (args.buyerUserId && current.userId !== args.buyerUserId)) {
			throw new DomainError('NOT_FOUND', 'Order not found.');
		}
		throw new DomainError('CONFLICT', `Someone already updated this order — it’s now ${current.status}.`);
	}
}

/** A buyer cancels their own order (only while it's still requested). */
export function cancelMyMerchOrder(
	db: WattsDb,
	args: { orderId: string; userId: string; memberId: string | null },
): Promise<void> {
	return moveMerchOrder(db, {
		orderId: args.orderId,
		from: 'requested',
		to: 'cancelled',
		actorMemberId: args.memberId,
		buyerUserId: args.userId,
	});
}

// ---------------------------------------------------------------------------
// Catalog (officers)
// ---------------------------------------------------------------------------

/** Every product, hidden ones included, with stock / reserved per size. */
export function listMerchCatalog(db: WattsDb): Promise<MerchProductView[]> {
	return loadProducts(db, false);
}

export interface MerchProductInput {
	name: string;
	description?: string | null;
	priceCents: number;
	imageAssetId?: string | null;
	active?: boolean;
}

function checkProduct(input: MerchProductInput) {
	const name = input.name.trim();
	if (!name) throw new DomainError('BAD_REQUEST', 'Give the product a name.');
	if (name.length > 120) throw new DomainError('BAD_REQUEST', 'The name can be at most 120 characters.');
	if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 100_000) {
		throw new DomainError('BAD_REQUEST', 'Enter a price between $0 and $1,000.');
	}
	return {
		name,
		description: input.description?.trim().slice(0, 1000) || null,
		priceCents: input.priceCents,
		imageAssetId: input.imageAssetId ?? null,
		...(input.active === undefined ? {} : { active: input.active }),
	};
}

export async function createMerchProduct(db: WattsDb, input: MerchProductInput): Promise<{ id: string }> {
	const values = checkProduct(input);
	const [row] = await db
		.insert(MerchProducts)
		.values({
			...values,
			sortOrder: sql`(select coalesce(max(sort_order), -1) + 1 from merch_products)`,
		})
		.returning();
	return { id: row!.id };
}

export async function updateMerchProduct(db: WattsDb, id: string, input: MerchProductInput): Promise<void> {
	const values = checkProduct(input);
	const rows = await db
		.update(MerchProducts)
		.set(values)
		.where(eq(MerchProducts.id, id))
		.returning();
	if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Product not found.');
}

export async function setMerchProductActive(db: WattsDb, id: string, active: boolean): Promise<void> {
	const rows = await db
		.update(MerchProducts)
		.set({ active })
		.where(eq(MerchProducts.id, id))
		.returning();
	if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Product not found.');
}

/** Refused (FK restrict) once any of its sizes is in an order — hide it instead. */
export async function deleteMerchProduct(db: WattsDb, id: string): Promise<void> {
	try {
		await db.delete(MerchProducts).where(eq(MerchProducts.id, id));
	} catch (e) {
		if (pgError(e).code === '23503') {
			throw new DomainError('CONFLICT', 'This product is in orders — hide it instead of deleting it.');
		}
		throw e;
	}
}

/** Saves products' display order: `ids` in the new order. One statement. */
export async function reorderMerchProducts(db: WattsDb, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const values = sql.join(
		ids.map((id, i) => sql`(${id}::uuid, ${i}::int)`),
		sql`, `,
	);
	await run(
		db,
		sql`update merch_products p set sort_order = o.pos, updated_at = now()
			from (values ${values}) as o (id, pos) where p.id = o.id`,
	);
}

export interface MerchVariantInput {
	label: string;
	stock: number;
}

function checkVariant(input: MerchVariantInput) {
	const label = input.label.trim();
	if (!label) throw new DomainError('BAD_REQUEST', 'Give the size a label, like “M”.');
	if (label.length > 24) throw new DomainError('BAD_REQUEST', 'A size label can be at most 24 characters.');
	if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 10_000) {
		throw new DomainError('BAD_REQUEST', 'Stock must be a whole number from 0 to 10,000.');
	}
	return { label, stock: input.stock };
}

function variantWriteError(e: unknown): never {
	const { code, constraint } = pgError(e);
	if (code === '23514' && constraint === 'merch_variants_reserved_check') {
		throw new DomainError('CONFLICT', 'Stock can’t go below the number already in orders.');
	}
	if (code === '23505') throw new DomainError('CONFLICT', 'That size already exists for this product.');
	throw e;
}

export async function addMerchVariant(
	db: WattsDb,
	productId: string,
	input: MerchVariantInput,
): Promise<{ id: string }> {
	const values = checkVariant(input);
	try {
		const [row] = await db
			.insert(MerchVariants)
			.values({
				productId,
				...values,
				sortOrder: sql`(select coalesce(max(sort_order), -1) + 1 from merch_variants where product_id = ${productId}::uuid)`,
			})
			.returning();
		return { id: row!.id };
	} catch (e) {
		if (pgError(e).code === '23503') throw new DomainError('NOT_FOUND', 'Product not found.');
		variantWriteError(e);
	}
}

/** Stock below what's reserved is refused by the CHECK — race-safe against new orders. */
export async function updateMerchVariant(db: WattsDb, id: string, input: MerchVariantInput): Promise<void> {
	const values = checkVariant(input);
	let rows: unknown[];
	try {
		rows = await db
			.update(MerchVariants)
			.set(values)
			.where(eq(MerchVariants.id, id))
			.returning();
	} catch (e) {
		variantWriteError(e);
	}
	if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Size not found.');
}

/** Refused (FK restrict) once the size is in any order. */
export async function deleteMerchVariant(db: WattsDb, id: string): Promise<void> {
	try {
		await db.delete(MerchVariants).where(eq(MerchVariants.id, id));
	} catch (e) {
		if (pgError(e).code === '23503') {
			throw new DomainError('CONFLICT', 'This size is in orders — set its stock instead of deleting it.');
		}
		throw e;
	}
}

/** Sizes whose `reserved` disagrees with their live orders' items (should always be empty). */
export async function merchReservedDrift(db: WattsDb): Promise<{ variantId: string; reserved: number; counted: number }[]> {
	const rows = await db
		.select({
			variantId: MerchVariants.id,
			reserved: MerchVariants.reserved,
			counted: sql<number>`coalesce((
				select sum(i.quantity) from merch_order_items i
				join merch_orders o on o.id = i.order_id
				where i.variant_id = merch_variants.id and o.status not in ('denied', 'cancelled')
			), 0)::int`,
		})
		.from(MerchVariants);
	return rows.filter((r) => r.reserved !== r.counted);
}

