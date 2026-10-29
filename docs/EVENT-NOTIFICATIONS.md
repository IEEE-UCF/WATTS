# Event reminders (Discord)

These are timed Discord messages about **global** events (active and not hidden). The bot keeps the clock, so nothing polls the database:
- It plans in-memory timers from one database read.
- It re-plans when the website signals `events.changed` (see [BOT-SIGNALS.md](BOT-SIGNALS.md)), and also every 12 hours.
- Each reminder is recorded in `event_notifications`, at most one per event and kind, so a restart never repeats one.

| Reminder (kind) | When | Goes to | Skipped if |
|---|---|---|---|
| **Officer heads-up** (`officer-reminder`) | N minutes before it starts (default 15) | Officers channel, pinging the event creator and the officer role | The event has already started (for example, the bot was down) |
| **Officer wrap-up** (`wrap-up`) | N hours after it ends (default 24) | Same | It already has photos **and** check-ins |

Both link to the event's review page, **`/admin/events/[id]`**. That page holds the checklist, the check-in scanner and photo upload (both locked to that event), the attendee list, and each reminder's state (scheduled, sent, skipped or off).

## Settings

**Per event:** in the event form, under **Discord reminders**, which appears when the event is Global. Each reminder has a toggle and a time. The settings are stored in `events.notification_settings`; any key that isn't set uses the defaults in `@watts/core/event-notifications`.

**Bot env:**

| Variable | Purpose |
|---|---|
| `EVENT_NOTIFICATIONS_ENABLED=true` | Turns reminders on |
| `CHANNEL_OFFICERS_ID` | Where officer pings go. If blank, they go to `CHANNEL_DEFAULT_LOGGING_ID`. |
| `ROLE_OFFICER_ID` | The role pinged alongside the creator. If blank, only the creator is pinged. |

Links in the messages use `NEXTAUTH_URL`.

## Adding a reminder

1. **Name it.** Add the kind to `NOTIFICATION_KINDS` and its due time to `notificationDueAt()` in `packages/core/src/event-notifications.ts`. If it needs a setting, add the setting to `EventNotificationSettings` in the schema, to `resolveEventNotificationSettings`, to the API's `notificationSettings` input, and to the event form.
2. **Write it.** Add `apps/dbot/src/notifications/<name>.ts`. It's loaded automatically.
   - Extend `OfficerNotification` for officer pings: it handles the channel, the mentions and the review-page link.
   - Extend `EventNotification` for anything else.
   - Implement `fireAt`, `prepare` (send, or skip with a reason) and `send`.
3. **Check it.** Add cases to `apps/dbot/scripts/notifications-check.mts`, then run `pnpm --filter @watts/bot check:notifications`.

## Testing safely

Use a **separate test server and test bot token** in `.env.local`. The repo `.env` points at the real IEEE UCF server.

For a quick check, set a short delay on an event that ended recently. Reminders that were due less than the grace period ago (1 hour for the heads-up, 3 days for wrap-up) are sent when the bot next plans.
