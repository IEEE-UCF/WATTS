'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@watts/ui/dialog';
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@watts/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@watts/ui/select';
import { formatPrice } from '@/components/merch/merch-shared';
import type { MerchProductView as Product } from '@watts/core/merch';

export interface OrderLine {
	productId: string;
	variantId: string;
	quantity: number;
}

/** The "Request an order" form: one line per shirt + size, an optional note, the total. */
export function OrderDialog({
	products,
	paymentNote,
	maxQty,
	initialLine,
	onClose,
	onPlaced,
}: {
	products: Product[];
	paymentNote: string;
	maxQty: number;
	initialLine: OrderLine;
	onClose: () => void;
	onPlaced: () => void;
}) {
	const utils = trpc.useUtils();
	const [lines, setLines] = useState<OrderLine[]>([initialLine]);
	const [note, setNote] = useState('');
	const [error, setError] = useState<string | null>(null);

	const place = trpc.merch.placeOrder.useMutation({
		onSuccess: () => {
			void utils.merch.invalidate();
			onPlaced();
		},
		onError: (e) => {
			setError(e.message);
			// Stock may have moved under us — refresh what the pickers show.
			void utils.merch.storefront.invalidate();
		},
	});

	const productOf = (id: string) => products.find((p) => p.id === id);
	const variantOf = (line: OrderLine) =>
		productOf(line.productId)?.variants.find((v) => v.id === line.variantId);

	// Per-line problems, checked again by the server (which has the final say).
	const problems = lines.map((line) => {
		const v = variantOf(line);
		if (!v) return 'Pick a size.';
		if (v.soldOut) return `${v.label} is sold out — pick another size.`;
		if (line.quantity > v.left) return `Only ${v.left} left in ${v.label}.`;
		return null;
	});
	const dupes = new Set<string>();
	lines.forEach((l, i) => {
		if (lines.findIndex((o) => o.variantId === l.variantId) !== i) dupes.add(l.variantId);
	});
	const total = lines.reduce(
		(sum, l) => sum + (productOf(l.productId)?.priceCents ?? 0) * l.quantity,
		0,
	);
	const canSubmit = problems.every((p) => !p) && dupes.size === 0 && !place.isPending;

	function update(i: number, patch: Partial<OrderLine>) {
		setError(null);
		setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		place.mutate({
			items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
			note: note.trim() || null,
		});
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Request an order</DialogTitle>
					<DialogDescription>
						An officer reviews every request before you pay.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={submit} className="flex flex-col gap-5">
					<FieldSet className="gap-3">
						<FieldLegend variant="label">Items</FieldLegend>
						{lines.map((line, i) => {
							const product = productOf(line.productId);
							const variant = variantOf(line);
							const qtyMax = Math.max(1, Math.min(maxQty, variant?.left ?? 1));
							return (
								<div key={i} className="flex flex-col gap-1.5">
									<div className="grid grid-cols-[minmax(0,1fr)_6rem_4.5rem_2.75rem] items-end gap-2">
										<Field className="gap-1.5">
											<FieldLabel
												htmlFor={`shirt-${i}`}
												className={i > 0 ? 'sr-only' : undefined}
											>
												Shirt
											</FieldLabel>
											<Select
												value={line.productId}
												onValueChange={(productId) =>
													update(i, {
														productId,
														variantId:
															productOf(productId)?.variants.find(
																(v) => !v.soldOut,
															)?.id ?? '',
														quantity: 1,
													})
												}
											>
												<SelectTrigger
													id={`shirt-${i}`}
													className="h-11 w-full"
												>
													<SelectValue placeholder="Pick a shirt" />
												</SelectTrigger>
												<SelectContent>
													{products.map((p) => (
														<SelectItem
															key={p.id}
															value={p.id}
															disabled={p.variants.every(
																(v) => v.soldOut,
															)}
														>
															{p.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
										<Field
											className="gap-1.5"
											data-invalid={problems[i] ? true : undefined}
										>
											<FieldLabel
												htmlFor={`size-${i}`}
												className={i > 0 ? 'sr-only' : undefined}
											>
												Size
											</FieldLabel>
											<Select
												value={line.variantId || undefined}
												onValueChange={(variantId) =>
													update(i, { variantId, quantity: 1 })
												}
											>
												<SelectTrigger
													id={`size-${i}`}
													className="h-11 w-full"
													aria-invalid={Boolean(problems[i])}
												>
													<SelectValue placeholder="Size" />
												</SelectTrigger>
												<SelectContent>
													{product?.variants.map((v) => (
														<SelectItem
															key={v.id}
															value={v.id}
															disabled={v.soldOut}
														>
															{v.soldOut
																? `${v.label} — Sold out`
																: v.left <= 3
																	? `${v.label} — only ${v.left} left`
																	: v.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
										<Field className="gap-1.5">
											<FieldLabel
												htmlFor={`qty-${i}`}
												className={i > 0 ? 'sr-only' : undefined}
											>
												Qty
											</FieldLabel>
											<Select
												value={String(line.quantity)}
												onValueChange={(q) =>
													update(i, { quantity: Number(q) })
												}
											>
												<SelectTrigger
													id={`qty-${i}`}
													className="h-11 w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{Array.from(
														{ length: qtyMax },
														(_, n) => n + 1,
													).map((n) => (
														<SelectItem key={n} value={String(n)}>
															{n}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
										<button
											type="button"
											aria-label="Remove this shirt"
											disabled={lines.length === 1}
											onClick={() =>
												setLines((ls) => ls.filter((_, j) => j !== i))
											}
											className="flex size-11 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-foreground disabled:opacity-30"
										>
											×
										</button>
									</div>
									{problems[i] && <FieldError>{problems[i]}</FieldError>}
									{!problems[i] && dupes.has(line.variantId) && i > 0 && (
										<FieldError>
											That size is already in this order — change the quantity
											above instead.
										</FieldError>
									)}
								</div>
							);
						})}
						<button
							type="button"
							onClick={() => {
								const p = products.find((x) => x.variants.some((v) => !v.soldOut));
								if (!p) return;
								setLines((ls) => [
									...ls,
									{
										productId: p.id,
										variantId: p.variants.find((v) => !v.soldOut)!.id,
										quantity: 1,
									},
								]);
							}}
							disabled={lines.length >= 6}
							className="min-h-11 self-start text-sm font-semibold text-ieee-dark-yellow hover:underline disabled:opacity-40"
						>
							+ Add another shirt
						</button>
					</FieldSet>

					<Field className="gap-1.5">
						<FieldLabel htmlFor="order-note">
							Note for officers{' '}
							<span className="font-normal text-muted-foreground">(optional)</span>
						</FieldLabel>
						<textarea
							id="order-note"
							rows={2}
							maxLength={500}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="e.g. I can pick up after Thursday’s GBM"
							className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm dark:bg-input/30"
						/>
					</Field>

					<p className="rounded-lg border border-border bg-zinc-900/60 px-3.5 py-3 text-sm text-muted-foreground">
						{paymentNote}
					</p>

					{error && <FieldError>{error}</FieldError>}

					<DialogFooter className="items-center border-t border-border pt-4 sm:justify-between">
						<span className="text-sm text-muted-foreground">
							Total{' '}
							<strong className="ml-1 text-xl font-extrabold text-foreground">
								{formatPrice(total)}
							</strong>
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={onClose}
								className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:border-foreground"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={!canSubmit}
								className="min-h-11 rounded-lg bg-ieee-dark-yellow px-5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
							>
								{place.isPending ? 'Sending…' : 'Request order'}
							</button>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
