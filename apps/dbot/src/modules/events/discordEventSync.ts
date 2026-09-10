// Discord scheduled-event sync.
//
// The website is the source of truth. An event flagged "global" (isGlobal) that
// is active + not hidden gets a matching Discord *guild scheduled event* in the
// ONE main guild (config.servers.main.id) — nothing else, ever. This module polls
// the shared Postgres DB on an interval (the website and the bot share nothing
// else) and reconciles:
//
//   wants a Discord event, none linked        → create, store the id on the row
//   wants one, linked + drifted               → edit
//   wants one, linked id missing on Discord   → recreate
//   no longer wants one but has a linked id   → delete, clear the id
//
// The bot's role needs the "Manage Events" permission in that guild. Enable with
// DISCORD_EVENT_SYNC_ENABLED=true.

import {
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	type Guild,
	type GuildScheduledEvent,
	type GuildScheduledEventCreateOptions,
} from 'discord.js';
import { eq, isNotNull, or } from 'drizzle-orm';
import { Events } from '@watts/db/schema';

const NAME_MAX = 100;
const DESC_MAX = 1000;
const LOCATION_MAX = 100;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

interface DesiredEvent {
	name: string;
	description: string;
	startMs: number;
	endMs: number;
	location: string;
}

export class DiscordEventSync {
	private client: any;
	private interval: NodeJS.Timeout | null = null;
	private running = false;
	private started = false;

	constructor(client: any) {
		this.client = client;
	}

	private get cfg() {
		return this.client.config.servers.main.discordEventSync;
	}

	async start() {
		if (this.started) return;
		if (!this.cfg?.enabled) {
			this.client.logger.log('Discord event sync is disabled in config.');
			return;
		}
		this.started = true;
		this.client.logger.log('Starting Discord event sync…');

		await this.reconcile();
		const minutes = this.cfg.intervalMinutes ?? 15;
		this.interval = setInterval(() => {
			void this.reconcile();
		}, minutes * 60 * 1000);

		this.client.logger.success(`Discord event sync started (every ${minutes}m).`);
	}

	stop() {
		if (this.interval) clearInterval(this.interval);
		this.interval = null;
		if (this.started) this.client.logger.log('Discord event sync stopped.');
	}

	private desired(row: typeof Events.$inferSelect): DesiredEvent {
		const startMs = new Date(row.startTime).getTime();
		const endMs = row.endTime ? new Date(row.endTime).getTime() : startMs + DEFAULT_DURATION_MS;
		return {
			name: (row.title || 'Event').slice(0, NAME_MAX),
			description: (row.description || '').slice(0, DESC_MAX),
			startMs,
			endMs: endMs > startMs ? endMs : startMs + DEFAULT_DURATION_MS,
			location: (row.location || 'TBA').slice(0, LOCATION_MAX),
		};
	}

	private drifted(existing: GuildScheduledEvent, want: DesiredEvent): boolean {
		return (
			existing.name !== want.name ||
			(existing.description ?? '') !== want.description ||
			existing.scheduledStartTimestamp !== want.startMs ||
			existing.scheduledEndTimestamp !== want.endMs ||
			(existing.entityMetadata?.location ?? '') !== want.location
		);
	}

	private options(want: DesiredEvent, image?: Buffer): GuildScheduledEventCreateOptions {
		return {
			name: want.name,
			description: want.description || undefined,
			scheduledStartTime: new Date(want.startMs),
			scheduledEndTime: new Date(want.endMs),
			privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
			entityType: GuildScheduledEventEntityType.External,
			entityMetadata: { location: want.location },
			...(image ? { image } : {}),
		};
	}

