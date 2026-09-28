# Site-content CMS — architecture

What it is for: [PRD.md](PRD.md). This document covers how the pieces fit together and how to extend them.

## At a glance

```
 browser (staff / chair / linked officer)
   │  1. uploadSiteMedia()  ──► /api/blob/upload  (authorizeUpload: may this user upload for this page?)
   │  2. bytes ─────────────► public Blob store (site-media/<uuid>.<ext>, immutable)
   │  3. siteContent.confirmMedia ──► finalizeUpload → media_assets row   (nothing is live yet)
   │  4. siteContent.<save>  ──► submitChange
   │                              ├─ staff (manage_site_content) → apply to live table + revision "published" → revalidateTag('site-content')
   │                              └─ everyone else               → revision "pending" → review queue
   ▼
 public pages (static + ISR) ── getSiteContent() [unstable_cache, tag 'site-content'] ── @watts/core read models
                                  └─ DB unreachable / no content → code defaults (today's public/ files)
```

## Where the code lives

| Layer | File | Role |
| --- | --- | --- |
| Schema | `packages/db/src/schema.ts` (migration `0012_site_content_cms`) | Tables below |
| Slot registry | `packages/core/src/site-media-slots.ts` | Named image spots + their code defaults (pure data) |
| Domain | `packages/core/src/site-content.ts` | Permissions, revision engine, CRUD, public read models |
| Permission | `packages/permissions/src/index.ts` | `manage_site_content` capability |
| Uploads | `packages/storage/src/{finalize,keys,env,client}.ts` | `site-media` upload kind, `uploadSiteMedia()` |
| API | `packages/api/src/routers/site-content.ts` → `siteContent` | Thin tRPC layer (zod shapes + who-may-do-what) |
| Cache | `apps/ieeeucfcom/src/lib/site-content.ts` | `unstable_cache` reads with a DB-failure fallback |
| Rendering | `components/slot-image.tsx`, `components/pg/content-page.tsx`, `content-gallery.tsx` | Slot → image; committee/project page layout |
| Preview | `app/pages/[type]/[slug]/preview/page.tsx` | Editor-only preview of saved pages and pending revisions |
| Admin | `components/admin/site-content/*` | `/admin/site-content`, page editor, officer card |
| Import | `infra/seed/src/import-site-content.ts` | One-off move of today's content into the CMS |

## Data model

- **`media_assets`**: one row per uploaded file. Holds the storage key, URL, kind (`image | animated | document`), content type, size, width/height, checksum, alt text, uploader, and scope (`global`, or a committee/project id). Rows are **immutable**: replacing an image uploads a new asset. That means an asset URL can be cached forever, and old revisions always point at files that still exist.
- **`site_media_slots`**: `slot_key → asset_id`. A slot's *definition* (label, page, kind, default file) is code (`SITE_MEDIA_SLOTS`). A missing row, or a null asset, means "use the code default".
- **`officer_profiles`**: the public roster. `member_id` (nullable, unique) links a profile to the member who may self-edit it.
- **`sponsorships`** (pre-existing table): gained `logo_asset_id` and `sort_order`; `money_donated` and `contact_email` became nullable.
- **`committees` / `projects`**: gained page fields: `tagline`, (committees) `apply_url`, `hero_asset_id`, `gallery_asset_ids uuid[]`, `published`.
- **`page_editors`**: explicit per-page grants (`scope_type`, `scope_id`, `member_id`, optional `expires_at`). This is deliberately **not** `member_permissions`: `resolveMemberRoles` ignores that table's context columns, so a scoped grant stored there would behave as a site-wide one. A later role system can absorb this table.
- **`content_revisions`**: an append-only history and review queue. Each row holds `entity_type`, `entity_id`, a full `snapshot` (JSON of the editable fields), `status`, author, reviewer, note and timestamps.

## Who may edit what

`canEditScope(db, actor, scope)` in core is the single check:

