import type { SignalPayload, SignalType } from '@watts/bot-signals';

export interface SignalHandlerOptions<T extends SignalType> {
	/** The signal type this handler answers (a key of SIGNALS in @watts/bot-signals). */
	type: T;
	/** Wait this long after the first signal before running, folding a burst into one run. */
	debounceMs?: number;
	enabled?: boolean;
}

/** Facts about the delivery, passed alongside the payloads. */
export interface SignalContext {
	/** When the website sent the earliest envelope folded into this run (epoch ms). */
	sentAt: number;
}

/**
 * A bot action triggered by a website signal. Subclasses live in src/signals/ and are
 * auto-loaded like commands and events; several handlers may answer one type.
 *
 * Subclasses only implement `run`. Delivery is inherited: `enqueue` debounces, hands
 * `run` every payload that arrived in the window, never runs two passes at once, and
 * schedules one more pass for signals that arrive mid-run.
 */
export abstract class SignalHandler<T extends SignalType = SignalType> {
	public readonly isSignalHandler = true;
	public client: any; // Fritz client instance
	public readonly type: T;
	public readonly debounceMs: number;
	public enabled: boolean;

	private pending: SignalPayload<T>[] = [];
	private pendingSentAt = Infinity;
	private timer: NodeJS.Timeout | null = null;
	private running = false;

	constructor(client: any, options: SignalHandlerOptions<T>) {
		this.client = client;
		this.type = options.type;
		this.debounceMs = options.debounceMs ?? 0;
		this.enabled = options.enabled ?? true;
	}

	/** Do the work for every payload received in one debounce window. */
	abstract run(payloads: SignalPayload<T>[], context: SignalContext): Promise<void>;

	/** Override to gate on runtime state (e.g. a feature flag in config). */
	isEnabled(): boolean {
		return this.enabled;
	}

	/** Queue a payload; `run` fires once the debounce window closes. */
	enqueue(payload: SignalPayload<T>, sentAt = Date.now()): void {
		if (!this.isEnabled()) return;
		this.pending.push(payload);
		this.pendingSentAt = Math.min(this.pendingSentAt, sentAt);
		this.schedule();
	}

	/** Cancel anything queued (bot shutdown / handler reload). */
	stop(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.pending = [];
		this.pendingSentAt = Infinity;
	}

	private schedule(): void {
		// A pass in flight picks the queue up when it finishes; a timer already set will too.
		if (this.timer || this.running) return;
		this.timer = setTimeout(() => void this.flush(), this.debounceMs);
	}

	private async flush(): Promise<void> {
		this.timer = null;
		const payloads = this.pending;
		const context: SignalContext = { sentAt: this.pendingSentAt };
		this.pending = [];
		this.pendingSentAt = Infinity;
		if (payloads.length === 0) return;

		this.running = true;
		try {
			await this.run(payloads, context);
		} catch (error) {
			this.client.logger?.fail(`Signal handler ${this.constructor.name} (${this.type}) failed: ${error}`);
		} finally {
			this.running = false;
			if (this.pending.length > 0) this.schedule();
		}
	}
}
