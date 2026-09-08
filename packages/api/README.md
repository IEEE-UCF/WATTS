# @watts/api

The tRPC core and routers for WATTS. Framework-neutral — **no `next`, no `next-auth`,
no React**. The consumer resolves the session and hands in a Drizzle client; this
package never reaches for a singleton.

- **Core:** [`src/trpc.ts`](src/trpc.ts) — transformer, error formatter, context
  factory, procedure builders, role/capability gates.
- **Routers:** [`src/routers/*.ts`](src/routers) — one per domain, wired together in
  [`src/root.ts`](src/root.ts).
- **Error bridge:** [`src/map-domain-error.ts`](src/map-domain-error.ts).
- **Public surface:** [`src/index.ts`](src/index.ts) — `appRouter`, `AppRouter`,
  `createCaller`, `createTRPCContext`, the procedure builders, `mapDomainError`,
  `RouterInputs` / `RouterOutputs`.

## How it's consumed

| Caller | File | Context |
| --- | --- | --- |
| HTTP (client components, `@trpc/react-query`) | `apps/ieeeucfcom/src/app/api/trpc/[trpc]/route.ts` | `fetchRequestHandler` + `getServerSession` + shared `db` |
| RSC / server code | `apps/ieeeucfcom/src/lib/trpc/server.ts` | `createCaller` + `getServerSession` + shared `db` |
| bot / scripts / tests | — | build a `createTRPCContext({ db, session, headers })` and `createCaller` it |

