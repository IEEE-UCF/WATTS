import { GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { loadRootEnv } from '@watts/config/load-env';

// Env resolution: the repo-root `./.env` is authoritative. It loads first, so any key
// it sets wins. A bot-local `apps/dbot/.env` only fills in keys the root file doesn't
// set (e.g. a developer's own local-only override) — Node's loader and dotenv both
// leave already-set vars alone, which is what makes that "fill gaps only" behavior work
// as long as root loads first.
loadRootEnv();
try {
	process.loadEnvFile?.(); // <cwd>/.env — apps/dbot/.env when run via `pnpm --filter @watts/bot dev`
} catch {
	/* no apps/dbot/.env — everything comes from the repo root */
}

interface Config {
	token: string;
	/** Bot application id, for slash-command registration. Optional — falls back to
	 *  the id encoded in the token. Distinct from the website's DISCORD_CLIENT_ID. */
	clientId: string;
	servers: {
		main: {
			id: string;
			channels: {
				calendar: string;
				reminders: string;
				assistance: string;
				general: string;
				/** Live room-reservation dashboard — split out from `calendar`, which now only holds the weekly events board. */
				roomDashboard: string;
				/** Default catch-all log channel: startup/status pings + room-reservation announcements. */
				defaultLogging: string;
			};
			eventsAutomation: {
				enabled: boolean;
				updateIntervalMinutes: number;
			};
			/** Mirror website "global" events to Discord guild scheduled events. */
			discordEventSync: {
				enabled: boolean;
				intervalMinutes: number;
				pingEventCreators: boolean;
			};
			eventReminders: {
				enabled: boolean;
				reminderMinutes: number;
			};
			reminderRole: string;
			assistanceRoleAdmin: string;
			assistanceRoleSoftware: string;
		};
		dev: {
			id: string;
			channels: {
				calendar: string;
				logs: string;
			};
		};
	};
	/** Timed event reminders (modules/notifications/NotificationScheduler.ts). */
	eventNotifications: {
		enabled: boolean;
		/** Where officer nudges go ('' → the default logging channel). */
		officersChannel: string;
		/** Role pinged on officer nudges ('' → no role ping). */
		officerRole: string;
		/** Website origin for links in reminders. */
		siteUrl: string;
	};
	/** Website → bot signals (see modules/signals/SignalRouter.ts). */
	signals: {
		/** Id of the Discord webhook the website posts signals through ('' = off). */
		webhookId: string;
		/** That webhook's token — lets the bot find its channel to drain the backlog on startup. */
		webhookToken: string;
		/** Shared HMAC secret; signals are ignored while it's unset. */
		secret: string;
	};
	embed: {
		color: string;
		footer: string;
	};
	postgres: string;
	calendarURLs?: string[];
	owners: {
		id: string;
		name: string;
	}[];
	status: {
		name: string;
		type: ActivityType;
	};
	debug: boolean;
	intents: GatewayIntentBits[];
	partials: Partials[];

	custom: Record<string, any>;
}

const config: Config = {
	token: process.env.DISCORD_TOKEN ?? '',

	clientId: process.env.DISCORD_CLIENT_ID_BOT ?? '',

	servers: {
		main: {
			id: process.env.MAIN_SERVER_ID ?? '',
			channels: {
				calendar: process.env.CHANNEL_CALENDAR_ID ?? '',
				reminders: process.env.CHANNEL_REMINDERS_ID ?? '',
				assistance: process.env.CHANNEL_ASSISTANCE_ID ?? '',
				general: process.env.CHANNEL_GENERAL_ID ?? '',
				roomDashboard: process.env.CHANNEL_ROOM_DASHBOARD_ID ?? '',
				defaultLogging: process.env.CHANNEL_DEFAULT_LOGGING_ID ?? '',
			},
			eventsAutomation: {
				enabled: process.env.EVENTS_AUTOMATION_ENABLED === 'true',
				updateIntervalMinutes: Number(process.env.EVENTS_AUTOMATION_INTERVAL_MINS) || 30,
			},
			discordEventSync: {
				enabled: process.env.DISCORD_EVENT_SYNC_ENABLED === 'true',
				// Fallback poll only — website changes arrive as `events.changed` signals. Each
				// poll wakes Neon (~5 min billed), so keep this long.
				intervalMinutes: Number(process.env.DISCORD_EVENT_SYNC_INTERVAL_MINS) || 180,
				pingEventCreators: process.env.PING_EVENT_CREATORS === 'true',
			},
			eventReminders: {
				enabled: process.env.EVENT_REMINDERS_ENABLED !== 'false',
				reminderMinutes: Number(process.env.EVENT_REMINDERS_MINUTES) || 60,
			},
			reminderRole: process.env.ROLE_REMINDER_ID ?? '',
			assistanceRoleAdmin: process.env.ROLE_ASSISTANCE_ADMIN_ID ?? '',
			assistanceRoleSoftware: process.env.ROLE_ASSISTANCE_SOFTWARE_ID ?? '',
		},
		dev: {
			id: process.env.DEV_SERVER_ID ?? '',
			channels: {
				calendar: process.env.DEV_CHANNEL_CALENDAR_ID ?? '',
				logs: process.env.DEV_CHANNEL_LOGS_ID ?? '',
			},
		},
	},

	eventNotifications: {
		enabled: process.env.EVENT_NOTIFICATIONS_ENABLED === 'true',
		officersChannel: process.env.CHANNEL_OFFICERS_ID ?? '',
		officerRole: process.env.ROLE_OFFICER_ID ?? '',
		siteUrl: process.env.NEXTAUTH_URL ?? 'https://ieeeucf.com', // same fallback as the website's layout
	},

	signals: {
		// Same webhook URL the website posts to: .../webhooks/<id>/<token>
		webhookId: process.env.BOT_SIGNAL_WEBHOOK_URL?.match(/\/webhooks\/(\d+)\//)?.[1] ?? '',
		webhookToken: process.env.BOT_SIGNAL_WEBHOOK_URL?.match(/\/webhooks\/\d+\/([\w-]+)/)?.[1] ?? '',
		secret: process.env.BOT_SIGNAL_SECRET?.trim() ?? '',
	},

	embed: {
		color: process.env.EMBED_COLOR ?? '#ffd100',
		footer: process.env.EMBED_FOOTER ?? 'IEEE @ UCF Discord Bot',
	},

	postgres: process.env.DATABASE_URL ?? '',

	calendarURLs: [
		process.env.CALENDAR_ICAL_URL ?? 'https://calendar.google.com/calendar/ical/ieee.ucf%40gmail.com/public/basic.ics',
	],

	owners: [
		{
			id: process.env.OWNER_ID ?? '',
			name: process.env.OWNER_NAME ?? '',
		},
	],

	status: {
		name: process.env.STATUS_NAME ?? 'you',
		type: ActivityType.Watching,
	},

	debug: process.env.DEBUG === 'true',

	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildExpressions,
		GatewayIntentBits.GuildScheduledEvents,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.DirectMessageReactions,
		GatewayIntentBits.DirectMessageTyping,
	],

	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction,
		Partials.GuildMember,
		Partials.User,
		Partials.GuildScheduledEvent,
		Partials.ThreadMember,
		Partials.SoundboardSound,
	],

	custom: {},
};

export default config;