	/** Fetch flyer bytes for the Discord event cover image. Null on any failure. */
	private async fetchFlyer(url: string | null): Promise<Buffer | null> {
		if (!url) return null;
		try {
			const res = await fetch(url);
			if (!res.ok) {
				this.client.logger.warn(`Discord event sync: flyer fetch ${res.status} for ${url}`);
				return null;
			}
			return Buffer.from(await res.arrayBuffer());
		} catch (err) {
			this.client.logger.warn(`Discord event sync: flyer fetch failed for ${url}: ${err}`);
			return null;
		}
	}

	async reconcile() {
		if (this.running) return;
		this.running = true;
		try {
			const guildId: string = this.client.config.servers.main.id;
			if (!guildId) {
				this.client.logger.warn('Discord event sync: MAIN_SERVER_ID is unset — skipping.');
				return;
			}
			const guild: Guild | undefined =
				this.client.guilds.cache.get(guildId) ??
				(await this.client.guilds.fetch(guildId).catch(() => undefined));
			if (!guild) {
				this.client.logger.warn(`Discord event sync: not in guild ${guildId} — skipping.`);
				return;
			}

			const db = this.client.database.getDB();
			// Rows that either want a Discord event or currently have one linked.
			const rows: (typeof Events.$inferSelect)[] = await db
				.select()
				.from(Events)
				.where(or(eq(Events.isGlobal, true), isNotNull(Events.discordScheduledEventId)));

			const scheduled = await guild.scheduledEvents.fetch();
			const now = Date.now();

			for (const row of rows) {
				const wants = row.isGlobal && row.active && !row.hidden;
				const linked = row.discordScheduledEventId
					? scheduled.get(row.discordScheduledEventId) ?? null
					: null;

				try {
					if (!wants) {
						// Should not have a Discord event — remove any we made.
						if (linked) await guild.scheduledEvents.delete(linked.id);
						if (row.discordScheduledEventId) {
							await db
								.update(Events)
								.set({
									discordScheduledEventId: null,
									discordFlyerSyncedUrl: null,
									updatedAt: new Date().toISOString(),
								})
								.where(eq(Events.id, row.id));
						}
						continue;
					}

					const want = this.desired(row);
					// A flyer added or replaced after the event was made (the URL carries
					// a ?v= token that changes on every upload).
					const flyerNeedsPush = Boolean(row.flyerUrl) && row.flyerUrl !== row.discordFlyerSyncedUrl;

					if (linked) {
						if (this.drifted(linked, want) || flyerNeedsPush) {
							const image = flyerNeedsPush ? await this.fetchFlyer(row.flyerUrl) : undefined;
							await guild.scheduledEvents.edit(linked.id, this.options(want, image ?? undefined));
							await db
								.update(Events)
								.set({
									discordFlyerSyncedUrl: image ? row.flyerUrl : row.discordFlyerSyncedUrl,
									updatedAt: new Date().toISOString(),
								})
								.where(eq(Events.id, row.id));
							this.client.logger.log(
								`Discord event updated: ${want.name}${image ? ' (+flyer)' : ''}`,
							);
						}
						continue;
					}

					// Wants one but nothing usable is linked. Discord rejects a start
					// time in the past — skip those (a stale linked id is left for a
					// future pass; it is only cleared when the row no longer wants one).
					if (want.endMs <= now) continue;

					const image = await this.fetchFlyer(row.flyerUrl);
					const created = await guild.scheduledEvents.create(this.options(want, image ?? undefined));
					await db
						.update(Events)
						.set({
							discordScheduledEventId: created.id,
							discordFlyerSyncedUrl: image ? row.flyerUrl : null,
							updatedAt: new Date().toISOString(),
						})
						.where(eq(Events.id, row.id));
					this.client.logger.success(`Discord event created: ${want.name}${image ? ' (+flyer)' : ''}`);
				} catch (err) {
					this.client.logger.fail(`Discord event sync failed for “${row.title}”: ${err}`);
				}
			}
		} catch (err) {
			this.client.logger.fail(`Discord event sync pass failed: ${err}`);
		} finally {
			this.running = false;
		}
	}
}
