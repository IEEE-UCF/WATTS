import type { Signal, SignalPayload, SignalType } from './signals';

export type SendResult = { sent: true } | { sent: false; reason: string };

/**
 * How server code reaches the bot. The website implements this over the Discord
 * webhook relay; anything framework-neutral (e.g. @watts/api's tRPC context) only
 * depends on this shape, so the transport can change without touching callers.
 */
export interface BotSignalSender {
	/** Fire-and-forget: queue a signal, flushed once at the end of the request. Never throws. */
	emit<T extends SignalType>(type: T, payload: SignalPayload<T>): void;
	/** Send now and report the outcome (for callers that show it, like the admin test button). */
	send(signals: Signal[]): Promise<SendResult>;
}
