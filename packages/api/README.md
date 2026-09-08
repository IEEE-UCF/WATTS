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
  directly. Exceptions: `storage` / `event.confirmPhoto` call `@watts/storage`
  (its own domain layer — see drift list); `auth` reads `ctx.getRoles()` and two
  narrow status columns.
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
| `officerProcedure` | 403 unless officer **or** admin | `+ roles` (from `ctx.getRoles()`) |
| `adminProcedure` | 403 unless `administrator` | `session.user` |
| `memberProcedure` | 403 unless a `members` row exists | `+ member` (the row) |
| `capabilityProcedure(cap)` | 403 unless admin / officer / holds `cap` | `session.user` |

All role/capability checks resolve through `ctx.getRoles()` — a **per-request-memoised**
`resolveMemberRoles` (`@watts/core/members`) set up in `createTRPCContext`, plus
`hasCapability` (`@watts/permissions`). The `auth.*` router uses the same `ctx.getRoles()`,
so a batched request that touches several gates + `auth.*` resolves roles once. Add a new
gate here, never inline in a router.

## Errors

Two error types cross into this package:

- **`DomainError`** (`@watts/core/errors`) — codes `NOT_FOUND | CONFLICT | FORBIDDEN |
  BAD_REQUEST`, a deliberate subset of tRPC codes. The normal channel. Bridged by
  `mapDomainError`.
- **`UploadError`** (`@watts/storage/finalize`) — codes `UNAUTHORIZED | FORBIDDEN |
  BAD_REQUEST | TOO_MANY | NOT_FOUND`. The **parallel** channel for the upload path
  only; not a `DomainError`. Bridged by **`mapUploadError`** (next to `mapDomainError`
  in `src/map-domain-error.ts`), which uses the single `uploadErrorTRPCCode` /
  `uploadErrorHTTPStatus` maps from `@watts/storage/finalize`. Used by `storage.*`,
  `event.confirmPhoto`, and (HTTP-status form) the `/api/blob/upload` route.

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
`apps/ieeeucfcom/src/app/api/files/event-photo/[id]/route.ts`. Route-handler auth uses
`requireSession()` / `requireCapability(cap)` from `apps/ieeeucfcom/src/lib/auth-guards.ts`
(returns the value or a `Response` to return as-is). Capabilities there are resolved
from the DB via `resolveMemberRoles`, **not** the session token, so a revoked grant
takes effect on the next request.

---

## Drift punch-list

Nothing here was ever an active vulnerability.

### Fixed

_(commit "chore(api): consistency pass" — P0 + the safe P1 items)_

- **Prod logging of PII** — `createTRPCContext` / `timingMiddleware` (`src/trpc.ts`)
  now log only under `NODE_ENV === 'development'`, and the context line logs
  `session.user.id`, not the whole user object.
- **`event.confirmPhoto` error mis-map** — it now uses the shared `mapUploadError`, so
  a finalize `FORBIDDEN` / `TOO_MANY` surfaces as the right code, not `BAD_REQUEST`.
- **Three hand-rolled `UploadError` mappers** — collapsed to `mapUploadError` (tRPC) +
  `uploadErrorTRPCCode` / `uploadErrorHTTPStatus` (`@watts/storage/finalize`).
- **`auth.*` hand-rolled role queries** — `isMember` / `isOfficer` / `isAdmin` /
  `getOfficerRole` now read `ctx.getRoles()`; `getAuthStatus` builds `permissions`
  from it too, so **expired capability grants no longer leak** into that endpoint.
  `hasPaidDues` keeps its own narrow read (dues is a status flag, not a role).
  Compute stays flat: `ctx.getRoles()` memoises `resolveMemberRoles` per request, so
  several `auth.*` calls + gates in one batch resolve roles once.
- **Byte-route auth** — `files/resume` + `files/event-photo` use
  `requireSession()` / `requireCapability()` (`apps/ieeeucfcom/src/lib/auth-guards.ts`).
  Capabilities resolve from the DB, not the session token, so a revoked grant blocks
  the next request.
- **Stale comments** removed (`map-domain-error.ts` "Phase 6"; `trpc.ts` "helper stuff").

### Outstanding

- **No gated-route test.** There's no test runner in the repo yet. When one lands, add
  an integration test hitting `files/resume` + `files/event-photo` as owner / staff /
  stranger / anon and asserting the status codes — that's the regression lock for the
  hand-rolled route auth.
- **`getAuthStatus` still does its own `Users` + `Members` selects** for `discordAvatar`
  and the `member` object (fields not in `MemberRoles`). Fine, just not fully deduped.
- **Client still calls `auth.*` piecemeal.** `ctx.getRoles()` makes that cheap now, but
  collapsing the frontend onto one `getAuthStatus` call would be tidier.
- **`memberProcedure`** still runs its own `select … from Members` (it needs the full
  row, which `resolveMemberRoles` doesn't return). Left as-is.

### Documented as-is (won't fix in isolation)

- **`{ success: true }` envelope** — written ~23×, read 0× in the app, and skipped by
  `storage.confirmResume`, `event.confirmPhoto` (raw `finalizeUpload` output),
  `officer.promote` (`{ success, officer }`), `settings.setOfficerGrantableCapabilities`
  (`{ enabled }`). Kept by decision; noted so nobody trusts `res.success`.
- **`storage` router + `event.confirmPhoto` bypass the `@watts/core` template** — they
  call `@watts/storage` directly. Intentional: `@watts/storage` is its own domain layer
  with its own validation (magic bytes, size, checksum) — defense in depth, not drift.
- **`timingMiddleware` adds 100–500 ms random latency in dev**, on every call including
  `publicProcedure`. Deliberate network simulation; dev-only; just know it's there.
