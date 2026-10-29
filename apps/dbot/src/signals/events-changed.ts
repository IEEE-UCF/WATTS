import { SignalHandler, type SignalContext } from '../structs/SignalHandler.ts';
import type { SignalPayload } from '@watts/bot-signals';

/**
 * Website events changed → run a Discord event sync pass (scheduled events, room
 * announcements, room dashboard). Debounced so a burst — create an event, then upload
 * its flyer — costs one pass.
 */
export class EventsChangedSignal extends SignalHandler<'events.changed'> {
	constructor(client: any) {
		super(client, { type: 'events.changed', debounceMs: 10_000 });
	}

	override isEnabled(): boolean {
		return Boolean(this.client.discordEventSync?.enabled);
	}

	async run(payloads: SignalPayload<'events.changed'>[], context: SignalContext): Promise<void> {
		const ran = await this.client.discordEventSync.reconcile();
		// A fallback-poll pass was already running and may have read the DB before this
		// change: queue one more pass (it runs after this one, past the debounce).
		if (!ran) this.enqueue(payloads[0] ?? {}, context.sentAt);
	}
}