1. `manage_site_content` (admins, officers, or an explicit grant) → any scope.
2. `global` scope (page media, officers, sponsors, documents) → staff only.
3. `committee` → the chair (`committees.chair_id` or `committee_members.is_chair`), or an unexpired `page_editors` row.
4. `project` → a lead (`project_members.is_lead`), or an unexpired `page_editors` row.

The linked-officer rule is separate: `submitMyOfficerProfile` only ever targets the caller's own profile and only the fields bio, LinkedIn, major, year and portrait.

The same check runs **twice** for uploads: when the upload token is issued, and again in `confirmMedia`. It also runs on every save.

## Revisions and review

`submitChange({ entityType, entityId, snapshot, actor, direct })`:

1. Checks the entity exists.
2. Validates referenced files: each asset exists and is the right kind for the spot. A non-staff editor may only attach files from their own page's scope, or files they uploaded themselves.
3. If `direct` (the caller has `manage_site_content`):
   - applies the snapshot to the live table
   - inserts a `published` revision
   - marks the previous published revision `superseded`
   - fires `revalidateTag('site-content')`
4. Otherwise it inserts a `pending` revision, replacing the same author's earlier pending one for that item. The live site is untouched.

After that:
- **Approve** applies the pending snapshot exactly as submitted and publishes it.
- **Reject** keeps the note for the author.
- **Restore** re-publishes an old snapshot as a *new* revision, so history is never rewritten.

Snapshots are full, not diffs. Approving an old pending change therefore overwrites anything staff published in the meantime; the review queue shows the diff against *what is live now*, so the reviewer sees exactly what would change.

Non-staff can never change `published` on a committee/project page. The router copies the live value into their snapshot.

**Drafts and preview.** Staff can pass `draft: true` to `submitCommitteePage` / `submitProjectPage`. Their change then goes to the queue as `pending` instead of publishing, and they (or another staff member) approve it after previewing. `/pages/<type>/<slug>/preview` renders the same `ContentPageView` as the public page from `getPagePreview()`:
- By default it shows the live row, published or not.
- With `?revision=<id>` it shows that revision's snapshot.

`getPagePreview` returns null, and the route returns a 404, unless `canEditScope` passes. For a revision, the viewer must also be staff or the revision's author. The route is `force-dynamic` and `noindex`, and it never touches the `site-content` cache, so previews can't leak into the static public pages.

**No transactions:** the website's Neon HTTP driver has none. Writes are ordered (apply live row → insert revision → supersede old) so a failure midway leaves a state a retry fixes.

**Backups** are separate: Neon's point-in-time restore is disaster recovery for the whole database, not a way to undo a content edit. Check the restore window on the current Neon plan.

## Rendering and caching

- Public pages (`/`, `/about`, `/connect`, `/events`, `/projects`, `/sponsorships`, `/committees/[slug]`, `/projects/[slug]`) are static with `revalidate = 3600`. They read through `getSiteContent()`, `getCommitteePage()` and `getProjectPage()`, which are `unstable_cache` entries tagged `site-content`.
- Every publish, approve, restore, delete or reorder calls `ctx.onContentChanged('site-content')`. The tRPC route handler maps that to `revalidateTag`, so changes appear on the next request. `@watts/api` itself stays framework-neutral.
- `getSiteContent()` catches DB errors **outside** the cache and returns empty content, so CI builds (placeholder `DATABASE_URL`) render the code defaults and the failure isn't cached. Page lookups let errors propagate, because a cached 404 for a live page would be worse than an error.
- `<SlotImage slot media>` renders the uploaded asset, or the slot's code default through `AnimatedMedia` / `Image`. The About roster and the sponsor carousel keep their code lists until the CMS has entries. The public sponsor list only includes sponsors with a CMS logo, so pre-existing `sponsorships` rows can't appear by surprise.

## Cost rules (Vercel)

