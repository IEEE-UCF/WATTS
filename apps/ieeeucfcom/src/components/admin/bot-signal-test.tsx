'use client';

import { trpc } from '@/lib/trpc/client';
import { Button } from '@watts/ui/button';
import { Card } from '@watts/ui/card';

type SignalMutation =
	| ReturnType<typeof trpc.botSignal.sendTest.useMutation>
	| ReturnType<typeof trpc.botSignal.syncEvents.useMutation>;

/** One admin button that sends the bot a signal, with its result next to it. */
function SignalButton({
	mutation,
	label,
	hint,
	sentMessage,
}: {
	mutation: SignalMutation;
	label: string;
	hint: string;
	sentMessage: string;
}) {
	const result = mutation.data;
	return (
		<div className="flex flex-wrap items-center gap-4">
			<Button
				variant="outline"
				size="sm"
				className="min-w-40"
				disabled={mutation.isPending}
				onClick={() => mutation.mutate()}
			>
				{mutation.isPending ? 'Sending…' : label}
			</Button>
			<span className="text-sm text-muted-foreground" role="status">
				{mutation.error
					? `Failed: ${mutation.error.message}`
					: result?.sent
						? sentMessage
						: result
							? `Not sent: ${result.reason}`
							: hint}
			</span>
		</div>
	);
}

/**
 * Admin controls that reach the Discord bot through website → bot signals
 * (docs/BOT-SIGNALS.md). Admin-only: the procedures are adminProcedure and this card
 * only renders on /admin/dashboard.
 */
export function BotSignalTest() {
	const sendTest = trpc.botSignal.sendTest.useMutation();
	const syncEvents = trpc.botSignal.syncEvents.useMutation();

	return (
		<Card className="gap-4 rounded-xl border-border bg-card/60 p-5 shadow-lg shadow-black/40 lg:p-6">
			<h3 className="font-heading text-xs tracking-[0.14em] text-muted-foreground-dim uppercase">
				Bot connection
			</h3>
			<SignalButton
				mutation={sendTest}
				label="Send test signal"
				hint="Asks the Discord bot to post a confirmation in its logging channel."
				sentMessage="Sent — check the bot’s logging channel."
			/>
			<SignalButton
				mutation={syncEvents}
				label="Sync Discord events"
				hint="Asks the bot to sync website events to Discord now (same as /syncevents)."
				sentMessage="Sent — Discord events update within ~10 seconds."
			/>
		</Card>
	);
}
