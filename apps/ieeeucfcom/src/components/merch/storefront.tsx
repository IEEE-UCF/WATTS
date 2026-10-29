'use client';

import { useState } from 'react';
import type { MerchImageView } from '@watts/core/merch';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@watts/ui/cn';
import { Banner } from '@/components/admin/site-content/shared';
import { OrderDialog, type OrderLine } from '@/components/merch/order-dialog';
import {
	formatDate,
	formatPrice,
	itemsSummary,
	OPEN_STATUSES,
	OrderProgress,
	ProductImage,
	StatusBadge,
	type MerchStatus,
} from '@/components/merch/merch-shared';

const STEPS = [
	'Request a size here',
	'An officer approves it',
	'Pay an officer in person',
	'Pick up your shirt',
];

/** /merch — the product grid, the order form, and the viewer's own orders. */
export function Storefront() {
	const utils = trpc.useUtils();
	const store = trpc.merch.storefront.useQuery();
	const orders = trpc.merch.myOrders.useQuery();
	const cancel = trpc.merch.cancelMyOrder.useMutation({
		onSuccess: () => {
			setBanner({ kind: 'ok', text: 'Request cancelled.' });
			void utils.merch.invalidate();
		},
		onError: (e) => {
			setBanner({ kind: 'err', text: e.message });
			void utils.merch.invalidate();
		},
	});

	const [picked, setPicked] = useState<Record<string, string>>({});
	const [dialogLine, setDialogLine] = useState<OrderLine | null>(null);
	const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const products = store.data?.products ?? [];
	const openOrder = orders.data?.find((o) => OPEN_STATUSES.includes(o.status as MerchStatus));

	return (
		<div className="flex flex-col gap-7">
			<div className="flex flex-col gap-2">
				<h1 className="font-heading text-3xl text-ieee-dark-yellow">Merch store</h1>
				<p className="max-w-2xl text-sm text-muted-foreground">
					Request a shirt here, then pay an officer in person once it&apos;s approved.
					Orders are only taken on this page while you&apos;re signed in.
				</p>
			</div>

			{banner && (
				<Banner kind={banner.kind} text={banner.text} onClose={() => setBanner(null)} />
			)}

			<ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{STEPS.map((step, i) => (
					<li
						key={step}
						className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-sm"
					>
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ieee-dark-yellow text-xs font-extrabold text-black">
							{i + 1}
						</span>
						{step}
					</li>
				))}
			</ol>

			{store.isLoading ? (
				<p className="text-sm text-muted-foreground">Loading the store…</p>
			) : products.length === 0 ? (
				<p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
					Nothing is for sale right now — check back soon.
				</p>
			) : (
				<section aria-label="Products" className="grid gap-5 md:grid-cols-2">
					{products.map((p) => {
						const allSoldOut = p.variants.every((v) => v.soldOut);
						const pickedId = picked[p.id];
						const lowStock = p.variants.filter((v) => !v.soldOut && v.left <= 3);
						return (
							<article
								key={p.id}
								className="flex flex-col overflow-hidden rounded-xl border border-border bg-card/60 shadow-lg shadow-black/40"
							>
								<ProductGallery
									images={p.images}
									name={p.name}
									soldOut={allSoldOut}
								/>
								<div className="flex flex-1 flex-col gap-3.5 p-5">
									<div className="flex items-baseline justify-between gap-3">
										<h2 className="text-lg font-bold">{p.name}</h2>
										<span className="text-xl font-extrabold text-ieee-dark-yellow">
											{formatPrice(p.priceCents)}
										</span>
									</div>
									{p.description && (
										<p className="text-sm text-muted-foreground">
											{p.description}
										</p>
									)}
									<fieldset className="flex flex-col gap-2">
										<legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
											Size
										</legend>
										<div className="flex flex-wrap gap-2">
											{p.variants.map((v) => (
												<button
													key={v.id}
													type="button"
													disabled={v.soldOut}
													aria-pressed={pickedId === v.id}
													title={
														v.soldOut
															? `${v.label} — Sold out`
															: undefined
													}
													onClick={() =>
														setPicked((s) => ({ ...s, [p.id]: v.id }))
													}
													className={cn(
														'min-h-11 min-w-14 rounded-lg px-3 text-sm font-semibold',
														v.soldOut
															? 'cursor-not-allowed border border-dashed border-zinc-700 text-zinc-500 line-through'
															: pickedId === v.id
																? 'border-2 border-ieee-dark-yellow bg-ieee-dark-yellow/15'
																: 'border border-zinc-700 hover:border-foreground',
													)}
												>
													{v.label}
												</button>
											))}
										</div>
										{(p.variants.some((v) => v.soldOut) ||
											lowStock.length > 0) && (
											<span className="text-xs text-muted-foreground">
												{[
													...p.variants
														.filter((v) => v.soldOut)
														.map((v) => `${v.label} — Sold out`),
													...lowStock.map(
														(v) => `${v.label} — only ${v.left} left`,
													),
												].join(' · ')}
											</span>
										)}
									</fieldset>
									<div className="mt-auto pt-1">
										{openOrder ? (
											<p className="rounded-lg border border-border px-3 py-2.5 text-center text-sm text-muted-foreground">
												You have an open order — see below.
											</p>
										) : (
											<button
												type="button"
												disabled={allSoldOut}
												onClick={() =>
													setDialogLine({
														productId: p.id,
														variantId:
															pickedId ??
															p.variants.find((v) => !v.soldOut)
																?.id ??
															'',
														quantity: 1,
													})
												}
												className="min-h-11 w-full rounded-lg bg-ieee-dark-yellow text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
											>
												Request order
											</button>
										)}
									</div>
								</div>
							</article>
						);
					})}
				</section>
			)}

			<section aria-labelledby="my-orders" className="flex flex-col gap-3">
				<h2 id="my-orders" className="text-xl font-bold">
					My orders
				</h2>
				{(orders.data ?? []).length === 0 ? (
					<p className="text-sm text-muted-foreground">No orders yet.</p>
				) : (
					orders.data!.map((o) => {
						const status = o.status as MerchStatus;
						const closed = status === 'denied' || status === 'cancelled';
						return (
							<article
								key={o.id}
								className={cn(
									'flex flex-col gap-4 rounded-xl border border-border p-5',
									closed ? 'opacity-75' : 'bg-card/60',
								)}
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="flex flex-col gap-1">
										<span className="text-xs text-muted-foreground">
											Placed {formatDate(o.createdAt)}
										</span>
										<span className="text-sm font-semibold">
											{itemsSummary(o.items)}
										</span>
										{o.officerNote && (
											<span className="text-xs text-muted-foreground">
												Officer note: “{o.officerNote}”
											</span>
										)}
									</div>
									<div className="flex items-center gap-3">
										{closed && <StatusBadge status={status} />}
										<span className="text-lg font-extrabold">
											{formatPrice(o.totalCents)}
										</span>
									</div>
								</div>
								{!closed && <OrderProgress order={{ ...o, status }} />}
								{status === 'approved' && (
									<p className="rounded-lg border border-ieee-dark-yellow/35 bg-ieee-dark-yellow/10 px-4 py-3 text-sm">
										Approved! Pay <strong>{formatPrice(o.totalCents)}</strong>{' '}
										to an officer (cash, Venmo or Zelle) at the next GBM or
										office hours. They&apos;ll mark it paid here.
									</p>
								)}
								{status === 'paid' && (
									<p className="text-sm text-muted-foreground">
										Paid — an officer will hand you your shirt.
									</p>
								)}
								{status === 'requested' && (
									<div>
										<button
											type="button"
											disabled={cancel.isPending}
											onClick={() => {
												if (window.confirm('Cancel this request?'))
													cancel.mutate({ orderId: o.id });
											}}
											className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:border-foreground disabled:opacity-50"
										>
											Cancel request
										</button>
									</div>
								)}
							</article>
						);
					})
				)}
			</section>

			{dialogLine && store.data && (
				<OrderDialog
					products={products}
					paymentNote={store.data.paymentNote}
					maxQty={store.data.maxQtyPerSize}
					initialLine={dialogLine}
					onClose={() => setDialogLine(null)}
					onPlaced={() => {
						setDialogLine(null);
						setBanner({
							kind: 'ok',
							text: 'Request sent! An officer will review it — check back here for updates.',
						});
					}}
				/>
			)}
		</div>
	);
}

