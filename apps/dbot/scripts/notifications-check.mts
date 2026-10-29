/**
 * Validation for timed event reminders: per-event setting defaults
 * (@watts/core/event-notifications), the wrap-up nudge's due time, and the scheduler's
 * planning rules (handled, missed, horizon). No Discord or database needed:
 *
 *   pnpm --filter @watts/bot check:notifications
 *
 * Exits non-zero if any case fails.
 */
import { resolveEventNotificationSettings, type NotifiableEvent } from '@watts/core/event-notifications';
import { planNotifications } from '../src/modules/notifications/plan.ts';
import { WrapUpNudge } from '../src/notifications/wrap-up.ts';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
	console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${detail && !ok ? `\n         ${detail}` : ''}`);
	if (!ok) failures++;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.parse('2026-11-01T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function event(overrides: Partial<NotifiableEvent> = {}): NotifiableEvent {
	return {
		id: 'e1',
		number: 1,
		title: 'Test event',
		startTime: iso(now - 4 * HOUR),
		endTime: iso(now - 3 * HOUR),
		settings: resolveEventNotificationSettings({}),
		creatorDiscordId: '123',
		handled: [],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
console.log('\nper-event settings\n');

const defaults = resolveEventNotificationSettings({});
check('unset → wrap-up on, 24h', defaults.wrapUp === true && defaults.wrapUpDelayHours === 24, JSON.stringify(defaults));
check('null settings → defaults', resolveEventNotificationSettings(null).wrapUpDelayHours === 24);
check('explicit off kept', resolveEventNotificationSettings({ wrapUp: false }).wrapUp === false);
check('custom delay kept', resolveEventNotificationSettings({ wrapUpDelayHours: 2 }).wrapUpDelayHours === 2);
check('out-of-range delay → default', resolveEventNotificationSettings({ wrapUpDelayHours: 9999 }).wrapUpDelayHours === 24);

// ---------------------------------------------------------------------------
console.log('\nwrap-up due time\n');

const nudge = new WrapUpNudge({});
check('due delay hours after the end', nudge.fireAt(event()) === now - 3 * HOUR + 24 * HOUR);
check(
	'no end time → start + 1h + delay',
	nudge.fireAt(event({ endTime: null })) === now - 4 * HOUR + HOUR + 24 * HOUR,
);
check('turned off for the event → never', nudge.fireAt(event({ settings: { wrapUp: false, wrapUpDelayHours: 24 } })) === null);

// ---------------------------------------------------------------------------
console.log('\nplanning\n');

const plan = (events: NotifiableEvent[]) => planNotifications(events, [nudge], now, 7 * DAY);
const short = { wrapUp: true, wrapUpDelayHours: 2 };

check('due in the future → planned', plan([event()]).length === 1);
check('already handled → not planned', plan([event({ handled: ['wrap-up'] })]).length === 0);
check('due 1h ago (bot was down) → planned to fire now', plan([event({ settings: short })])[0]?.fireAt === now - HOUR);
check(
	'due 4 days ago (past the 3-day grace) → dropped',
	plan([event({ startTime: iso(now - 5 * DAY), endTime: iso(now - 5 * DAY + HOUR), settings: short })]).length === 0,
);
check(
	'due beyond the 7-day horizon → left for a later plan',
	plan([event({ startTime: iso(now + 8 * DAY), endTime: iso(now + 8 * DAY + HOUR) })]).length === 0,
);
const ordered = plan([event({ id: 'late' }), event({ id: 'early', settings: short })]);
check('sorted soonest first', ordered.map((p) => p.eventId).join(',') === 'early,late');

// ---------------------------------------------------------------------------
console.log(failures ? `\n✗ ${failures} failed\n` : '\n✓ all passed\n');
process.exit(failures ? 1 : 0);
