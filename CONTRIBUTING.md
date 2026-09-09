# Contributing to WATTS

Local setup and day-to-day commands live in [`DEVELOPING.md`](DEVELOPING.md). This
file is about how changes get from your machine into `main`.

## Branches

- Branch off the latest `main`: `git checkout main && git pull && git checkout -b <name>`.
- Name it `type/short-desc` — `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`,
  `perf/`, `test/`. Example: `fix/whois-null-officer-role`.
- Rebase on `main` before requesting review (`git fetch origin && git rebase origin/main`).
  Don't merge `main` into your branch.

## Commits

- Format: `type(scope): summary` — imperative mood, lower-case, no trailing period.
  `scope` is the short package/app name (`web`, `bot`, `api`, `db`, `infra`, `turbo`, …).
- The body explains **why**, not what — the diff already shows what.
- One logical change per commit where practical; keep unrelated cleanup out.
- Pair-authored commits end with the trailer (matches existing history):

  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

## Pull requests

- One logical change per PR. Split unrelated cleanup into its own PR.
- PR **title** is a conventional commit, same as above.
- The description is pre-filled from
  [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) — **fill in
  every section**. An empty section blocks review. In particular:
  - **Changes** — one bullet per meaningful change, `path/file.ts:line — what & why`.
    Every non-trivial hunk gets a line.
  - **Database** / **Environment** — tick the boxes; they drive what happens on merge.
- CI (`verify` + `smoke`) must be green before merge. Not machine-enforced yet, but
  the rule stands — don't merge red.
- Squash on merge unless the individual commits are each worth keeping.

## Database migrations

- Never edit a migration that's already in `packages/db/drizzle/` — it may already be
  applied somewhere. Add a new one.
- Change `packages/db/src/schema.ts`, then `pnpm db:generate` to produce the SQL.
- Prefer **expand/contract**: the currently-deployed code must keep working against
  the pre-migration schema (add columns nullable, backfill, switch reads, drop later).
- Call it out in the PR's **Database** section.
- On merge to `main`, `.github/workflows/deploy.yml` queues a `migrate` job that is
  **held for maintainer approval** (Actions run → "Review deployments") before it
  touches the production database. Vercel deploys the site in parallel and does not
  wait — hence expand/contract.
- For a genuinely breaking change: run `pnpm db:migrate` against production manually
  **before** merging the code that needs it, then approve the (now no-op) job.

## Environment variables

- Anything the app reads at build time must be added to `turbo.json`
  (`globalPassThroughEnv` for secrets/URLs, `build.env` for build-shaping vars) —
  Turborepo runs in strict env mode and silently drops undeclared vars.
- Also add it in Vercel (Production + Preview) and document it in
  [`apps/ieeeucfcom/DEPLOY.md`](apps/ieeeucfcom/DEPLOY.md).

## What's not enforced yet

Branch protection on `main` (required PRs, required checks) is planned but off — the
conventions above are the working agreement until then. The production migration
approval gate **is** enforced.
