// Receives website → bot signals and hands them to the SignalHandlers in src/signals/.
//
// Transport: the website posts a signed envelope (see @watts/bot-signals) through a
// Discord channel webhook in a staff-only channel. Every message that webhook posts is
// ours: verify it, dispatch it, delete it. No inbound port on the VPS, and nothing
// here touches the database.
//
// The channel doubles as a queue: messages posted while the bot is offline wait there
// and are drained on startup. Freshness is judged against Discord's own timestamp for
// the message (when it was posted), not the time we read it — so a backlog is still
// accepted, while a captured envelope re-posted later is stale.

import type { Message } from 'discord.js';
import { DEFAULT_MAX_SKEW_MS, decodeEnvelope } from '@watts/bot-signals';

export class SignalRouter {
	private client: any;
	/** Envelope ids seen within the replay window → when they were sent. */
	private seen = new Map<string, number>();
	private warnedUnconfigured = false;
	public stats = { received: 0, rejected: 0, dispatched: 0 };

	constructor(client: any) {
		this.client = client;
	}

	private get cfg(): { webhookId: string; webhookToken: string; secret: string } {
		return this.client.config.signals;
	}

	/** Is this message from the signal webhook? */
	isSignalMessage(message: Message): boolean {
		return Boolean(this.cfg.webhookId) && message.webhookId === this.cfg.webhookId;
	}

	/**
	 * Handle a message if it came from the signal webhook. Resolves true when the
	 * message was a signal (consumed — the caller should stop), false otherwise.
	 */
	async fromMessage(message: Message): Promise<boolean> {
		if (!this.isSignalMessage(message)) return false;
		this.receive(message.content, message.createdTimestamp);
		await message.delete().catch(() => null); // needs Manage Messages; harmless if not
		return true;
	}

	/**
	 * Signals posted while the bot was offline: read the webhook's recent messages in
	 * its channel and handle them oldest first. Called once the client is ready.
	 */
	async drainBacklog(): Promise<void> {
		const { webhookId, webhookToken } = this.cfg;
		if (!webhookId || !webhookToken) return;
		try {
			const webhook = await this.client.fetchWebhook(webhookId, webhookToken);
			const channel = await this.client.channels.fetch(webhook.channelId);
			if (!channel?.isTextBased() || !('messages' in channel)) return;

			const recent = await channel.messages.fetch({ limit: 50 });
			const backlog = [...recent.values()]
				.filter((message: Message) => this.isSignalMessage(message))
				.sort((a: Message, b: Message) => a.createdTimestamp - b.createdTimestamp);
			for (const message of backlog) await this.fromMessage(message);
			if (backlog.length) this.client.logger.log(`Drained ${backlog.length} bot signal message(s) posted while offline.`);
		} catch (error) {
			this.client.logger.warn(`Could not drain the bot signal backlog: ${error}`);
		}
	}

	/**
	 * Verify an envelope and enqueue its signals on their handlers. `postedAt` is when
	 * the message reached Discord; the envelope must have been signed close to it.
	 */
	receive(content: string, postedAt = Date.now()): void {
		this.stats.received++;
		if (!this.cfg.secret) {
			// Fail closed: without the shared secret we can't tell a real signal from a forged one.
			if (!this.warnedUnconfigured) {
				this.client.logger.warn('Bot signal received but BOT_SIGNAL_SECRET is unset — ignoring signals.');
				this.warnedUnconfigured = true;
			}
			this.stats.rejected++;
			return;
		}

		const result = decodeEnvelope(content, this.cfg.secret, { now: postedAt });
		if (!result.ok) {
			this.stats.rejected++;
			this.client.logger.warn(`Bot signal rejected: ${result.reason}`);
			return;
		}

		const { envelope, dropped } = result;
		this.sweepSeen();
		if (this.seen.has(envelope.id)) {
			this.stats.rejected++;
			this.client.logger.warn(`Bot signal rejected: replayed envelope ${envelope.id}`);
			return;
		}
		this.seen.set(envelope.id, envelope.ts);

		for (const { type, reason } of dropped) {
			this.client.logger.warn(`Bot signal "${type}" skipped: ${reason}`);
		}

		for (const signal of envelope.signals) {
			const handlers = this.client.signals.get(signal.type) ?? [];
			if (handlers.length === 0) {
				this.client.logger.warn(`Bot signal "${signal.type}" has no handler.`);
				continue;
			}
			for (const handler of handlers) handler.enqueue(signal.payload, envelope.ts);
			this.stats.dispatched++;
			this.client.logger.log(`Bot signal "${signal.type}" → ${handlers.length} handler(s).`);
		}
	}

	private sweepSeen(): void {
		const cutoff = Date.now() - DEFAULT_MAX_SKEW_MS * 2;
		for (const [id, ts] of this.seen) if (ts < cutoff) this.seen.delete(id);
	}
}
