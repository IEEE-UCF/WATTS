# PRD — Site-content CMS

Status: shipped in the `feat/site-content-cms` PR. How it works: [ARCHITECTURE.md](ARCHITECTURE.md).

## Problem

Most of what visitors see on the public site is hardcoded:

- the officer roster, bios and headshots (`components/pg/aboutofficers.tsx`)
- the sponsor list, logos and the sponsorship packet PDF (`components/pg/sponsorshipsclient.tsx`)
- ~25 page photos and animations in `apps/ieeeucfcom/public/` (home carousel, page headers, About and Connect photos, new-member steps)

Changing any of it means a code change, a pull request and a deploy, so it only happens when a developer has time. Officers turn over every year, sponsors change every semester, and committees and projects have no public page of their own. Every file in `public/` also ships with every deployment.

## Goals

1. Officers and staff update photos, the officer roster, sponsors and the packet PDF from the website, with no deploy.
2. Committee chairs and project leads (and anyone assigned to a page) maintain their own public page: description, apply link and a photo carousel.
3. Every change is recorded, reviewable and reversible.
4. Edits from people who aren't site-wide editors are reviewed before they go live.
5. The public site stays fast and cheap: static pages, cached images, no extra Vercel image-optimizer cost.
6. Shipping this changes nothing visible until content is imported.

## Non-goals (this release)

- Editing page body text on the marketing pages (About accordion copy, Connect steps text). Committee/project page text *is* editable.
- A rich-text editor. Page descriptions are plain text; a blank line starts a new paragraph.
- A visual redesign of the committee/project pages. They are intentionally plain; a styling pass comes later.
- Replacing the role system. Roles stay as they are; a Discord-linked role system is future work.
- Deleting the migrated files from `public/` (a follow-up once production is verified).

## Users and permissions

| Who | How they get it | Can do | Their edits |
| --- | --- | --- | --- |
| Admin | `members.administrator` | Everything | Publish immediately |
| Officer | `members.officer_status` | Everything below (officers get every capability) | Publish immediately |
| Website editor | `manage_site_content` grant on /admin/members | Page media, documents, officers, sponsors, every committee/project page, review queue, history/restore, page-editor assignments | Publish immediately |
| Committee chair | `committees.chair_id` or `committee_members.is_chair` | Their committee's page | Go to review |
| Project lead | `project_members.is_lead` | Their project's page | Go to review |
| Assigned page editor | A row in `page_editors` (optional expiry), set on /admin/site-content → Page editors | That one page | Go to review |
| Linked officer | Their member is linked to an officer profile | Bio, LinkedIn, major, year, professional photo on their own profile | Go to review |

Officer profiles are separate from member accounts: the roster can include people who haven't registered, and officers use a professional photo in place of their Discord avatar.

## Requirements

### Staff (/admin/site-content)

- **Review queue:** every pending change with author, time, and a live-vs-proposed diff (with thumbnails for photos); approve (publishes) or reject, with an optional note to the author.
- **Page media:** each named image spot on each page, with its current file; upload a replacement (still image, or animated WebP where the spot is animated), reset to the built-in default, and view history.
- **Documents:** the sponsorship packet PDF.
- **Officers:** add, edit, reorder, mark as past (hidden), delete, upload a portrait, link to a member.
- **Sponsors:** add, edit, reorder, hide, delete, upload a logo.
- **Page editors:** list committee/project pages (edit/view links), assign a member to a page with an optional expiry, remove assignments.
- **History:** every item keeps its versions; any older version can be restored (restoring creates a new version, so nothing is lost).
- **Refresh public pages:** re-render the cached pages, for use after a bulk import.

### Page editors (/pages/committee/<slug>/edit, /pages/project/<slug>/edit)

- Edit the tagline, description and (committees) apply link, upload a header image, and add, reorder or remove carousel photos.
- Staff also control whether the page is published.
- Non-staff see "submitted for review", their latest submission's status, and any reviewer note.
- `/dashboard` lists the pages the member can edit.
- **Preview** (`/pages/<type>/<slug>/preview`): anyone who can edit the page sees the saved version, even while unpublished, under a "Preview" bar. `?revision=<id>` shows a submitted change as it would look if approved; only its author and staff can open it. Everyone else gets a 404. The editor links to both, and the review queue has "Preview as page".
- **Save as draft** (staff): sends a staff edit to the review queue instead of publishing, so it can be previewed and then approved.

### Linked officers (/settings)

- An "Officer profile" card to edit their own bio, LinkedIn, major, year and professional photo, with review status shown.

### Public site

- Existing pages look exactly as before until content is imported, because every image spot falls back to its current file.
- `/committees/<slug>` and `/projects/<slug>` exist once published (otherwise the site's 404 page) and are listed in the sitemap.
- Sample: `/committees/software`, "run by Dawn Balaschak", with an Apply link and a photo carousel.

## Success metrics

- Content changes stop needing pull requests: target zero code PRs for roster, sponsor or photo updates next semester.
- Every chair and lead has a published page by the end of the semester.
- Median time from a chair's submission to review under 3 days.
- No regression in Vercel image-optimization usage (tracked in the usage dashboard after launch).

## Rollout

1. Merge. Approve the gated `migrate` job (the migration is expand-only and safe for the old code). The site deploys looking identical.
2. Run the import against production: first a dry run, then `--apply` ([runbook](ARCHITECTURE.md#import-runbook)). Then click **Refresh public pages**.
3. Link officer profiles to members. Grant `manage_site_content` where needed. Assign page editors.
4. Follow-ups:
   - a styling pass for committee/project pages
   - deleting the migrated `public/` files and the old `public/events/*.png` flyers
   - pinning the Blob host in `remotePatterns`
   - editable page text
   - a Discord-linked role system

## Risks

| Risk | Mitigation |
| --- | --- |
| A bad upload goes live | Delegated edits are reviewed; staff edits are one click to restore from History |
| Old rows in `sponsorships` appear unexpectedly | The public list only shows sponsors that have a CMS logo |
| Un-approving content still cached | Every publish/approve/restore revalidates the page cache immediately |
| Storage/optimizer cost creeps up | Images are compressed on upload, animated media skips the optimizer, and files are immutable so caching is always safe (see ARCHITECTURE.md) |
| Database loss | Neon point-in-time restore (disaster recovery only, not content rollback) |
