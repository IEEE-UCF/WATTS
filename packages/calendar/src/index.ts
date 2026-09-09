export { getCalendarConfig, type CalendarConfig } from './config';
export {
	CALENDAR_SCOPES,
	resolveServiceAccountKey,
	createJwtClient,
	type ServiceAccountKey,
} from './auth';
export {
	GOOGLE_COLOR_IDS,
	isGoogleColorId,
	toGoogleColorId,
	SEED_EVENT_LABELS,
	type GoogleColorId,
} from './labels';
export {
	createCalendarClient,
	type CalendarClient,
	type CalendarEventInput,
	type CalendarWriteResult,
	type CalendarDeleteResult,
	type GoogleEvent,
	type NativeCalendarLabel,
} from './client';
