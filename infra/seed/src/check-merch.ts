// Merch-store race + rule check against a LOCAL database. It creates its own throwaway
// product, sizes and test accounts (all named "merch-check …"), hammers them with
// concurrent orders and status changes through @watts/core/merch, prints PASS/FAIL per
// check, then deletes everything it made.
//
//   pnpm --filter @watts/seed check:merch
//
// Needs migration 0017 applied. Refuses a non-local DATABASE_URL.

import { loadRootEnv } from '@watts/config/load-env';
import { isDomainError } from '@watts/core/errors';
import {
	addMerchVariant,
	createMerchProduct,
	deleteMerchProduct,
	deleteMerchVariant,
	merchReservedDrift,
	moveMerchOrder,
	placeMerchOrder,
	setMerchProductActive,
	updateMerchVariant,
} from '@watts/core/merch';
import { createDb } from '@watts/db';
import { MerchOrders, MerchVariants, Users } from '@watts/db/schema';
import { eq, inArray, like } from 'drizzle-orm';

loadRootEnv();

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
const host = new URL(process.env.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
	console.error(`Refusing to run against a non-local database (${host}).`);
	process.exit(1);
}

const db = createDb({ url: process.env.DATABASE_URL, driver: 'postgres-js' });
const TAG = 'merch-check';
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
	if (!ok) failures++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
	try {
		return { ok: true, value: await p };
	} catch (error) {
		return { ok: false, error };
	}
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function reservedOf(variantId: string) {
	const [v] = await db.select().from(MerchVariants).where(eq(MerchVariants.id, variantId));
	return v!.reserved;
}

async function makeUsers(n: number): Promise<string[]> {
	const stamp = Date.now();
	const rows = await db
		.insert(Users)
		.values(Array.from({ length: n }, (_, i) => ({ name: `${TAG} ${i}`, email: `${TAG}-${stamp}-${i}@example.test` })))
		.returning();
	return rows.map((r) => r.id);
}

async function cleanup(productIds: string[]) {
	const users = await db.select({ id: Users.id }).from(Users).where(like(Users.email, `${TAG}-%`));
	if (users.length) {
		await db.delete(MerchOrders).where(
			inArray(
				MerchOrders.userId,
				users.map((u) => u.id),
			),
		);
		await db.delete(Users).where(
			inArray(
				Users.id,
				users.map((u) => u.id),
			),
		);
	}
	for (const id of productIds) await deleteMerchProduct(db, id);
}

