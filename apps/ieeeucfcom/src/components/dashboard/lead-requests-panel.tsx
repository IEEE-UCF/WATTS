'use client';

import { trpc } from '@/lib/trpc/client';
import { Card, CardTitle } from '@watts/ui/card';

/**
 * Non-officer project leads have no admin access, but they can still review join
 * requests for the projects they lead — this surfaces that on their own dashboard.
 * Renders nothing if the viewer isn't a lead of anything, or has no pending requests.
 */
export function LeadRequestsPanel() {
	const utils = trpc.useUtils();
	const { data } = trpc.project.myLeadRequests.useQuery();

	const invalidate = () => void utils.project.myLeadRequests.invalidate();
	const approve = trpc.project.approveRequest.useMutation({ onSuccess: invalidate });
	const deny = trpc.project.denyRequest.useMutation({ onSuccess: invalidate });

	if (!data || data.length === 0) return null;

	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">
				Join requests for your projects
			</CardTitle>
			<div className="flex flex-col gap-3">
				{data.map((p) => (
					<div key={p.projectId}>
						<div className="mb-1.5 text-xs font-semibold text-muted-foreground">
							{p.title}
						</div>
						<div className="flex flex-col gap-1.5">
							{p.requests.map((r) => (
								<div
									key={r.id}
									className="flex items-center justify-between rounded-md border border-input px-2.5 py-1.5 text-xs"
								>
									<span className="text-foreground">
										{r.firstName} {r.lastName}
										{r.message && (
											<span className="ml-1.5 text-muted-foreground-dim">
												— {r.message}
											</span>
										)}
									</span>
									<span className="flex gap-2">
										<button
											type="button"
											onClick={() =>
												approve.mutate({
													requestId: r.id,
													projectId: p.projectId,
												})
											}
											className="text-green-400 hover:underline"
										>
											approve
										</button>
										<button
											type="button"
											onClick={() =>
												deny.mutate({
													requestId: r.id,
													projectId: p.projectId,
												})
											}
											className="text-red-400 hover:underline"
										>
											deny
										</button>
									</span>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
