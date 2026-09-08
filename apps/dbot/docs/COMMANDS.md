# Fritz — command reference

Every slash command the bot registers, what it does, who can run it, and what it
talks to. Source: `apps/dbot/src/commands/**`.

## How commands work

- **Registration** — on startup Fritz clears all *global* commands and registers
  every command as a **guild** command on `MAIN_SERVER_ID` (instant updates). They
  only appear in that one guild. `/reload` re-imports the files without a restart;
  it does **not** re-register with Discord (restart for that).
- **Dispatch** (`src/events/interactionCreate.ts`) — for each `/` command:
  1. command exists and `enabled` → else "Command Disabled"
  2. `guildOnly` and in a DM → "Guild Only Command"
  3. **permission check** — `command.hasPermission(userId)` → `Fritz.hasPermission(userId, command.permissionLevel)` → `userLevel >= required`
  4. **cooldown** — per-user, per-command (`cooldown` seconds)
  5. run; on throw → ephemeral "Command Error" + an embed to `DEV_CHANNEL_LOGS_ID` if set
- **Permission level** is the ordinal ladder from `@watts/permissions/tier`
  (`computeRoleTier`), resolved by `@watts/core/members` `resolveMemberTier`
  (members row by `discord_id` + committee/project links). Result cached 10 min.
  A `config.owners` id (`OWNER_ID`) is always `ADMINISTRATOR`.

| # | Level | Meaning |
|---|---|---|
| 0 | `GUEST` | not in the members table |
| 1 | `MEMBER` | has a members row |
| 2 | `COMMITTEE_MEMBER` | in ≥1 committee |
| 3 | `PROJECT_LEAD` | leads ≥1 project |
| 4 | `COMMITTEE_CHAIR` | chairs ≥1 committee |
| 5 | `OFFICER` | `officer_status = true` |
| 6 | `EXECUTIVE` | officer role ∈ {Executive Chair, Vice Chair, Secretary, Treasurer} |
| 7 | `ADMINISTRATOR` | `administrator = true`, or an `OWNER_ID` |

## At a glance

| Command | Cat | Min level | Options | Talks to |
|---|---|---|---|---|
| `/test` | general | GUEST | — | — |
| `/ping` | general | GUEST | — | Discord gateway |
| `/larry` | general | GUEST | — | — (static gif) |
| `/resume` | general | GUEST | — | Discord (avatar fetch) |
| `/help` | general | GUEST | — | in-memory command list |
| `/events` | general | GUEST | — | **Google Calendar ICS feed** |
| `/assistance` | general | GUEST | `type`, `title`, `message` | `#assistance` + assistance roles |
| `/whois` | general | GUEST | `user?`, `name?` | **DB**: members, committee_members, committees, project_members, projects, event_attendees, events |
| `/info` | general | GUEST | — (menu) | **DB**: members, committees, committee_members, projects, project_members, events |
| `/stats` | general | GUEST | — | **DB**: members, committees, committee_members, projects, project_members |
| `/join` | admin | **ADMINISTRATOR** · guild-only | — | `@discordjs/voice` |
| `/leave` | admin | **ADMINISTRATOR** · guild-only | — | `@discordjs/voice` |
| `/announcement` | admin | **ADMINISTRATOR** | `channel`, `title`, `message`, `role?` | any channel |
| `/members` | admin | **ADMINISTRATOR** | `officers?` | **DB**: members |
| `/reload` | admin | **ADMINISTRATOR** | — | — |
| `/shutdown` | admin | **ADMINISTRATOR** | — | — |

`/help` hides the whole **admin** category from anyone below `ADMINISTRATOR`.

---

## General

### `/test`
Replies `Hello World!`. Health check. Cooldown 1s.

### `/ping`
Round-trip time (defer→edit) plus the gateway heartbeat (`client.ws.ping`), each
shown with the delta since **your** last `/ping`. Cooldown 1s.

### `/larry`
Posts a Larry-the-cat Tenor gif. Pure easter egg — unrelated to the bot's name;
not renamed with the Larry→Fritz rename. Cooldown 5s.

### `/resume`
Links the LaTeX résumé template repo (`github.com/Quil180/resume`), thumbnailed
with the author's Discord avatar (hard-coded user id). Cooldown 5s.

### `/help`
Builds an embed of every loaded command grouped by category, each line
`**name** — description`. The `admin` category is included **only** if the caller
is `ADMINISTRATOR`. Reads the in-memory command collection; no DB. Cooldown 5s.

### `/events`
Fetches the public **Google Calendar ICS feed** (`CALENDAR_ICAL_URL`) via
`Calendar.fetchCalendarEvents()` — recurring events are expanded with RRULE/EXDATE,
3-month horizon — then filters to the **next 7 days** and lists each with a
Discord timestamp, relative time, location, and duration. Not the DB `events`
table (that migration is future work). Cooldown 5s.

### `/assistance`
| option | required | notes |
|---|---|---|
| `type` | yes | `Administrative` → pings `ROLE_ASSISTANCE_ADMIN_ID`; `Website/Software` → `ROLE_ASSISTANCE_SOFTWARE_ID` |
| `title` | yes | |
| `message` | yes | the summary |

