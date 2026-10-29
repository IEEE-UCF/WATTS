import { cn } from '@watts/ui/cn';

export type MerchStatus = 'requested' | 'approved' | 'paid' | 'delivered' | 'denied' | 'cancelled';

export const OPEN_STATUSES: MerchStatus[] = ['requested', 'approved', 'paid'];
export const STAGES = ['requested', 'approved', 'paid', 'delivered'] as const;

export const STATUS_LABEL: Record<MerchStatus, string> = {
	requested: 'Requested',
	approved: 'Approved',
	paid: 'Paid',
	delivered: 'Delivered',
	denied: 'Denied',
	cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<MerchStatus, string> = {
	requested: 'border-zinc-500 bg-zinc-800/60 text-zinc-200',
	approved: 'border-blue-400/40 bg-blue-500/15 text-blue-300',
	paid: 'border-ieee-dark-yellow/45 bg-ieee-dark-yellow/15 text-ieee-bright-yellow',
	delivered: 'border-green-400/40 bg-green-500/15 text-green-300',
	denied: 'border-red-400/40 bg-red-500/15 text-red-300',
	cancelled: 'border-zinc-600 bg-zinc-900 text-zinc-400',
};

export function formatPrice(cents: number) {
	return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function formatDate(d: Date | string | null | undefined) {
	if (!d) return '';
	return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function StatusBadge({ status, className }: { status: MerchStatus; className?: string }) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
				STATUS_CLASS[status],
				className,
			)}
		>
			{STATUS_LABEL[status]}
		</span>
	);
}

/** Drawn shirt for a product with no photo yet. Decorative. */
export function ShirtPlaceholder({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 200 200" aria-hidden="true" className={className}>
			<path
				d="M62 32 L86 20 Q100 36 114 20 L138 32 L176 62 L156 88 L140 78 L140 182 L60 182 L60 78 L44 88 L24 62 Z"
				fill="#1c1c1c"
				stroke="#3a3a3a"
				strokeWidth="2"
			/>
			<rect
				x="112"
				y="56"
				width="16"
				height="16"
				transform="rotate(45 120 64)"
				fill="var(--color-ieee-dark-yellow)"
			/>
		</svg>
	);
}

/** Product photo (plain <img>: these are small, and it skips the image optimizer's cost). */
export function ProductImage({
	url,
	alt,
	className,
}: {
	url: string | null;
	alt: string;
	className?: string;
}) {
	if (!url) return <ShirtPlaceholder className={cn('h-3/4 w-3/4', className)} />;
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={url}
			alt={alt}
			loading="lazy"
			className={cn('h-full w-full object-contain', className)}
		/>
	);
}

/** Requested · Approved · Paid · Delivered, with the order's dates under each step. */
export function OrderProgress({
	order,
}: {
	order: {
		status: MerchStatus;
		createdAt: Date | string;
		approvedAt: Date | string | null;
		paidAt: Date | string | null;
		deliveredAt: Date | string | null;
	};
}) {
	const dates = [order.createdAt, order.approvedAt, order.paidAt, order.deliveredAt];
	const reached = STAGES.indexOf(order.status as (typeof STAGES)[number]);
	return (
		<ol aria-label="Order progress" className="grid grid-cols-4">
			{STAGES.map((stage, i) => {
				const done = i <= reached;
				const next = i === reached + 1;
				return (
					<li
						key={stage}
						className="flex flex-col gap-1.5"
						aria-current={i === reached ? 'step' : undefined}
					>
						<div className="flex items-center">
							<span
								className={cn(
									'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
									done
										? 'bg-ieee-dark-yellow text-black'
										: next
											? 'border-2 border-ieee-dark-yellow text-ieee-dark-yellow'
											: 'border-2 border-zinc-700 text-zinc-500',
								)}
							>
								{done ? '✓' : i + 1}
							</span>
							{i < STAGES.length - 1 && (
								<span
									className={cn(
										'h-0.5 flex-1',
										i < reached ? 'bg-ieee-dark-yellow' : 'bg-zinc-800',
									)}
								/>
							)}
						</div>
						<span
							className={cn(
								'text-xs font-semibold sm:text-sm',
								next
									? 'text-ieee-dark-yellow'
									: done
										? 'text-foreground'
										: 'text-muted-foreground',
							)}
						>
							{STATUS_LABEL[stage]}
						</span>
						<span className="text-xs text-muted-foreground">
							{done ? formatDate(dates[i]) : next ? 'Next step' : '—'}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

/** "Jet Black M ×1 · Graphite L ×2" */
export function itemsSummary(
	items: { productName: string; variantLabel: string; quantity: number }[],
) {
	return items.map((i) => `${i.productName} · ${i.variantLabel} ×${i.quantity}`).join(', ');
}
