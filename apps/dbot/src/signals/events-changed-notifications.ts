import { SignalHandler } from '../structs/SignalHandler.ts';

/**
 * Website events changed → re-plan event reminder timers (times, settings or
 * global/archived status may have moved). Runs alongside EventsChangedSignal, which
 * syncs Discord scheduled events for the same signal.
 */
export class EventsChangedNotificationsSignal extends SignalHandler<'events.changed'> {
	constructor(client: any) {
		super(client, { type: 'events.changed', debounceMs: 15_000 });
	}

	override isEnabled(): boolean {
		return Boolean(this.client.notificationScheduler?.enabled);
	}

	async run(): Promise<void> {
		await this.client.notificationScheduler.plan();
	}
}