Context is always `createTRPCContext({ db, session, headers })`. `session` is a
structural `ApiSession` (the app's augmented next-auth `Session` is assignable to it),
so the package stays next-auth-free.

## The standard router pattern

Every domain router is **thin**: parse input → call one `@watts/core` function with
`ctx.db` → map errors → return. No business logic, no ad-hoc SQL.

```ts
// packages/api/src/routers/<domain>.ts
const fooCreateSchema = z.object({ /* ... */ });   // zod, colocated here

export const fooRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    try {
      return await listFoos(ctx.db);               // logic lives in @watts/core/foo
    } catch (error) {
      mapDomainError(error);
    }
  }),

  create: adminProcedure
    .input(fooCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return { success: true, ...(await createFoo(ctx.db, input)) };
      } catch (error) {
        mapDomainError(error);
      }
    }),
});
```

Conventions:

- **Input validation** is a `zod` schema in the router file. `create`/`update` schemas
  sit next to the procedures that use them.
- **All logic** is a `@watts/core/*` function that takes `ctx.db` as its first arg and
  throws `DomainError` on a broken invariant. The router does not touch Drizzle
  directly (the `auth` router is the legacy exception — see drift list).
- **Return shape:** queries return the domain result as-is; mutations return
  `{ success: true, ...result }`.
  ⚠️ This envelope is written by ~23 mutations and **read by nothing** in the app
  today — tRPC already signals failure by throwing, so a resolved `mutateAsync()` *is*
  success. It is also applied inconsistently (see drift list). Treat it as a weak
  convention, not a contract: **do not** write `if (res.success)` and rely on it.
- **Errors:** `try { … } catch (error) { mapDomainError(error); }`. `mapDomainError`
  rethrows a `DomainError` as the same-code `TRPCError`, anything else as
  `INTERNAL_SERVER_ERROR`.

## Procedure ladder

Defined in [`src/trpc.ts`](src/trpc.ts). Each builds on the previous.

| Procedure | Adds | `ctx` after it |
| --- | --- | --- |
| `publicProcedure` | timing middleware only | `session` may be `null` |
| `protectedProcedure` | 401 if no `session.user` | `session.user` non-null |
| `officerProcedure` | 403 unless officer **or** admin | `+ roles` (from `resolveMemberRoles`) |
| `adminProcedure` | 403 unless `administrator` | `session.user` |
| `memberProcedure` | 403 unless a `members` row exists | `+ member` (the row) |
| `capabilityProcedure(cap)` | 403 unless admin / officer / holds `cap` | `session.user` |

All role/capability checks resolve through the **single** `resolveMemberRoles`
(`@watts/core/members`) + `hasCapability` (`@watts/permissions`). Add a new gate here,
never inline in a router.

## Errors

Two error types cross into this package:

- **`DomainError`** (`@watts/core/errors`) — codes `NOT_FOUND | CONFLICT | FORBIDDEN |
  BAD_REQUEST`, a deliberate subset of tRPC codes. The normal channel. Bridged by
  `mapDomainError`.
- **`UploadError`** (`@watts/storage/finalize`) — codes `UNAUTHORIZED | FORBIDDEN |
  BAD_REQUEST | TOO_MANY | NOT_FOUND`. The **parallel** channel for the upload path
  only. It is *not* a `DomainError`; `mapDomainError` does not understand it, and it is
  currently mapped by hand in three places (see drift list).

## Uploads & downloads: why they aren't tRPC

File transfer is **not** a tRPC concern. It splits into a *control plane* (tRPC) and a
*data plane* (raw Next Route Handlers):

- tRPC is JSON-RPC over one POST endpoint — no binary bodies, no streaming, no progress.
- Serverless functions cap the request body around 4.5 MB; résumés/photos exceed that.
- `@vercel/blob`'s `handleUpload()` speaks its own token/webhook protocol at a fixed URL.
- Downloads need real HTTP: `Content-Type`, `Content-Disposition`, `Range`, cache
  headers, `X-Robots-Tag`.

The flow (`@watts/storage`):

1. **authorize** — `POST /api/blob/upload` → `authorizeUpload(db, session, intent)`:
   auth, audience/role gate, content-type + size limits, cooldown, and the storage key
   **derived server-side** (never from client input). Returns a presigned `PUT` URL
   (local/MinIO) or a Vercel Blob client token.
2. **transfer** — browser sends bytes straight to storage. They never touch the app
   server.
3. **finalize** — the browser then calls a tRPC mutation (`storage.confirmResume` /
   `event.confirmPhoto`) → `finalizeUpload(db, payload)`: HEAD the object, re-check
   size, magic-byte sniff, sha256, write the DB row. Idempotent on key. For Vercel,
   `onUploadCompleted` calls the same function as a backstop for abandoned tabs.

Gated readers — the only way to read private bytes:
`apps/ieeeucfcom/src/app/api/files/resume/[memberId]/route.ts` and
`apps/ieeeucfcom/src/app/api/files/event-photo/[id]/route.ts`.

---

## Drift punch-list

Nothing here is an active vulnerability. Ranked by what a fix is worth.

### P0 — do soon (safe, no behaviour change for callers)

- **Prod logging of PII.** `createTRPCContext` and `timingMiddleware` in
  [`src/trpc.ts`](src/trpc.ts) `console.log` the full `session.user` (id, email,
  discordId, officerRole, permissions) on **every call, in production**. Gate behind
  `process.env.NODE_ENV === 'development'` (or a `DEBUG` flag).
- **`event.confirmPhoto` mis-maps upload errors.** Its inline `catch`
  (`src/routers/event.ts`) turns every `UploadError` code except `NOT_FOUND` into
  `BAD_REQUEST`, so a finalize `FORBIDDEN` / `TOO_MANY` reaches the client as a 400.
  Route it through the same mapper `src/routers/storage.ts` (`mapUploadError`) uses.

### P1 — consolidate when there's appetite (re-test auth gates)

- **`auth.*` router hand-rolls role queries.** `src/routers/auth.ts` (one file, ~8
  read-only query resolvers). This is **not** "redo auth" — NextAuth issuance and the
  procedure gates above are untouched and already use `resolveMemberRoles`; these
  queries only feed UI ("show the admin link?"). What consolidating buys, in order:
  1. **One real skew, present-tense:** `getAuthStatus` builds `permissions` with
     `active = true` only — it omits the `expires_at > now()` filter that
     `resolveMemberRoles` applies. So **expired capability grants still show up** in
     that endpoint and any UI keyed off it (`hasStaffAccess` via `hasStaffCapability`).
     Enforcement is unaffected. `isAdmin` / `isOfficer` / `getOfficerRole` /
     `hasPaidDues` / `isMember` read the same columns the same way `resolveMemberRoles`
     does today — pure duplication, no bug.
  2. **Maintainability (the main reason):** ~60–90 lines of repeated
     `select … from Members where user_id` collapse to one `resolveMemberRoles` call;
     role rules then live in exactly one place; `getAuthStatus` stops re-deriving
     session shape the NextAuth callback already builds.
  3. **Compute — mild regression risk, not a win:** `auth.isAdmin` today is one
     1-column `LIMIT 1`; `resolveMemberRoles` is two queries. A page calling four of
     these separately would multiply the work. Only do this *with* a "collapse the
     client to one `me` / `getAuthStatus` call" step, or a per-request memo of
     `resolveMemberRoles` — never a blind find-replace.
- **Byte-streaming routes inline their auth.** `files/resume` and `files/event-photo`
  each hand-write `getServerSession` → null check → `hasCapability` → `Response(403)`.
  Unavoidably not-tRPC, but there's no shared helper. Add
  `requireCapability(session, cap, db)` and use it in both, plus one integration test
  hitting each route as owner / staff / stranger / anon and asserting status codes.
- **Capability freshness.** `hasCapability(session.user, …)` in the file routes reads
  the **session token** (populated at login), not live DB — a revoked capability
  lingers until the session refreshes. Pick one rule and document it: accept the
  staleness everywhere *except* the résumé route (PII), which should re-resolve from DB.

### Documented as-is (won't fix in isolation)

- **`{ success: true }` envelope** — written ~23×, read 0× in the app, and skipped by
  `storage.confirmResume`, `event.confirmPhoto` (raw `finalizeUpload` output),
  `officer.promote` (`{ success, officer }`), `settings.setOfficerGrantableCapabilities`
  (`{ enabled }`). Kept by decision; noted so nobody trusts `res.success`.
- **`storage` router + `event.confirmPhoto` bypass the `@watts/core` template** — they
  call `@watts/storage` directly. Intentional: `@watts/storage` is its own domain layer
  with its own validation (magic bytes, size, checksum) — defense in depth, not drift.
- **`timingMiddleware` adds 100–500 ms random latency in dev**, on every call including
  `publicProcedure`. Deliberate network simulation; just know it's there.
- **Stale comments:** `src/map-domain-error.ts` line 9 ("Moves into @watts/api … in
  Phase 6" — already done); `src/trpc.ts` line ~114 ("helper stuff").
