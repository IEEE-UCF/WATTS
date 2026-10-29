# Bot signals (website → Discord bot)

The website tells the Discord bot that something happened, so the bot doesn't have to poll
the database. Polling wakes the Neon compute, which is billed while it's awake.

```
website procedure ── emitsBotSignal('events.changed', {}) ──▶ per-request batch
   └─ after the response: one signed envelope ─▶ Discord webhook (staff-only channel)
bot messageCreate ─▶ SignalRouter: from our webhook? → verify → dispatch → delete message
   └─ every SignalHandler for that type ─▶ debounce → handler.run(payloads)
```

| Piece | Where |
|---|---|
| Signal catalogue: types and payload schemas | `packages/bot-signals/src/signals.ts` |
| Signed envelope: HMAC, freshness, size | `packages/bot-signals/src/envelope.ts` |
| Website sender: batch per request, `send` now | `apps/ieeeucfcom/src/lib/bot-signals.ts` |
| tRPC hook | `emitsBotSignal(type, payload)` middleware and `ctx.botSignals` in `packages/api/src/trpc.ts` |
| Bot base class | `apps/dbot/src/structs/SignalHandler.ts` |
| Bot handlers (auto-loaded) | `apps/dbot/src/signals/*.ts` |
| Bot receiver | `apps/dbot/src/modules/signals/SignalRouter.ts` |

## Adding a signal

1. **Declare it.** Add an entry to `SIGNALS` in `packages/bot-signals/src/signals.ts`, as a zod schema for its payload.
   - Keep payloads small (a message is at most ~1900 characters).
   - Keep PII out: payloads pass through a Discord channel.
2. **Handle it.** Add `apps/dbot/src/signals/<name>.ts` that exports a class extending `SignalHandler<'<type>'>`.
   - Pass `{ type, debounceMs? }` to `super` and implement `run(payloads, context)`.
   - Override `isEnabled()` to gate it on config.
   - Delivery comes from the base class. Signals inside the debounce window fold into one `run`, and two runs never overlap. A signal that arrives mid-run gets one more run afterwards.
   - Several handlers may answer the same type.
3. **Send it.**
   - On a tRPC procedure, use `.use(emitsBotSignal('<type>', payload))`. It emits only if the procedure succeeds.
   - Inside a procedure, call `ctx.botSignals?.emit('<type>', payload)`.
   - From other server code, call `createBotSignalSender().emit(...)`.
   - Use `send([...])` instead of `emit` when the caller needs the outcome; the admin test button does this.

Then run `pnpm --filter @watts/bot check:signals`. If you added a tRPC procedure, also classify it in `infra/e2e/lib/access-matrix.ts` and run `pnpm --filter @watts/e2e matrix:doc`.

## Current signals

| Type | Sent by | Bot does |
|---|---|---|
| `bot.test` | Admin dashboard → **Bot connection → Send test signal** (`botSignal.sendTest`, admin only) | Posts "✅ Test webhook received" in `CHANNEL_DEFAULT_LOGGING_ID` |
| `events.changed` | Event create, update, delete, restore, hardDelete, confirmFlyer, and importFromGoogle | One Discord event-sync pass after a 10-second debounce (needs `DISCORD_EVENT_SYNC_ENABLED`) |

## Security

- **The webhook URL is a credential.** Anyone holding it can post. Envelopes are therefore also HMAC-signed with `BOT_SIGNAL_SECRET`, and the bot ignores every signal while the secret is unset.
- **Freshness.** The bot checks the envelope's `ts` against the time Discord says the message was posted, allowing ±5 minutes. Recently seen envelope ids are also rejected. A captured envelope re-posted later is therefore stale.
- **Unknown types and invalid payloads** are dropped one by one, so the website can ship a new type before the bot learns it.

## Reliability

- **The channel is the queue.** Messages posted while the bot is offline stay in the channel. On startup the bot handles the webhook's last 50 messages, oldest first, and deletes them.
- **If the bot lacks Manage Messages,** handled signals stay in the channel and are handled again on the next restart.
- **Lost signals are not fatal.** The bot keeps a slow fallback poll (`DISCORD_EVENT_SYNC_INTERVAL_MINS`, default 180), and officers can run `/syncevents`.

## Setup

Set the same `BOT_SIGNAL_WEBHOOK_URL` and `BOT_SIGNAL_SECRET` in two places:
- the website, in Vercel
- the bot, in the VPS `.env`

Create the webhook in its **own hidden channel** (e.g. `#bot-signals`, visible only to the bot and admins), and give the bot **View Channel** and **Manage Messages** there. Signal messages appear under the webhook's name, not the bot's. They are deleted within a second, but they sit there while the bot is offline, so keep the channel out of everyone's sight.

To check the wiring, use the admin dashboard's **Send test signal** button. It reports `not configured`, `webhook <status>` or `timeout` when something is off.
