# Dashboard/admin structural consolidation — iteration log

Scope: **structure only, same rendered look.** Every admin/dashboard component
already shares the same color tokens (post the earlier tokenization pass) —
what's left is that most of them hand-roll the same visual patterns
independently instead of sharing one implementation. This log tracks each
consolidation step: what existed before, what changed, and where to look to
see it live.

No visual redesign is happening here. If a step changes a pixel that wasn't a
deliberately-called-out fix, that's a bug, not an intended outcome.

---

## Step 1 — `TogglePill` (done)

**Before:** 4 independent hand-rolled toggle-button implementations:
- `event-manager.tsx`'s `LabelBar` category chip (`border-input text-foreground` / `border-border text-muted-foreground-dim line-through`)
- `members-manager.tsx`'s admin toggle (`bg-ieee-dark-yellow text-black` / shared unselected string)
- `members-manager.tsx`'s officer toggle (`bg-blue-600 text-white` / same shared unselected string)
- `members-manager.tsx`'s per-capability toggle (`bg-green-700 text-white` / same shared unselected string)
- `resume-filter-bar.tsx`'s grad-year pill (`border-ieee-dark-yellow bg-ieee-dark-yellow/15 text-ieee-dark-yellow` / `border-input text-muted-foreground hover:border-foreground`)

The unselected state had already converged to `border-border text-muted-foreground hover:border-foreground` in 4 of 5 places — only the selected color and the chip-vs-pill shape varied.

**After:** one component, `apps/ieeeucfcom/src/components/ui/toggle-pill.tsx`,
`<TogglePill selected tone="..." size="..." shape="...">`, covering every
existing case with the same rendered classes.

**Retrofitted:** `members-manager.tsx` (admin/officer/capability toggles, 3
sites), `resume-filter-bar.tsx` (grad-year pill, 1 site).

**Deliberately NOT retrofitted:** `event-manager.tsx`'s `LabelBar` category
chip. On inspection it's not actually a toggle button — it's a `<span>`
composite badge (color swatch + name + a "linked to Google" marker + an
embedded action `<button>` for rename/delete). Forcing it into
`<TogglePill>` would nest a `<button>` inside a `<button>` (invalid HTML)
and doesn't match the component's real shape. This is the "doesn't actually
fit" case rather than a missed consolidation.

**See it live:** `/dev/ui/toggle-pill` (once registered), or the 4
retrofitted call sites above.

---

## Step 2 — `Table` primitive set (done)

`packages/ui/src/table.tsx` — `Table`/`TableHeader`/`TableBody`/`TableRow`/
`TableHead`/`TableCell`/`TableEmpty`, replacing the 3 independently
hand-rolled `<table>`s in `event-manager.tsx`, `members-manager.tsx`,
`resume-dashboard.tsx`. One deliberate 1-line convergence: inactive-row
opacity standardized to `50` (was `40` in `resume-dashboard.tsx` only, `50`
everywhere else for the same meaning) — now baked into `TableRow`'s
`inactive` prop, so it can't drift apart again.

`event-manager.tsx`'s distinct header treatment (`bg-card/60 text-xs
uppercase`, vs. the other two tables' plain `bg-card`) was preserved via an
explicit `className` override on `TableHeader` rather than forced to match
— that's a deliberate style choice in that file, not a bug.

Also registered `EventManager`, `MembersManager`, `ResumeDashboard` in the
`/dev` gallery for the first time (the `admin` group had zero entries
before this) — as `legacy` (needs a real admin/officer session, so they
show their loading state rather than live data in the gallery), plus a new
`ui/table` gallery entry with mock data, which is what's actually visible
in the screenshot check below.

**See it live:** `/dev/ui/table` shows the primitive with mock data
(active row, dimmed inactive row, empty-state message) since the 3 real
retrofitted tables need an authenticated admin session to show rows.
`/dev/admin/event-manager`, `/dev/admin/members-manager`,
`/dev/admin/resume-dashboard` confirm the retrofitted components render
without crashing (loading state only, no session in this environment).

---

## Step 3 — Card panel convention (done)

Adopted `@watts/ui/card`'s `Card` as the structural wrapper for
`staff-hub.tsx`'s hand-rolled `Panel` (a `<section>` → `<Card>`, `<h2>`
header kept as a direct child rather than forced into `CardHeader`'s grid
layout, which doesn't match this panel's simple flex-row title — same
"use Card as shell, keep the internals" judgment call as `event-list.tsx`),
`event-photo-manager.tsx`'s photo grid cards, and `resume-dashboard.tsx`'s
résumé preview panel. Each passes an explicit `className` override
(`gap-0` to cancel `Card`'s default `gap-6` flex spacing, plus the
radius/opacity/padding each site already had) to preserve current pixels
exactly.

**Caught and fixed a real bug during this step:** one of my own edits to
`resume-dashboard.tsx` wrote 4 JSX attribute values using Unicode smart
quotes (`”…”`) instead of straight quotes — invalid JSX syntax that broke
`prettier --check` immediately. Fixed by targeting exactly those 4
attribute lines (leaving the file's one legitimate prose smart-quote,
"Select 'preview'...", untouched).

**Deliberately NOT retrofitted:** `staff-hub.tsx`'s "no staff tools yet"
message box (`<p className="rounded-lg border border-border bg-card/60 p-4 ...">`).
It's a `<p>` tag, not a titled panel — converting it to `<Card>` (a `<div>`)
would be a semantic-tag change for a simple one-off message, not a
duplicated pattern.

**See it live:** `/dev/ui/card` confirms the underlying primitive renders
correctly. `/dev/staff/staff-hub` confirms `Panel`'s retrofit doesn't
crash (loading state only, no session in this environment — same
limitation as the Table-primitive step).

---

## Step 4 — Shared form-field primitives (not started)

Adopt `@watts/ui/input`/`label` in `event-manager.tsx`'s `EventForm` and
`dashboard/newEventForm.tsx`'s `FormPopup` in place of their independent
hand-rolled field markup. The two forms stay separate components with their
current, different field sets — this is not a merge. Two real bugs fixed
along the way: `FormPopup`'s dead unused `hostId` state (tracked but never
rendered as a field), and a `mr-30` Tailwind typo (7.5rem gap, almost
certainly meant `mr-3`).
