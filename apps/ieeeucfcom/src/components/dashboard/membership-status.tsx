import { Card, CardTitle } from '@watts/ui/card';

export interface MembershipStatusProps {
	duesPaid: boolean;
	officerStatus: boolean;
	officerRole: string | null;
	memberSince: string;
}

/** Genuinely conditional, not a demo of two states — an unpaid member gets a "Pay dues"
 * affordance instead of the paid layout. */
export function MembershipStatus({
	duesPaid,
	officerStatus,
	officerRole,
	memberSince,
}: MembershipStatusProps) {
	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">Membership</CardTitle>
			<div className="flex flex-col gap-2 text-sm">
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Dues</span>
					{duesPaid ? (
						<span className="rounded-full bg-green-800/70 px-2.5 py-0.5 text-xs font-semibold text-green-300">
							Paid
						</span>
					) : (
						<span className="rounded-full border border-red-400 px-2.5 py-0.5 text-xs font-semibold text-red-400">
							Unpaid
						</span>
					)}
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Role</span>
					<span className="text-foreground">
						{officerStatus
							? `Officer${officerRole ? ` · ${officerRole}` : ''}`
							: 'Member'}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Member since</span>
					<span className="font-mono text-xs text-muted-foreground-dim">
						{memberSince}
					</span>
				</div>
			</div>
			{!duesPaid && (
				<a
					href="/settings"
					className="mt-1 inline-flex w-fit items-center rounded-md bg-ieee-dark-yellow px-3 py-1.5 text-xs font-semibold text-black"
				>
					Pay dues
				</a>
			)}
		</Card>
	);
}
