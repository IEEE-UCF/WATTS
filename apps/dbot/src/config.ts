import { GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { loadRootEnv } from '@watts/config/load-env';

// Env resolution: a bot-local `apps/dbot/.env` wins (bot token, test-guild id, and
// optionally a DATABASE_URL override); the repo-root `./.env` fills in everything it
// doesn't set (the shared SHARED section). Node's loader and dotenv both leave
// already-set vars alone, so the local file must load first.
try {
	process.loadEnvFile?.(); // <cwd>/.env — apps/dbot/.env when run via `pnpm --filter @watts/bot dev`
} catch {
	/* no apps/dbot/.env — everything comes from the repo root */
}
loadRootEnv();

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
			};
			eventsAutomation: {
				enabled: boolean;
				updateIntervalMinutes: number;
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
			},
			eventsAutomation: {
				enabled: process.env.EVENTS_AUTOMATION_ENABLED === 'true',
				updateIntervalMinutes: Number(process.env.EVENTS_AUTOMATION_INTERVAL_MINS) || 30,
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