- Stills are compressed in the browser (WebP, max 2400 px, about 2 MB or less) before upload. Animated media is uploaded as animated WebP (GIF is rejected; `scripts/ieeeucfcom/gif-to-webp.mjs` converts).
- Animated assets render `unoptimized`: Vercel doesn't transform them, and routing them through `/_next/image` only adds cache reads and writes.
- Components pass accurate `sizes` to `<Image>`.
- Keys are immutable (`site-media/<uuid>.<ext>`), so long CDN caching is always safe.
- Admin previews use a plain `<img>`, so they don't hit the optimizer.

## Extending

- **New image spot on a page:** add an entry to `SITE_MEDIA_SLOTS`, then render `<SlotImage slot="…" media={slots['…']} …/>` from a server page that calls `getSiteContent()`. No migration needed.
- **New content type:**
  - Add a snapshot type and a read/apply pair in `site-content.ts` (`readCurrent` / `applySnapshot` / `validateSnapshotAssets` / `entityLabel`).
  - Add a zod shape and procedures in the router.
  - Add a section in the manager.
- **Asset cleanup job (future):** delete a `media_assets` row and its file only if no live row *and no revision snapshot* references it (`referencedAssetIds()` helps).

## Import runbook

The one-off import copies today's hardcoded content into the CMS: slot files, the officer roster with portraits, the sponsors with logos, and the sample Software committee page. It is idempotent: it only fills what is empty and never overwrites CMS content.

**What it does with rows that already exist**
- **`software` committee:** the sample page goes on the existing committee, which keeps its chair. Its `about` is replaced by the placeholder text. A committee page that is already published is left alone.
- **Sponsors:** a row with the same company name (case-insensitive) gets the logo attached instead of a duplicate. It keeps its description and website; tier and active follow what the site shows today. Rows for companies that aren't on the site stay hidden.
- **Officers:** the roster is skipped entirely if any officer profile exists. Links to members are made by exact first + last name only.

Nothing is lost. Before the first CMS change to any row, `publish` records the row's current state as a superseded "Original content" revision, so it can be restored from History.

**Steps (production)**
1. Merge, then approve the `migrate` job.
2. In a terminal at the repo root, point the scripts at production. Shell variables win over `.env`, but `.env.local` overrides both, so make sure it doesn't set these. Get the values from Vercel → Settings → Environment Variables (Production). Use the Neon **unpooled** URL.
   ```powershell
   $env:DATABASE_URL = "<DATABASE_URL_UNPOOLED>"
   $env:STORAGE_PROVIDER = "vercel"
   $env:BLOB_READ_WRITE_TOKEN = "<BLOB_READ_WRITE_TOKEN>"
   ```
3. **Inspect.** This is read-only (a `READ ONLY` transaction). It reports the migration state, the `--as` account, existing committees, sponsors and officer name matches, whether public Blob uploads already work, and existing CMS rows.
   ```bash
   pnpm --filter @watts/seed inspect:site-content -- --as=you@example.com
   ```
4. **Dry run**, then **apply**:
   ```bash
   pnpm --filter @watts/seed import:site-content -- --as=you@example.com
   pnpm --filter @watts/seed import:site-content -- --apply --as=you@example.com
   ```
5. Open **/admin/site-content** and click **Refresh public pages**. The script writes to the database directly, so the page cache doesn't know yet.
6. Link officers to members (the script prints unmatched names), grant `manage_site_content`, and assign page editors.
7. Close the terminal, or `Remove-Item Env:DATABASE_URL, Env:STORAGE_PROVIDER, Env:BLOB_READ_WRITE_TOKEN`, so later commands don't hit production.

**If public uploads fail.** The CMS stores files in the *public* Blob bucket, like event flyers and project photos. If the inspection shows no `*.public.blob.vercel-storage.com` files and the import fails on upload, the store is private-only. Create a public Blob store and set `BLOB_RW_TOKEN_PUBLIC` (in Vercel and in your shell).

Nothing in `public/` is deleted.
