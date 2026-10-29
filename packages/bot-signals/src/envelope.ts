// The signed envelope a batch of signals travels in. The website posts it as the
// content of a Discord webhook message; the bot verifies and unpacks it.
//
// The webhook URL is effectively a password (anyone holding it can post), so the
// envelope is also HMAC-signed with BOT_SIGNAL_SECRET — a leaked URL alone can't make
// the bot act. `ts` bounds replay to `maxSkewMs`; the bot also remembers recent ids.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SIGNALS, isSignalType, type Signal } from './signals';

export const ENVELOPE_VERSION = 1;

/** Discord caps message content at 2000 characters; leave headroom. */
export const MAX_ENVELOPE_CHARS = 1900;

export const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

export interface Envelope {
	v: typeof ENVELOPE_VERSION;
	id: string;
	ts: number;
	signals: Signal[];
	sig: string;
}

export type DecodeResult =
	| {
			ok: true;
			envelope: Envelope;
			/** Signals skipped inside an otherwise valid envelope (unknown type, bad payload). */
			dropped: { type: string; reason: string }[];
	  }
	| { ok: false; reason: string };

function sign(secret: string, v: number, id: string, ts: number, signals: unknown): string {
	return createHmac('sha256', secret)
		.update(`${v}.${id}.${ts}.${JSON.stringify(signals)}`)
		.digest('hex');
}

/** Build the message content for a batch of signals. Throws if it won't fit in one message. */
export function encodeEnvelope(
	signals: Signal[],
	secret: string,
	opts: { id?: string; ts?: number } = {},
): string {
	const id = opts.id ?? randomUUID();
	const ts = opts.ts ?? Date.now();
	const envelope: Envelope = {
		v: ENVELOPE_VERSION,
		id,
		ts,
		signals,
		sig: sign(secret, ENVELOPE_VERSION, id, ts, signals),
	};
	const text = JSON.stringify(envelope);
	if (text.length > MAX_ENVELOPE_CHARS) {
		throw new Error(`Bot signal envelope is ${text.length} chars (max ${MAX_ENVELOPE_CHARS})`);
	}
	return text;
}

/**
 * Verify and unpack message content. A bad signature, stale timestamp or malformed
 * envelope rejects the whole thing; an unknown signal type or invalid payload only
 * drops that signal (so the website can ship a new type before the bot learns it).
 */
export function decodeEnvelope(
	text: string,
	secret: string,
	opts: { maxSkewMs?: number; now?: number } = {},
): DecodeResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, reason: 'not JSON' };
	}
	if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
	const { v, id, ts, signals, sig } = raw as Record<string, unknown>;

	if (v !== ENVELOPE_VERSION) return { ok: false, reason: `unsupported version ${String(v)}` };
	if (typeof id !== 'string' || typeof ts !== 'number' || typeof sig !== 'string' || !Array.isArray(signals)) {
		return { ok: false, reason: 'malformed envelope' };
	}

	const expected = Buffer.from(sign(secret, v, id, ts, signals), 'hex');
	const given = Buffer.from(sig, 'hex');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return { ok: false, reason: 'bad signature' };
	}

	const skew = Math.abs((opts.now ?? Date.now()) - ts);
	if (skew > (opts.maxSkewMs ?? DEFAULT_MAX_SKEW_MS)) {
		return { ok: false, reason: `stale (${Math.round(skew / 1000)}s old)` };
	}

	const valid: Signal[] = [];
	const dropped: { type: string; reason: string }[] = [];
	for (const entry of signals as { type?: unknown; payload?: unknown }[]) {
		const type = String(entry?.type);
		if (!isSignalType(entry?.type)) {
			dropped.push({ type, reason: 'unknown type' });
			continue;
		}
		const parsed = SIGNALS[entry.type].safeParse(entry.payload);
		if (!parsed.success) {
			dropped.push({ type, reason: 'invalid payload' });
			continue;
		}
		valid.push({ type: entry.type, payload: parsed.data } as Signal);
	}

	return { ok: true, envelope: { v, id, ts, signals: valid, sig }, dropped };
}
