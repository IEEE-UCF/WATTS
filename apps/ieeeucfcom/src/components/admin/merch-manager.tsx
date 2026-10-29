'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
	Table,
	TableBody,
	TableCell,
	TableEmpty,
	TableHead,
	TableHeader,
	TableRow,
} from '@watts/ui/table';
import { TogglePill } from '@/components/ui/toggle-pill';
import {
	AssetPreview,
	Banner,
	buttonClass,
	fieldClass,
	primaryButtonClass,
	UploadButton,
} from '@/components/admin/site-content/shared';
import {
	formatDate,
	formatPrice,
	StatusBadge,
	STATUS_LABEL,
	type MerchStatus,
} from '@/components/merch/merch-shared';
import type { MerchProductView } from '@watts/core/merch';

type Flash = { kind: 'ok' | 'err'; text: string } | null;
type Filter = MerchStatus | 'closed' | 'all';

/** /admin/merch — the order queue and the catalog editor. */
export function MerchManager() {
	const [tab, setTab] = useState<'orders' | 'catalog'>('orders');
	return (
		<div className="flex flex-col gap-5">
			<div role="tablist" aria-label="Merch sections" className="flex gap-2">
				<TogglePill
					role="tab"
					aria-selected={tab === 'orders'}
					size="pill"
					selected={tab === 'orders'}
					onClick={() => setTab('orders')}
				>
					Orders
				</TogglePill>
				<TogglePill
					role="tab"
					aria-selected={tab === 'catalog'}
					size="pill"
					selected={tab === 'catalog'}
					onClick={() => setTab('catalog')}
				>
					Catalog
				</TogglePill>
			</div>
			{tab === 'orders' ? <OrdersTab /> : <CatalogTab />}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** The buttons each stage offers. `confirm` asks first; `note` asks for a note for the buyer. */
const ACTIONS: Record<
	MerchStatus,
	{
		to: MerchStatus;
		label: string;
		primary?: boolean;
		danger?: boolean;
		confirm?: string;
		note?: boolean;
	}[]
> = {
	requested: [
		{ to: 'approved', label: 'Approve', primary: true },
		{
			to: 'denied',
			label: 'Deny',
			danger: true,
			confirm: 'Deny this request? Its shirts go back into stock.',
			note: true,
		},
	],
	approved: [
		{ to: 'paid', label: 'Mark paid', primary: true },
		{
			to: 'cancelled',
			label: 'Cancel',
			danger: true,
			confirm: 'Cancel this approved order? Its shirts go back into stock.',
			note: true,
		},
		{ to: 'requested', label: 'Undo' },
	],
	paid: [
		{ to: 'delivered', label: 'Mark delivered', primary: true },
		{ to: 'approved', label: 'Undo' },
	],
	delivered: [{ to: 'paid', label: 'Undo' }],
	denied: [],
	cancelled: [],
};

const FILTERS: Filter[] = ['requested', 'approved', 'paid', 'delivered', 'closed', 'all'];

function OrdersTab() {
	const utils = trpc.useUtils();
	const [filter, setFilter] = useState<Filter>('requested');
	const [flash, setFlash] = useState<Flash>(null);
	const list = trpc.merch.listOrders.useQuery(filter === 'all' ? {} : { status: filter });
	const catalog = trpc.merch.catalog.useQuery();
	const move = trpc.merch.moveOrder.useMutation({
		onSuccess: () => void utils.merch.invalidate(),
		onError: (e) => {
			setFlash({ kind: 'err', text: e.message });
			void utils.merch.invalidate();
		},
	});

	const counts = list.data?.counts;
	const countFor = (f: Filter) =>
		!counts
			? null
			: f === 'all'
				? null
				: f === 'closed'
					? counts.denied + counts.cancelled
					: counts[f];

	function act(orderId: string, from: MerchStatus, a: (typeof ACTIONS)[MerchStatus][number]) {
		if (a.confirm && !window.confirm(a.confirm)) return;
		let officerNote: string | null = null;
		if (a.note) {
			const n = window.prompt('Note for the buyer (optional):', '');
			if (n === null) return;
			officerNote = n.trim() || null;
		}
		setFlash(null);
		move.mutate({ orderId, from, to: a.to, officerNote });
	}

	return (
		<div className="flex flex-col gap-4">
			{flash && <Banner kind={flash.kind} text={flash.text} onClose={() => setFlash(null)} />}

			{catalog.data && catalog.data.length > 0 && (
				<section aria-label="Stock left" className="grid gap-3 md:grid-cols-2">
					{catalog.data.map((p) => (
						<div
							key={p.id}
							className="rounded-xl border border-border bg-card/60 px-4 py-3"
						>
							<p className="mb-2 text-sm font-semibold">
								{p.name}{' '}
								<span className="font-normal text-muted-foreground">
									· left / stock{p.active ? '' : ' · hidden'}
								</span>
							</p>
							<div className="flex flex-wrap gap-2 text-xs">
								{p.variants.map((v) => (
									<span
										key={v.id}
										className={
											v.soldOut
												? 'rounded-md border border-red-400/35 bg-red-500/10 px-2.5 py-1 text-red-300'
												: 'rounded-md border border-border bg-zinc-900 px-2.5 py-1'
										}
									>
										{v.label} {v.left}/{v.stock}
										{v.soldOut ? ' · sold out' : ''}
									</span>
								))}
							</div>
						</div>
					))}
				</section>
			)}

			<div role="group" aria-label="Filter by stage" className="flex flex-wrap gap-2">
				{FILTERS.map((f) => {
					const n = countFor(f);
					return (
						<TogglePill
							key={f}
							size="pill"
							tone="brand-outline"
							selected={filter === f}
							aria-pressed={filter === f}
							onClick={() => setFilter(f)}
						>
							{f === 'all' ? 'All' : f === 'closed' ? 'Closed' : STATUS_LABEL[f]}
							{n != null && <span className="ml-1.5 font-semibold">{n}</span>}
						</TogglePill>
					);
				})}
			</div>

			<div className="overflow-x-auto rounded-xl border border-border bg-card/60">
				<Table className="min-w-[860px] text-sm">
					<TableHeader className="text-left text-xs tracking-wider text-muted-foreground uppercase">
						<tr>
							<TableHead>Buyer</TableHead>
							<TableHead>Items</TableHead>
							<TableHead>Total</TableHead>
							<TableHead>Stage</TableHead>
							<TableHead>Placed</TableHead>
							<TableHead className="text-right">Action</TableHead>
						</tr>
					</TableHeader>
					<TableBody>
						{list.isLoading ? (
							<TableEmpty colSpan={6}>Loading…</TableEmpty>
						) : (list.data?.orders.length ?? 0) === 0 ? (
							<TableEmpty colSpan={6}>No orders here.</TableEmpty>
						) : (
							list.data!.orders.map((o) => {
								const status = o.status as MerchStatus;
								return (
									<TableRow key={o.id} className="align-top">
										<TableCell>
											<div className="font-semibold">
												{o.buyerName || 'No name'}
											</div>
											<div className="text-xs text-muted-foreground">
												{o.buyerEmail}
											</div>
										</TableCell>
										<TableCell>
											{o.items.map((i) => (
												<div key={i.id}>
													{i.productName} · {i.variantLabel} ×{i.quantity}
												</div>
											))}
											{o.note && (
												<div className="text-xs text-muted-foreground italic">
													“{o.note}”
												</div>
											)}
											{o.officerNote && (
												<div className="text-xs text-muted-foreground">
													Officer note: “{o.officerNote}”
												</div>
											)}
										</TableCell>
										<TableCell className="font-semibold">
											{formatPrice(o.totalCents)}
										</TableCell>
										<TableCell>
											<StatusBadge status={status} />
										</TableCell>
										<TableCell className="whitespace-nowrap text-muted-foreground">
											{formatDate(o.createdAt)}
										</TableCell>
										<TableCell className="text-right whitespace-nowrap">
											<div className="inline-flex gap-1.5">
												{ACTIONS[status].map((a) => (
													<button
														key={a.to}
														type="button"
														disabled={move.isPending}
														onClick={() => act(o.id, status, a)}
														className={
															a.primary
																? 'rounded-md bg-ieee-dark-yellow px-3 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50'
																: a.danger
																	? 'rounded-md border border-red-400/50 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-300 disabled:opacity-50'
																	: buttonClass
														}
													>
														{a.label}
													</button>
												))}
												{ACTIONS[status].length === 0 && (
													<span className="text-muted-foreground">—</span>
												)}
											</div>
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>
			<p className="text-xs text-muted-foreground">
				Undo steps an order back one stage (for misclicks). If someone else changed an order
				at the same time, you&apos;ll see a message and the list refreshes.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

function CatalogTab() {
	const utils = trpc.useUtils();
	const catalog = trpc.merch.catalog.useQuery();
	const [editing, setEditing] = useState<string | 'new' | null>(null);
	const [flash, setFlash] = useState<Flash>(null);
	const onError = (e: { message: string }) => setFlash({ kind: 'err', text: e.message });
	const refresh = () => void utils.merch.invalidate();

	const setActive = trpc.merch.setProductActive.useMutation({ onSuccess: refresh, onError });
	const remove = trpc.merch.deleteProduct.useMutation({ onSuccess: refresh, onError });
	const reorder = trpc.merch.reorderProducts.useMutation({ onSuccess: refresh, onError });

	const products = catalog.data ?? [];
	function move(i: number, d: -1 | 1) {
		const ids = products.map((p) => p.id);
		const j = i + d;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j]!, ids[i]!];
		reorder.mutate({ ids });
	}

	return (
		<div className="flex flex-col gap-4">
			{flash && <Banner kind={flash.kind} text={flash.text} onClose={() => setFlash(null)} />}
			<div className="flex justify-end">
				<button
					type="button"
					className={primaryButtonClass}
					onClick={() => setEditing('new')}
					disabled={editing === 'new'}
				>
					+ New product
				</button>
			</div>

			{editing === 'new' && (
				<ProductEditor
					onDone={(id, msg) => {
						setFlash({ kind: 'ok', text: msg });
						setEditing(id);
					}}
					onCancel={() => setEditing(null)}
				/>
			)}

			{products.map((p, i) => (
				<div key={p.id} className="flex flex-col gap-3">
					<article className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/60 px-4 py-3">
						<div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-900">
							{p.imageUrl ? (
								<AssetPreview
									asset={{ url: p.imageUrl, kind: 'image' }}
									className="size-16"
								/>
							) : (
								<span className="text-xs text-muted-foreground">No photo</span>
							)}
						</div>
						<div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
							<span className="font-semibold">
								{p.name}{' '}
								<span
									className={
										p.active
											? 'ml-1 text-xs text-green-400'
											: 'ml-1 text-xs text-muted-foreground'
									}
								>
									{p.active ? 'Visible' : 'Hidden'}
								</span>
							</span>
							<span className="text-sm text-muted-foreground">
								{formatPrice(p.priceCents)} ·{' '}
								{p.variants
									.map((v) => `${v.label} ${v.left}/${v.stock}`)
									.join(' · ') || 'no sizes yet'}
							</span>
						</div>
						<div className="flex flex-wrap gap-1.5">
							<button
								type="button"
								className={buttonClass}
								aria-label={`Move ${p.name} up`}
								disabled={i === 0}
								onClick={() => move(i, -1)}
							>
								↑
							</button>
							<button
								type="button"
								className={buttonClass}
								aria-label={`Move ${p.name} down`}
								disabled={i === products.length - 1}
								onClick={() => move(i, 1)}
							>
								↓
							</button>
							<button
								type="button"
								className={buttonClass}
								onClick={() => setEditing(editing === p.id ? null : p.id)}
							>
								{editing === p.id ? 'Close' : 'Edit'}
							</button>
							<button
								type="button"
								className={buttonClass}
								onClick={() => setActive.mutate({ id: p.id, active: !p.active })}
							>
								{p.active ? 'Hide' : 'Show'}
							</button>
							<button
								type="button"
								className="rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-300 hover:border-red-300"
								onClick={() => {
									if (window.confirm(`Delete ${p.name}? This can't be undone.`))
										remove.mutate({ id: p.id });
								}}
							>
								Delete
							</button>
						</div>
					</article>
					{editing === p.id && (
						<ProductEditor
							product={p}
							onDone={(_id, msg) => setFlash({ kind: 'ok', text: msg })}
							onCancel={() => setEditing(null)}
						/>
					)}
				</div>
			))}
			{catalog.isSuccess && products.length === 0 && editing !== 'new' && (
				<p className="text-sm text-muted-foreground">No products yet.</p>
			)}
		</div>
	);
}

function ProductEditor({
	product,
	onDone,
	onCancel,
}: {
	product?: MerchProductView;
	onDone: (id: string, message: string) => void;
	onCancel: () => void;
}) {
	const utils = trpc.useUtils();
	const [name, setName] = useState(product?.name ?? '');
	const [description, setDescription] = useState(product?.description ?? '');
	const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : '15.00');
	const [active, setActive] = useState(product?.active ?? true);
	const [image, setImage] = useState<{ id: string; url: string } | null>(
		product?.imageAssetId && product.imageUrl
			? { id: product.imageAssetId, url: product.imageUrl }
			: null,
	);
	const [error, setError] = useState<string | null>(null);

	const onSuccess = (id: string) => {
		void utils.merch.invalidate();
		onDone(id, product ? 'Saved.' : 'Product created — now add its sizes.');
	};
	const create = trpc.merch.createProduct.useMutation({
		onSuccess: (r) => r && onSuccess(r.id),
		onError: (e) => setError(e.message),
	});
	const update = trpc.merch.updateProduct.useMutation({
		onSuccess: () => onSuccess(product!.id),
		onError: (e) => setError(e.message),
	});

	function save(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		const cents = Math.round(Number(price) * 100);
		if (!Number.isFinite(cents)) return setError('Enter a price like 15.00');
		const input = {
			name,
			description: description || null,
			priceCents: cents,
			imageAssetId: image?.id ?? null,
			active,
		};
		if (product) update.mutate({ id: product.id, ...input });
		else create.mutate(input);
	}

	return (
		<form
			onSubmit={save}
			className="flex flex-col gap-5 rounded-xl border border-ieee-dark-yellow bg-card/60 p-5"
		>
			<h3 className="text-base font-bold">
				{product ? `Editing: ${product.name}` : 'New product'}
			</h3>
			<div className="flex flex-wrap gap-6">
				<div className="flex w-48 flex-col gap-2">
					<span className="text-sm font-medium">Photo</span>
					<div className="flex size-48 items-center justify-center overflow-hidden rounded-lg bg-zinc-900">
						{image ? (
							<AssetPreview
								asset={{ url: image.url, kind: 'image' }}
								className="size-48"
							/>
						) : (
							<span className="text-xs text-muted-foreground">No photo</span>
						)}
					</div>
					<UploadButton
						label={image ? 'Replace photo' : 'Upload photo'}
						options={{ mediaKind: 'image', purpose: 'merch-image', alt: name || null }}
						onUploaded={setImage}
					/>
				</div>
				<div className="flex min-w-0 flex-1 basis-80 flex-col gap-4">
					<label className="flex flex-col gap-1.5 text-sm font-medium">
						Name
						<input
							className={fieldClass}
							value={name}
							maxLength={120}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-sm font-medium">
						Description
						<textarea
							className={fieldClass}
							rows={2}
							maxLength={1000}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</label>
					<div className="flex flex-wrap items-end gap-5">
						<label className="flex flex-col gap-1.5 text-sm font-medium">
							Price ($)
							<input
								className={`${fieldClass} w-32`}
								inputMode="decimal"
								value={price}
								onChange={(e) => setPrice(e.target.value)}
							/>
						</label>
						<label className="flex min-h-10 items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={active}
								onChange={(e) => setActive(e.target.checked)}
								className="size-4 accent-ieee-dark-yellow"
							/>
							Visible in the store
						</label>
					</div>
					{product && <SizesEditor product={product} />}
				</div>
			</div>
			{error && (
				<p role="alert" className="text-sm text-red-400">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2 border-t border-border pt-4">
				<button type="button" className={buttonClass} onClick={onCancel}>
					{product ? 'Close' : 'Cancel'}
				</button>
				<button
					type="submit"
					className={primaryButtonClass}
					disabled={create.isPending || update.isPending}
				>
					{product ? 'Save & publish' : 'Create product'}
				</button>
			</div>
		</form>
	);
}

/** Sizes and stock for one product. Each row saves on its own. */
function SizesEditor({ product }: { product: MerchProductView }) {
	const utils = trpc.useUtils();
	const [error, setError] = useState<string | null>(null);
	const [newLabel, setNewLabel] = useState('');
	const [newStock, setNewStock] = useState('0');
	const opts = {
		onSuccess: () => {
			setError(null);
			void utils.merch.invalidate();
		},
		onError: (e: { message: string }) => setError(e.message),
	};
	const add = trpc.merch.addVariant.useMutation({
		...opts,
		onSuccess: () => {
			opts.onSuccess();
			setNewLabel('');
			setNewStock('0');
		},
	});
	const remove = trpc.merch.deleteVariant.useMutation(opts);

	return (
		<div className="flex flex-col gap-2">
			<span className="text-sm font-medium">Sizes &amp; stock</span>
			<div className="overflow-x-auto rounded-lg border border-border">
				<Table className="min-w-[480px] text-sm">
					<TableHeader className="text-left text-xs tracking-wider text-muted-foreground uppercase">
						<tr>
							<TableHead>Size</TableHead>
							<TableHead>Stock</TableHead>
							<TableHead>In orders</TableHead>
							<TableHead>Left</TableHead>
							<TableHead>
								<span className="sr-only">Actions</span>
							</TableHead>
						</tr>
					</TableHeader>
					<TableBody>
						{product.variants.map((v) => (
							<VariantRow
								key={`${v.id}:${v.label}:${v.stock}`}
								variant={v}
								onError={setError}
								onRemove={() => {
									if (window.confirm(`Remove size ${v.label}?`))
										remove.mutate({ id: v.id });
								}}
							/>
						))}
						<TableRow>
							<TableCell>
								<input
									aria-label="New size label"
									placeholder="e.g. 2XL"
									className={`${fieldClass} w-20`}
									value={newLabel}
									maxLength={24}
									onChange={(e) => setNewLabel(e.target.value)}
								/>
							</TableCell>
							<TableCell>
								<input
									aria-label="New size stock"
									type="number"
									min={0}
									className={`${fieldClass} w-24`}
									value={newStock}
									onChange={(e) => setNewStock(e.target.value)}
								/>
							</TableCell>
							<TableCell colSpan={2} />
							<TableCell className="text-right">
								<button
									type="button"
									className={buttonClass}
									disabled={!newLabel.trim() || add.isPending}
									onClick={() =>
										add.mutate({
											productId: product.id,
											label: newLabel,
											stock: Number(newStock) || 0,
										})
									}
								>
									+ Add size
								</button>
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</div>
			{error && (
				<p role="alert" className="text-sm text-red-400">
					{error}
				</p>
			)}
			<p className="text-xs text-muted-foreground">
				Stock can&apos;t go below “In orders”. A size that&apos;s been ordered can&apos;t be
				deleted — set its stock instead.
			</p>
		</div>
	);
}

function VariantRow({
	variant,
	onError,
	onRemove,
}: {
	variant: MerchProductView['variants'][number];
	onError: (msg: string) => void;
	onRemove: () => void;
}) {
	const utils = trpc.useUtils();
	const [label, setLabel] = useState(variant.label);
	const [stock, setStock] = useState(String(variant.stock));
	const dirty = label !== variant.label || stock !== String(variant.stock);
	const save = trpc.merch.updateVariant.useMutation({
		onSuccess: () => void utils.merch.invalidate(),
		onError: (e) => onError(e.message),
	});

	return (
		<TableRow>
			<TableCell>
				<input
					aria-label="Size label"
					className={`${fieldClass} w-20`}
					value={label}
					maxLength={24}
					onChange={(e) => setLabel(e.target.value)}
				/>
			</TableCell>
			<TableCell>
				<input
					aria-label={`Stock for ${variant.label}`}
					type="number"
					min={0}
					className={`${fieldClass} w-24`}
					value={stock}
					onChange={(e) => setStock(e.target.value)}
				/>
			</TableCell>
			<TableCell className="text-muted-foreground">{variant.reserved}</TableCell>
			<TableCell className={variant.soldOut ? 'font-semibold text-red-300' : undefined}>
				{variant.left}
				{variant.soldOut ? ' · Sold out' : ''}
			</TableCell>
			<TableCell className="text-right whitespace-nowrap">
				<div className="inline-flex gap-1.5">
					{dirty && (
						<button
							type="button"
							className={primaryButtonClass}
							disabled={save.isPending}
							onClick={() =>
								save.mutate({ id: variant.id, label, stock: Number(stock) || 0 })
							}
						>
							Save
						</button>
					)}
					<button
						type="button"
						aria-label={`Remove size ${variant.label}`}
						className={buttonClass}
						onClick={onRemove}
					>
						×
					</button>
				</div>
			</TableCell>
		</TableRow>
	);
}