Posts a `‼️ <title>` embed (with the requester's name/avatar in the footer) into
`CHANNEL_ASSISTANCE_ID`, prefixed with the role mention. Replies ephemerally.
Cooldown 0.

### `/whois`
| option | required | |
|---|---|---|
| `user` | no | a Discord user — matched on `members.discord_id` |
| `name` | no | full or partial name, case-insensitive (use *instead of* `user`) |

With **no options**, looks up **you**. Logic is `@watts/core/members`
`resolveWhois` + the pure `formatWhois`:

- `user` with no matching `discord_id` → *"`@name` isn't registered on the IEEE website."*
- `name` → substring match on "First Last" over *active* members; 0 → "no member
  matches", >1 → "be more specific" (lists ≤10).
- a match → a one-paragraph reply plus an embed (academic info, biography,
  committees, projects, last seen, links incl. résumé).

Clauses drop out when the data isn't there: pronouns come from `members.gender`
(`M`→he, `F`→she, else they); "serving as {role}" becomes "a general member"; the
"last seen" sentence is omitted if they've never checked in; the links clause and
the embed **Links** field appear only when `linkedin_url` / `github_url` /
`website_url` are set. "Last seen" is the most recent `event_attendees` row
(joined to `events`), tie-broken by `events.start_time`.

**Example** — `/whois user:@JohnDoe` against the seeded fixtures:

> `@JohnDoe` is **John Doe**, a **Computer Science (BS)** major expecting to graduate
> in **2025**. He is also an officer, serving as **Executive Chair**. He was last
> seen at **IEEE GBM 1** on October 1, 2026.

| embed field | value |
|---|---|
| Academic Info | Major: Computer Science (BS) · Graduation Year: 2025 |
| Biography | A natural leader. |
| Committees | Software Committee (Chair) |
| Projects | IEEE Website (Lead) |
| Last seen | IEEE GBM 1 — October 1, 2026 |

**Validation:** `pnpm --filter @watts/bot check:whois`
(`apps/dbot/scripts/whois-check.mts`) exercises `resolveWhois` / `formatWhois`
against the seeded fixtures — run `pnpm db:reset` first. Cooldown 5s.

### `/info`
No options — drives an interactive `StringSelectMenu` (60s collector, locked to
the invoker):

- **Committees** → pick one → chair (`chair_id` → `members`), Discord role,
  member list (`committee_members`), upcoming events (`events` where
  `committee_id`).
- **Projects** → pick one → members (`project_members`), lead flag.
- **Officers** → everyone with `officer_status = true`, grouped by role.

Also resolves the chapter chair (`members` where `officer_role = 'Executive Chair'`).
Cooldown 5s.

### `/stats`
Chapter statistics from the DB:
- total **active** members, and **new** members since the academic-year start
  (Aug 1 — previous calendar year if the current month is before August)
- per-**committee** member counts (`committee_members`, active committees)
- per-**project** member counts (`project_members`, active projects)

Cooldown 10s.

---

## Admin — all require `ADMINISTRATOR`

### `/join` · `/leave`  *(guild-only)*
`/join` connects the bot to **your current** voice channel (`@discordjs/voice`
`joinVoiceChannel`); refuses if already connected or you're not in a channel.
`/leave` destroys the connection — you must be in the **same** channel as the bot.
See also the [voice idle auto-disconnect](SCHEDULED_JOBS.md#voice-idle-auto-disconnect).
Admin-only for now — the bot doesn't record VC, so there's nothing here for
regular members yet. Cooldown 3s.

### `/announcement`
| option | required |
|---|---|
| `channel` | yes — target text channel |
| `title` | yes |
| `message` | yes |
| `role` | no — mentioned above the embed |

Sends a `📢 <title>` embed to `channel` (footer credits the sender). Replies
ephemerally with a confirmation. Cooldown 0.
*(The source comment says "event organizers, project leads, and officers" — that
is aspirational; the enforced level is `ADMINISTRATOR`.)*

### `/members`
| option | required | |
|---|---|---|
| `officers` | no | boolean — restrict to `officer_status = true` |

Lists active members (sorted by last name, first 100), each with badges:
👑 `administrator`, ⭐ `officer_status`, ✅ `dues_paid`. Reads `members`. Cooldown 5s.

### `/reload`
`Fritz.reloadCommands()` — clears the in-memory command collection and re-imports
every file under `src/commands/`. Picks up code edits without a restart. Does not
re-sync with Discord (command name/option changes still need a restart). Ephemeral.
Cooldown 3s.

### `/shutdown`
Replies `🔴 Bot is now shutting down`, then `client.destroy()` (which also stops
the scheduler and cleans its messages — see [SCHEDULED_JOBS](SCHEDULED_JOBS.md))
and `process.exit(0)`. Under `tsx watch` the process exits; the watcher does **not**
restart it. Cooldown 0.

---

## Passive (not commands)

| Event | File | What |
|---|---|---|
| `guildMemberAdd` | `events/Greetings.ts` | welcome embed + `/help` button in `#general`, plus a welcome DM |
| `messageCreate` | `events/guha.ts`, `events/suboh.ts` | keyword easter eggs ("guha", "suboh" → a gif) |
| `messageCreate` | `events/messageCreate.ts` | currently a stub (ignores bots, does nothing) |
| `interactionCreate` | `events/button.ts` | routes `cmd_<name>_…` buttons to the matching command |
| `voiceStateUpdate` | `events/voiceStateUpdate.ts` | the voice idle timer |
