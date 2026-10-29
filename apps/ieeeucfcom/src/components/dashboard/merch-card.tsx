'use client';

import Link from 'next/link';
import { Card } from '@watts/ui/card';
import { trpc } from '@/lib/trpc/client';
import {
	OPEN_STATUSES,
	ShirtPlaceholder,
	StatusBadge,
	type MerchStatus,
} from '@/components/merch/merch-shared';

const NEXT_STEP: Partial<Record<MerchStatus, string>> = {
	requested: 'waiting for an officer',
	approved: 'pay an officer',
	paid: 'ready for pick-up',
};

/** "Merch store" button on the dashboard, plus the stage of the viewer's open order. */
export function MerchCard() {
	const { data: orders } = trpc.merch.myOrders.useQuery();
	const open = orders?.find((o) => OPEN_STATUSES.includes(o.status as MerchStatus));
	const status = open?.status as MerchStatus | undefined;

	return (
		<Card className="flex-row flex-wrap items-center gap-5 rounded-xl border-border bg-card/60 p-5 shadow-lg shadow-black/40">
			<div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-zinc-900">
				<ShirtPlaceholder className="size-14" />
			</div>
			<div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
				<h2 className="text-base font-bold">Merch store</h2>
				<p className="text-sm text-muted-foreground">
					IEEE UCF shirts — request a size, then pay an officer in person.
				</p>
				{status && (
					<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span className="font-semibold tracking-wider uppercase">Your order</span>
						<StatusBadge status={status} />
						<span>{NEXT_STEP[status]}</span>
					</p>
				)}
			</div>
			<Link
				href="/merch"
				className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-ieee-dark-yellow px-5 text-sm font-bold text-black hover:opacity-90"
			>
				Open merch store
			</Link>
		</Card>
	);
}
