<!--
Fill in every section. An empty section blocks review.
See CONTRIBUTING.md for the conventions this template assumes.
-->

## What & why

<!-- One paragraph: the problem this solves and the approach taken. Link the issue. -->

Closes #

## Changes

<!--
One bullet per meaningful change: `path/to/file.ts:line — what changed and why`.
Every non-trivial hunk gets a line. Pure renames / moves can be summarised in one.
-->

-

## Database

- [ ] No schema change
- [ ] Adds migration(s): `packages/db/drizzle/____.sql`
  - [ ] Expand/contract-safe (the current production code works against the **old** schema)
  - [ ] Needs a manual `pnpm db:migrate` against prod **before** this merges (breaking change)

<!-- A ticked "adds migration" means merging queues the gated `production` migrate job. -->

## Environment / config

- [ ] No env vars added or changed
- [ ] Added/changed vars: `____`
  - [ ] Declared in `turbo.json` (`globalPassThroughEnv` or `build.env`)
  - [ ] Set in Vercel (Production + Preview scopes)
  - [ ] Documented in `apps/ieeeucfcom/DEPLOY.md`

## Testing

- [ ] `pnpm typecheck lint build` green locally
- [ ] `pnpm --filter @watts/bot check:whois` (if `@watts/core` was touched)
- [ ] Manual verification:

<!-- What you ran / clicked, and what you confirmed. -->

## Deploy impact

- [ ] `@watts/web` build / behaviour
- [ ] Discord bot (`@watts/bot`)
- [ ] Cron jobs (`@watts/jobs`)
- [ ] None — docs / tooling only

## Screenshots / recordings

<!-- UI changes only. Before/after where it helps. -->

## Checklist

- [ ] PR title is a conventional commit (`type(scope): summary`)
- [ ] One logical change; unrelated cleanup split into its own PR
- [ ] Rebased on the latest `main`
- [ ] Docs updated (`DEVELOPING.md` / `DEPLOY.md` / the relevant package README)
- [ ] CI (`verify` + `smoke`) is green
