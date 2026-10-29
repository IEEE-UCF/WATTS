// The catalogue of signals the website can send the Discord bot. One entry per signal
// type: its payload schema. The bot handles a type with a `SignalHandler` subclass in
// apps/dbot/src/signals/; the website sends it through its bot-signal batch.
//
// Payloads travel as a Discord message in a staff-only channel (deleted on receipt),
// so keep them small and keep PII out: ids and short labels only.

import { z } from 'zod';

export const SIGNALS = {
	/**
	 * Website events changed in a way the bot mirrors (global events → Discord
	 * scheduled events, room reservations, flyers). The bot runs one full sync pass, so
	 * there's nothing to carry.
	 */
	'events.changed': z.object({}),

	/** Admin-panel "Send test signal" button → bot posts a confirmation in the logging channel. */
	'bot.test': z.object({
		requestedBy: z.string().max(80),
	}),
} as const;

export type SignalType = keyof typeof SIGNALS;

export type SignalPayload<T extends SignalType> = z.infer<(typeof SIGNALS)[T]>;

/** One signal inside an envelope. */
export type Signal<T extends SignalType = SignalType> = {
	[K in T]: { type: K; payload: SignalPayload<K> };
}[T];

export function isSignalType(type: unknown): type is SignalType {
	return typeof type === 'string' && Object.prototype.hasOwnProperty.call(SIGNALS, type);
}