/** The product's photos: the selected one large (with its label), thumbnails to switch. */
function ProductGallery({
	images,
	name,
	soldOut,
}: {
	images: MerchImageView[];
	name: string;
	soldOut: boolean;
}) {
	const [index, setIndex] = useState(0);
	const current = images[Math.min(index, images.length - 1)];
	return (
		<div className="flex flex-col bg-zinc-900">
			<div className="relative flex h-64 items-center justify-center">
				<ProductImage
					url={current?.url ?? null}
					alt={current?.label ? `${name} — ${current.label}` : name}
				/>
				{soldOut && (
					<span className="absolute top-3 left-3 rounded-md bg-red-500/90 px-2 py-0.5 text-xs font-bold text-white">
						Sold out
					</span>
				)}
				{current?.label && (
					<span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
						{current.label}
					</span>
				)}
			</div>
			{images.length > 1 && (
				<div className="flex gap-2 overflow-x-auto px-3 pb-3">
					{images.map((img, i) => (
						<button
							key={img.assetId}
							type="button"
							aria-label={img.label ? `Show ${img.label}` : `Show photo ${i + 1}`}
							aria-pressed={img === current}
							title={img.label ?? undefined}
							onClick={() => setIndex(i)}
							className={cn(
								'flex shrink-0 flex-col items-center gap-1 rounded-md p-1 text-[11px] text-muted-foreground',
								img === current
									? 'bg-ieee-dark-yellow/15 ring-2 ring-ieee-dark-yellow'
									: 'hover:bg-zinc-800',
							)}
						>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={img.url}
								alt=""
								loading="lazy"
								className="size-12 rounded object-cover"
							/>
							{img.label && <span className="max-w-16 truncate">{img.label}</span>}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
