# Fritz — scheduled jobs

The recurring / timed work the bot runs while it's online. There is **no cron
engine** yet — everything is `setInterval` / `setTimeout` started from
`clientReady` or the events-automation module. This doc is the inventory; the
["Future" section](#future-a-real-scheduler) sketches where it's going.

All schedules are **wall-clock intervals from process start**, not cron
expressions — e.g. "every 30 min" means 30 min after boot, then every 30 min,
for as long as the process lives.

## Inventory

| Job | Every | Enabled by | Reads | Writes | Source |
|---|---|---|---|---|---|
| **Weekly events board** | `EVENTS_AUTOMATION_INTERVAL_MINS` (def. 30 min) | `EVENTS_AUTOMATION_ENABLED=true` | Google Calendar ICS | edits 1 pinned embed in `CHANNEL_CALENDAR_ID` | `modules/calendar/eventsAutomation.ts` → `updateWeeklyBoard()` |
| **Event reminders** | 5 min (hard-coded) | `EVENT_REMINDERS_ENABLED` ≠ `false` (default on) | Google Calendar ICS | posts / deletes reminder embeds in `CHANNEL_REMINDERS_ID`, pings `ROLE_REMINDER_ID` | `eventsAutomation.ts` → `checkUpcomingEvents()` |
| **Cooldown sweep** | 1 min | always | in-memory | — | `events/clientReady.ts` |
| **Permission-cache sweep** | 5 min | always | in-memory | — | `events/clientReady.ts` — ⚠️ currently a no-op, see note |
| **Voice idle auto-disconnect** | event-driven, 60 s timer | always (only when in a VC) | voice state | leaves the voice channel | `events/voiceStateUpdate.ts` |

One-shots at boot (not recurring): `clientReady` posts **"bot alive"** to
`CHANNEL_GENERAL_ID`; if events automation is enabled it posts the initial board
immediately before starting the interval.

---

## Weekly events board

`eventsAutomation.start()` (called from `clientReady`) returns early unless
`EVENTS_AUTOMATION_ENABLED=true`. When on:

1. `updateWeeklyBoard()` once immediately, then every
   `EVENTS_AUTOMATION_INTERVAL_MINS` minutes.
2. Each run: `Calendar.fetchCalendarEvents()` (ICS + RRULE/EXDATE expansion) →
   filter to the next 7 days → build one embed (title, per-event timestamp /
   relative time / location / duration).
3. First run **posts** the embed to `CHANNEL_CALENDAR_ID` and keeps the `Message`
   handle; later runs **edit** that same message. If the handle is lost (restart)
   a new message is posted.
4. On `client.destroy()` / `/shutdown`, `cleanupOnShutdown()` deletes the board
   message.

## Event reminders

Runs every **5 minutes** regardless of `EVENTS_AUTOMATION_INTERVAL_MINS`;
`checkUpcomingEvents()` returns early unless `EVENT_REMINDERS_ENABLED` is not the
string `"false"` (so it is **on by default**, even when unset).

For every ICS occurrence:
- `timeDiff = start − now`
- **fire** when `timeDiff` is within a 5-minute band ending at
  `EVENT_REMINDERS_MINUTES` (default 60) before start, and no reminder is already
  tracked for that occurrence id (`uid_startMs`).
- **fire action**: embed `⏰ Event Starting in <h> hour!` to
  `CHANNEL_REMINDERS_ID`, content `<@&ROLE_REMINDER_ID>`; track `{eventId,
  messageId, eventStartTime}`.
- once `timeDiff < 0`, delete the tracked reminder message.
- `cleanupOnShutdown()` deletes every tracked reminder.

Because the check cadence (5 min) is wider than the fire band (5 min) this can
miss a reminder if a tick is skewed; it is best-effort.

## Cooldown sweep

`clientReady` sets a 60 s interval that calls `cleanCooldowns()` on every command
(drops per-user cooldown map entries whose expiry has passed). Pure memory hygiene.

## Permission-cache sweep

`clientReady` sets a 5 min interval intending to call
`Fritz.cleanExpiredCache()` (which would sweep entries past the 10-min
`CACHE_TTL`). **It currently reads `this.client.permissions?.cleanExpiredCache()`
— there is no `permissions` property on `Fritz` (the cache is `permissionCache`
and the method is on `Fritz` itself), so the optional-chain short-circuits and
nothing runs.** Stale entries are still replaced lazily on the next lookup after
their TTL, so the effect is only a slightly larger `permissionCache` map. Fix:
call `this.client.cleanExpiredCache()`.

## Voice idle auto-disconnect

Not an interval — driven by `voiceStateUpdate`. When the bot is in a voice
channel and the last non-bot member leaves, a single 60 s `setTimeout` is armed
(tracked per guild in `modules/helpers/voiceTimers.ts`). If the channel is still
empty when it fires, `connection.destroy()`. If someone (re)joins first, the
timer is cleared. `/leave` also clears it.

---

## Future — a real scheduler

The calendar system is being rebuilt. Target shape:

- **`@watts/calendar`** owns ICS fetch + RRULE/EXDATE (moved out of
  `modules/calendar/main.ts`), consumed by the bot and by `apps/jobs`.
- A small **job registry** in the bot: each job a module exporting
  `{ name, schedule (cron expr), enabled, run(ctx) }`, wired to `node-cron` (or
  similar) instead of ad-hoc `setInterval`. `clientReady` iterates the registry.
- Jobs that don't need the gateway (digest emails, DB archival, calendar → DB
  sync) move to the **`apps/jobs`** container on the VPS; gateway-bound jobs
  (board, reminders) stay in the bot.
- Reminder firing keyed off the shared `events` table once `/events` is migrated
  off the ICS feed (gated on a Google Calendar API key).

Until then: this file is the source of truth for what's scheduled.
