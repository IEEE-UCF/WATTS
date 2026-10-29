'use client';

import { trpc } from '@/lib/trpc/client';
import { Button } from '@watts/ui/button';
import { Card } from '@watts/ui/card';

/**
 * Admin check that website → bot signals reach the Discord bot: sends a `bot.test`
 * signal, and the bot answers in its default logging channel.
 */
export function BotSignalTest() {
	const sendTest = trpc.botSignal.sendTest.useMutation();
	const result = sendTest.data;

	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-5 shadow-lg shadow-black/40 lg:p-6">
			<h3 className="font-heading text-xs tracking-[0.14em] text-muted-foreground-dim uppercase">
				Bot connection
			</h3>
			<div className="flex flex-wrap items-center gap-4">
				<Button
					variant="outline"
					size="sm"
					disabled={sendTest.isPending}
					onClick={() => sendTest.mutate()}
				>
					{sendTest.isPending ? 'Sending…' : 'Send test signal'}
				</Button>
				<span className="text-sm text-muted-foreground" role="status">
					{sendTest.error
						? `Failed: ${sendTest.error.message}`
						: result?.sent
							? 'Sent — check the bot’s logging channel.'
							: result
								? `Not sent: ${result.reason}`
								: 'Asks the Discord bot to post a confirmation in its logging channel.'}
				</span>
			</div>
		</Card>
	);
}
