# Validation scripts

Small standalone scripts that check a piece of **shared domain logic** against a
freshly seeded local database, without booting the bot or the website.

The repo has no test runner yet. These fill the gap for the cases that matter most —
logic in `@watts/core` that several apps depend on and that breaks quietly when the
schema or seed data shifts. They are fast to write, have no framework, and exit
non-zero on failure so they read like a test in CI output.

| Script | npm script | Checks |
| --- | --- | --- |
| [`whois-check.mts`](whois-check.mts) | `pnpm --filter @watts/bot check:whois` | `@watts/core/members` `resolveWhois` + `formatWhois` + `pronounsForGender` — the logic behind the Discord `/whois` command |

---

## How `whois-check.mts` was built

It is the reference template. Anatomy, top to bottom:

1. **Load env before anything reads it.**
   ```ts
   import { loadRootEnv } from '@watts/config/load-env';
   loadRootEnv();                       // pulls DATABASE_URL from the repo-root ./.env
   ```
   `loadRootEnv()` runs before the `@watts/db` / `@watts/core` imports so
   `process.env.DATABASE_URL` is set when the DB client is constructed.

2. **Open one direct DB connection, keep the teardown handle.**
   ```ts
   import { createNodePgClient } from '@watts/db/node';
   const { db, end } = createNodePgClient({ url: process.env.DATABASE_URL! });
   ```
   No ORM singleton, no app context — just a `node-postgres` client pointed at the
   local stack on `:3051`.

3. **Import the shared function under test — not the app glue.**
   ```ts
   import { resolveWhois, formatWhois, pronounsForGender } from '@watts/core/members';
   ```
   The Discord command is a thin wrapper around these. Testing the `@watts/core`
   functions covers every consumer at once.

4. **A three-line assert helper + a failure counter.**
   ```ts
   let failures = 0;
   function check(label: string, ok: boolean, detail = '') {
     console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${detail && !ok ? `\n         ${detail}` : ''}`);
     if (!ok) failures++;
   }
   ```
   `detail` (usually the actual rendered output) prints only on failure.

5. **Bail early if the seed is missing**, with a message that says how to fix it:
   ```ts
   const john = await resolveWhois(db, { name: 'john doe' });
   if (john.status === 'no-match') {
     console.error('\nSeed data missing — run `pnpm db:reset` first.\n');
     await end();
     process.exit(1);
   }
   ```

6. **Print the real output, then assert on it.** Each case logs what a user would
   actually see (`formatWhois(...)`), then `check()`s substrings of it. A human
   skimming the output can spot a wrong sentence even if every assertion passes.

7. **Cover the shape, not just the happy path.** The 9 cases walk every branch of the
   `WhoisResult` union (`found` / `not-registered` / `no-match` / `ambiguous`), a
   lookup-key equivalence (by Discord id === by name), a "no attendance" variant, and
   two pure-formatter edge cases (links sentence, pronoun table) built from an
   in-memory object — no DB needed for those.

8. **Close the connection, exit with the count.**
   ```ts
   await end();
   console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
   process.exit(failures === 0 ? 0 : 1);
   ```

---

## Adding a new one

1. **Put the logic in `@watts/core` first.** If what you want to validate lives inside
   an app (a command handler, a route), extract the testable part into
   `packages/core/src/*` and have the app call it. The script imports from
   `@watts/core/<module>`, never from `apps/**`.

2. **Create `scripts/<feature>-check.mts`** in the workspace that owns the feature.
   Use `.mts` + `tsx` (already a devDependency of `@watts/bot` and `@watts/seed`; add
   `tsx` to `devDependencies` if the workspace doesn't have it).

3. **Add the npm script**, prefixed `check:`:
   ```jsonc
   // <workspace>/package.json
   "scripts": {
     "check:<feature>": "tsx scripts/<feature>-check.mts"
   }
   ```

4. **Follow the skeleton** below.

5. **List it** in the table at the top of this file and in the "Checks" line of
   [`DEVELOPING.md`](../../../DEVELOPING.md).

### Skeleton

```ts
/**
 * Validation for <the shared function(s)> in @watts/core/<module>.
 * Run against a freshly seeded local DB:
 *
 *   pnpm db:reset
 *   pnpm --filter @watts/<pkg> check:<feature>
 *
 * Exits non-zero if any case fails.
 */
import { loadRootEnv } from '@watts/config/load-env';
loadRootEnv();

import { createNodePgClient } from '@watts/db/node';
import { theThingUnderTest } from '@watts/core/<module>';

const { db, end } = createNodePgClient({ url: process.env.DATABASE_URL! });

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${detail && !ok ? `\n         ${detail}` : ''}`);
  if (!ok) failures++;
}
const has = (s: string, ...needles: string[]) => needles.every((n) => s.includes(n));

// --- seed guard -----------------------------------------------------------
const probe = await theThingUnderTest(db, /* a known-seeded input */);
if (/* probe indicates missing seed */ false) {
  console.error('\nSeed data missing — run `pnpm db:reset` first.\n');
  await end();
  process.exit(1);
}

console.log('\n<feature> validation\n');

// --- cases --------------------------------------------------------------
{
  const r = await theThingUnderTest(db, /* input */);
  console.log(`  <input> → ${JSON.stringify(r)}`);
  check('<what this proves>', /* boolean */ true, JSON.stringify(r));
}

// ...one block per case: happy path, every result branch, key equivalences,
//    edge cases in any pure formatter (those need no DB).

// --- done ------------------------------------------------------------------
await end();
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
```

---

## Conventions

- **Name:** file `scripts/<feature>-check.mts`, npm script `check:<feature>`.
- **Depend only on** workspace packages (`@watts/*`) and Node built-ins. No test
  framework, no new npm deps.
- **Read-only.** Query the seeded DB; don't write to it. Build mutation/edge inputs as
  in-memory objects (see `whois-check.mts` case 8).
- **Deterministic against the seed.** Assert on values the seed script guarantees
  (`infra/seed/src/seed.ts`). If you need a row the seed doesn't create, add it to the
  seed, don't insert it from the script.
- **Exit code is the contract:** `0` = all passed, `1` = something failed or the seed
  was missing.

## Running / CI

Local, after the stack is up:

```bash
pnpm infra:up
pnpm db:reset                        # wipe + migrate + seed  (the scripts assume a clean seed)
pnpm --filter @watts/bot check:whois
```

In CI, the **`smoke`** job in `.github/workflows/ci.yml` does exactly this: it
starts a `postgres:15` service, runs `pnpm db:migrate && pnpm db:seed` against it,
then `pnpm --filter @watts/bot check:whois` — on every PR and every push to `main`.
Add new `check:*` scripts to that job's final step as they land (or wire a `check`
task into `turbo.json` and switch the step to `turbo run check`).

## When to reach for a real test runner instead

These scripts are integration smoke checks — "does the shared logic still produce the
right shape and prose against a realistic database". For unit-level coverage (many
small pure-function cases, mocking, coverage reports) the repo will want Vitest. When
that lands, either migrate these or keep them as the fast DB-backed smoke layer.