async function main() {
	const products: string[] = [];
	try {
		const { id: productId } = await createMerchProduct(db, { name: `${TAG} shirt`, priceCents: 1500 });
		products.push(productId);
		const { id: small } = await addMerchVariant(db, productId, { label: 'S', stock: 1 });
		const { id: medium } = await addMerchVariant(db, productId, { label: 'M', stock: 5 });
		const users = await makeUsers(14);

		// 1. Ten buyers race for the last Small.
		const race = await Promise.all(
			users
				.slice(0, 10)
				.map((userId) =>
					settle(placeMerchOrder(db, { userId, memberId: null, items: [{ variantId: small, quantity: 1 }] })),
				),
		);
		const won = race.filter((r) => r.ok);
		const soldOut = race.filter((r) => !r.ok && isDomainError(r.error) && /sold out/i.test(r.error.message));
		check('10 buyers, 1 Small left: exactly one order succeeds', won.length === 1, `${won.length} succeeded`);
		check('…the other 9 are told it sold out', soldOut.length === 9, race.filter((r) => !r.ok).map((r) => !r.ok && msg(r.error))[0]);
		check('…and reserved == stock (1)', (await reservedOf(small)) === 1);
		const winnerOrderId = won[0]?.ok ? won[0].value.id : '';

		// 2. One buyer double-submits.
		const dup = await Promise.all([
			settle(placeMerchOrder(db, { userId: users[10]!, memberId: null, items: [{ variantId: medium, quantity: 1 }] })),
			settle(placeMerchOrder(db, { userId: users[10]!, memberId: null, items: [{ variantId: medium, quantity: 1 }] })),
		]);
		check(
			'Double-submit: one order, one "already have an open order"',
			dup.filter((r) => r.ok).length === 1 &&
				dup.some((r) => !r.ok && /open order/i.test(msg(r.error))),
		);
		check('…only one Medium reserved', (await reservedOf(medium)) === 1);

		// 3. Two sizes, one of them short → nothing written at all.
		const before = await reservedOf(medium);
		const partial = await settle(
			placeMerchOrder(db, {
				userId: users[11]!,
				memberId: null,
				items: [
					{ variantId: medium, quantity: 1 },
					{ variantId: small, quantity: 1 },
				],
			}),
		);
		check('Order with one sold-out size is refused', !partial.ok);
		check('…and the other size is not left reserved', (await reservedOf(medium)) === before);

		// 4. Approve and deny the same order at once.
		const moves = await Promise.all([
			settle(moveMerchOrder(db, { orderId: winnerOrderId, from: 'requested', to: 'approved', actorMemberId: null })),
			settle(moveMerchOrder(db, { orderId: winnerOrderId, from: 'requested', to: 'denied', actorMemberId: null })),
		]);
		const moveWins = moves.filter((r) => r.ok).length;
		check(
			'Approve vs deny race: exactly one wins, the other gets CONFLICT',
			moveWins === 1 && moves.some((r) => !r.ok && isDomainError(r.error) && r.error.code === 'CONFLICT'),
		);
		const [afterRace] = await db.select().from(MerchOrders).where(eq(MerchOrders.id, winnerOrderId));
		check(
			'…stock matches the winner',
			(await reservedOf(small)) === (afterRace!.status === 'denied' ? 0 : 1),
			`status ${afterRace!.status}`,
		);

		// 5. Deny frees stock; invalid move rejected.
		const { id: o2 } = await placeMerchOrder(db, {
			userId: users[12]!,
			memberId: null,
			items: [{ variantId: medium, quantity: 2 }],
		});
		const r0 = await reservedOf(medium);
		await moveMerchOrder(db, { orderId: o2, from: 'requested', to: 'denied', actorMemberId: null, officerNote: 'test' });
		check('Deny releases the order’s units', (await reservedOf(medium)) === r0 - 2);
		const bad = await settle(moveMerchOrder(db, { orderId: o2, from: 'denied', to: 'paid', actorMemberId: null }));
		check('Invalid move (denied → paid) is rejected', !bad.ok && /can’t go from/.test(msg(bad.error)));

		// 6. Buyer can cancel only their own, only while requested.
		const { id: o3 } = await placeMerchOrder(db, {
			userId: users[13]!,
			memberId: null,
			items: [{ variantId: medium, quantity: 1 }],
		});
		const stranger = await settle(
			moveMerchOrder(db, { orderId: o3, from: 'requested', to: 'cancelled', actorMemberId: null, buyerUserId: users[0]! }),
		);
		check('Another user can’t cancel someone’s order', !stranger.ok);
		const own = await settle(
			moveMerchOrder(db, { orderId: o3, from: 'requested', to: 'cancelled', actorMemberId: null, buyerUserId: users[13]! }),
		);
		check('Buyer cancels their own requested order', own.ok);

		// 7. Catalog guards.
		const lower = await settle(updateMerchVariant(db, small, { label: 'S', stock: 0 }));
		const smallReserved = await reservedOf(small);
		check(
			'Stock can’t go below reserved',
			smallReserved > 0 ? !lower.ok : lower.ok,
			smallReserved > 0 ? msg(!lower.ok ? lower.error : '') : 'nothing reserved, allowed',
		);
		const delUsed = await settle(deleteMerchVariant(db, medium));
		check('A size that’s in orders can’t be deleted', !delUsed.ok);
		await setMerchProductActive(db, productId, false);
		const hidden = await settle(
			placeMerchOrder(db, { userId: users[1]!, memberId: null, items: [{ variantId: medium, quantity: 1 }] }),
		);
		check('A hidden product can’t be ordered', !hidden.ok, msg(!hidden.ok ? hidden.error : ''));

		// 8. Bookkeeping never drifts.
		const drift = await merchReservedDrift(db);
		check('reserved matches live orders for every size', drift.length === 0, JSON.stringify(drift));
	} finally {
		await cleanup(products);
	}
	console.log(failures ? `\n${failures} check(s) failed` : '\nAll merch checks passed');
	process.exit(failures ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
