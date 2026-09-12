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
	EmbedBuilder,
	TextChannel,
	type Guild,
	type GuildScheduledEvent,
	type GuildScheduledEventCreateOptions,
} from 'discord.js';
import { eq, isNotNull, or } from 'drizzle-orm';
import { Events, RoomReservations, Users } from '@watts/db/schema';

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

			// Trigger the Room Reservation Showcase checking
			await this.reconcileReservations(guild, db);

			// Trigger the Live Room Dashboard updates
			await this.updateRoomDashboard(guild, db);

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
					this.client.logger.fail(`Failed to sync event ${row.id}: ${err}`);
				}
			}

			// Cleanup orphaned Discord events
			// If an event is completely deleted from Postgres, it vanishes from `rows` and leaves an orphan in Discord.
			// Here, we find any Discord events created by this bot that are no longer in our DB and delete them.
			const dbEventIds = new Set(rows.map(r => r.discordScheduledEventId).filter(Boolean));

			for (const scheduledEvent of scheduled.values()) {
				if (scheduledEvent.creatorId === this.client.user?.id && !dbEventIds.has(scheduledEvent.id)) {
					this.client.logger.warn(`Found orphaned Discord event "${scheduledEvent.name}" (deleted from Postgres). Removing from Discord...`);
					await guild.scheduledEvents.delete(scheduledEvent.id).catch(() => null);
				}
			}

		} catch (err) {
			this.client.logger.fail(`Discord sync pass failed: ${err}`);
		} finally {
			this.running = false;
		}
	}

	// NEW: Room Reservation Embed Showcase System
	async reconcileReservations(guild: Guild, db: any) {
		try {
			// Get the target channel for reservation logs (fallback to general channel for testing)
			const logChannelId = this.client.config.servers.main.channels.general;
			const channel = await guild.channels.fetch(logChannelId).catch(() => null);

			if (!channel || !(channel instanceof TextChannel)) {
				// We won't log an error here during normal execution if the channel isn't set up yet,
				// but this is where it fetches the channel.
				return;
			}

			// Query room reservations joined with events and users
			const reservations = await db
				.select({
					reservation: RoomReservations,
					event: Events,
					user: Users,
				})
				.from(RoomReservations)
				.leftJoin(Events, eq(RoomReservations.eventId, Events.id))
				.leftJoin(Users, eq(Events.createdByUserId, Users.id));

			for (const row of reservations) {
				const { reservation, event, user } = row;
				if (!event) continue;

				// If the status changed OR the room changed since the last time we announced it
				if (reservation.status !== reservation.lastAnnouncedStatus || reservation.room !== reservation.lastAnnouncedRoom) {

					let color = 0x808080; // Gray for unsubmitted
					if (reservation.status === 'pending') color = 0xFFA500; // Orange
					else if (reservation.status === 'confirmed') color = 0x00FF00; // Green
					else if (reservation.status === 'rejected') color = 0xFF0000; // Red

					const isRoomChangeOnly = (reservation.status === reservation.lastAnnouncedStatus) && (reservation.room !== reservation.lastAnnouncedRoom);
					const titlePrefix = isRoomChangeOnly ? '🔄 Room Location Updated' : '🎫 Room Reservation Update';
					const spacerUrl = 'https://dummyimage.com/1000x1/2b2d31/2b2d31.png';

					const embed = new EmbedBuilder()
						.setTitle(`${titlePrefix}: ${event.title}`)
						.setColor(color)
						.addFields(
							{ name: 'Status', value: `\`${reservation.status.toUpperCase()}\``, inline: true },
							{ name: 'Room', value: reservation.room ?? 'TBD', inline: true },
							{ name: 'Time', value: `<t:${Math.floor(new Date(event.startTime).getTime() / 1000)}:f>`, inline: false },
						)
						.setTimestamp()
						.setImage(spacerUrl);

					// If we have a user who created the event and they have a Discord ID, ping them!
					// Fallback for testing: if no user is found, we ping the hardcoded dev ID
					let content = '';
					if (event.pingCreatorOnUpdate) {
						const pingId = user?.discordId ?? '99688747573981184';
						content = `<@${pingId}>`;
					}

					await channel.send({ content: content || undefined, embeds: [embed] });

					// Update the database to reflect it was announced
					await db
						.update(RoomReservations)
						.set({
							lastAnnouncedStatus: reservation.status,
							lastAnnouncedRoom: reservation.room,
							updatedAt: new Date().toISOString(),
						})
						.where(eq(RoomReservations.id, reservation.id));

					this.client.logger.success(`Announced room reservation update for: ${event.title}`);
				}
			}

		} catch (err) {
			this.client.logger.fail(`Discord reservation sync pass failed: ${err}`);
		}
	}

	// NEW: Live Room Tracker Dashboard
	async updateRoomDashboard(guild: Guild, db: any) {
		try {
			// Target the Calendar channel for the Dashboard
			const dashboardChannelId = this.client.config.servers.main.channels.calendar;
			const channel = await guild.channels.fetch(dashboardChannelId).catch(() => null);
			if (!channel || !(channel instanceof TextChannel)) return;

			// Fetch all upcoming reservations with user data
			const reservations = await db
				.select({
					reservation: RoomReservations,
					event: Events,
					user: Users,
				})
				.from(RoomReservations)
				.leftJoin(Events, eq(RoomReservations.eventId, Events.id))
				.leftJoin(Users, eq(Events.createdByUserId, Users.id));

			// We only want future events (or events happening right now)
			const now = Date.now();
			const upcoming = reservations.filter((row: any) => row.event && new Date(row.event.endTime).getTime() > now);

			// Categorize them
			const actionRequired = upcoming.filter((r: any) => r.reservation.status === 'unsubmitted' || r.reservation.status === 'rejected');
			const pending = upcoming.filter((r: any) => r.reservation.status === 'pending');
			const secured = upcoming.filter((r: any) => r.reservation.status === 'confirmed');

			// Helper to group by Month-Year and format lists into chunks to bypass 4096 char limits
			const formatEventChunks = (eventsList: any[]) => {
				if (eventsList.length === 0) return ['*No events in this category.*'];

				eventsList.sort((a, b) => new Date(a.event.startTime).getTime() - new Date(b.event.startTime).getTime());
				const grouped: Record<string, string[]> = {};

				for (const { reservation, event, user } of eventsList) {
					const date = new Date(event.startTime);
					const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });

					grouped[monthYear] ??= [];

					const day = date.getDate().toString().padStart(2, '0');
					const month = (date.getMonth() + 1).toString().padStart(2, '0');
					const roomStr = reservation.room ? `[📍 ${reservation.room}]` : '[📍 TBD]';
					const statusFlag = reservation.status === 'unsubmitted' ? ' ⚠️ *(Unsubmitted)*' : (reservation.status === 'rejected' ? ' ❌ *(Rejected)*' : '');

					let pingTag = '';
					if (event.pingCreatorOnUpdate && (reservation.status === 'unsubmitted' || reservation.status === 'rejected')) {
						const discordId = user?.discordId ?? '99688747573981184';
						pingTag = ` - <@${discordId}>`;
					}
					grouped[monthYear].push(`• \`${month}/${day}\` ${roomStr} ➔ **${event.title}**${statusFlag}${pingTag}`);
				}

				const chunks: string[] = [];
				let currentChunk = '';

				for (const [month, lines] of Object.entries(grouped)) {
					const monthHeader = `\n**📅 ${month}**\n`;
					if (currentChunk.length + monthHeader.length > 3900) {
						chunks.push(currentChunk.trim());
						currentChunk = '';
					}
					currentChunk += monthHeader;

					for (const line of lines) {
						if (currentChunk.length + line.length + 1 > 3900) {
							chunks.push(currentChunk.trim());
							currentChunk = `**📅 ${month} (Cont.)**\n`;
						}
						currentChunk += line + '\n';
					}
				}
				if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
				return chunks;
			};

			const spacerUrl = 'https://dummyimage.com/1000x1/2b2d31/2b2d31.png';
			const embeds: EmbedBuilder[] = [];

			// Helper to generate embed blocks safely
			const buildEmbeds = (chunks: string[], title: string, color: number) => {
				chunks.forEach((chunk, index) => {
					const displayTitle = index === 0 ? title : `${title} (Part ${index + 1})`;
					embeds.push(new EmbedBuilder()
						.setTitle(displayTitle)
						.setDescription(chunk)
						.setColor(color)
						.setImage(spacerUrl),
					);
				});
			};

			buildEmbeds(formatEventChunks(actionRequired), '🔴 ACTION REQUIRED (Blocked)', 0xFF0000);
			buildEmbeds(formatEventChunks(pending), '🟠 AWAITING SU APPROVAL (Pending)', 0xFFA500);
			buildEmbeds(formatEventChunks(secured), '🟢 SECURED ROOMS (Confirmed)', 0x00FF00);

			if (embeds.length > 0) {
				const lastEmbed = embeds[embeds.length - 1];
				if (lastEmbed) lastEmbed.setTimestamp();
			}

			// Discord limits to 10 Embeds per message max. Slice if it gets completely nuclear.
			const safeEmbeds = embeds.slice(0, 10);

			// Fetch existing Dashboard Message ID from AppSettings
			const AppSettings = (await import('@watts/db/schema')).AppSettings;
			const settingKey = 'discord_booking_dashboard_message_id';

			const settingsRow = await db.select().from(AppSettings).where(eq(AppSettings.key, settingKey)).limit(1);
			let existingMessageId = settingsRow.length > 0 ? settingsRow[0].value : null;

			if (existingMessageId) {
				try {
					// Remove JSON quotes if present
					existingMessageId = existingMessageId.replace(/"/g, '');
					const existingMessage = await channel.messages.fetch(existingMessageId);
					await existingMessage.edit({ content: '**📊 Live Room Reservation Dashboard**', embeds: safeEmbeds });
					return;
				} catch {
					this.client.logger.warn('Dashboard message not found, creating a new one...');
				}
			}

			// If it doesn't exist (or was deleted), send a new one
			const newMessage = await channel.send({ content: '**📊 Live Room Reservation Dashboard**', embeds: safeEmbeds });

			// Save the new ID (Upsert)
			const jsonValue = JSON.stringify(newMessage.id);
			if (settingsRow.length > 0) {
				await db.update(AppSettings).set({ value: jsonValue }).where(eq(AppSettings.key, settingKey));
			} else {
				await db.insert(AppSettings).values({ key: settingKey, value: jsonValue });
			}

			this.client.logger.success('Created new Room Dashboard message!');

		} catch (err) {
			this.client.logger.fail(`Discord dashboard sync pass failed: ${err}`);
		}
	}
}
