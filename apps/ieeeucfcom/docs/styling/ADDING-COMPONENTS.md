# Adding a Component

This is the process doc: **where a new component goes, how to scaffold it, and what
"done" means.** For color/typography rules see [STYLING.md](./STYLING.md); for how the
token system itself works see [STYLING-ARCHITECTURE.md](./STYLING-ARCHITECTURE.md); for
interactive-pattern reference (buttons, forms, cards) see [COMPONENTS.md](./COMPONENTS.md).

---

## 1. Decide where it lives — one question

**Is this reusable across contexts (or future website derivatives), or is it
IEEE-branded / page-specific?**

| | Reusable / generic | Brand-specific / page-specific |
|---|---|---|
| Lives in | `packages/ui/src/` | `apps/ieeeucfcom/src/components/<group>/` |
| Consumes | semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`) | IEEE brand tokens (`bg-ieee-black`, `text-ieee-dark-yellow`, `font-heading`) |
| Examples today | `button.tsx`, `card.tsx`, `input.tsx` | `glow-button.tsx`, `navbar.tsx`, `hero` sections |

Full rationale: [STYLING-ARCHITECTURE.md §12](./STYLING-ARCHITECTURE.md#12-decision-guide-semantic-or-ieee).

If you're not sure, default to app-local — it's much cheaper to promote an app component
into `packages/ui` later than to walk back a shared primitive that grew IEEE-specific
assumptions.

## 2. Check it doesn't already exist

Before writing anything:

- Run `pnpm dev` and browse `/dev` — every `packages/ui` primitive and every registered
  app component is there, live, with controls.
- Grep `packages/ui/package.json`'s `exports` map for the shape you're about to build.

This step exists because it was skipped at least three times in this codebase already —
see §5.

## 3. Scaffold it

```bash
pnpm gen:component <kebab-name> --shared               # packages/ui/src/<name>.tsx
pnpm gen:component <kebab-name> --app --group <group>  # apps/.../components/<group>/<name>.tsx
```

`<group>` is one of the `GalleryGroup` values in
[`src/dev/registry/types.ts`](../../src/dev/registry/types.ts): `ui | layout | marketing |
dashboard | admin | qr | staff | misc`.

The generator (`scripts/gen-component.mjs`) does four things:

1. Writes the `.tsx` file from a template matching the repo's existing conventions
   (`cva` + `VariantProps` + `data-slot` + `cn()` for `--shared`; a plain
   brand-token component for `--app`).
2. For `--shared`, adds the new `exports` entry to `packages/ui/package.json`.
3. Adds an entry to `apps/ieeeucfcom/src/dev/registry/meta.ts`.
4. Adds the matching import + render function to `renders.tsx`.

Steps 3 and 4 are the part that's easy to forget by hand — see §4.

## 4. The gallery entry is not optional

Per [CONTRIBUTING.md](../../../../CONTRIBUTING.md#ui-components): **every new reusable
component — app-local or `@watts/ui` — ships with a gallery entry.** The generator does
this for you, but if you're hand-writing one (e.g. registering a pre-existing component),
here's the pair to keep in sync:

`apps/ieeeucfcom/src/dev/registry/meta.ts`:

```ts
{
	slug: 'ui/badge',
	name: 'Badge',
	group: 'ui',
	status: 'ok',
	source: '@watts/ui/badge',
	controls: [
		{ name: 'children', type: 'text', default: 'New' },
		{ name: 'variant', type: 'select', options: ['default', 'outline'], default: 'default' },
	],
},
```

`apps/ieeeucfcom/src/dev/registry/renders.tsx` (import at the top, entry in the `renders` map):

```tsx
import { Badge } from '@watts/ui/badge';
// ...
'ui/badge': (p) => <Badge variant={p.variant as never}>{p.children as string}</Badge>,
```

Run `pnpm dev`, open `/dev/<slug>`, confirm it renders and the controls work.

## 5. Known duplication patterns — don't reintroduce these

Three real duplicates were found and merged in this codebase; the same mistake is easy to
make again on a new component:

- **Don't hand-roll a mobile/viewport hook.** `useIsMobile` exists at
  `@watts/ui/use-mobile` (`window.innerWidth < 768` + resize listener). It was
  reimplemented three times before being consolidated.
- **Don't copy-paste the glow-halo CTA markup.** `GlowButton`
  (`apps/ieeeucfcom/src/components/ui/glow-button.tsx`) is the near-black-content-surface
  + external-halo pattern used across the marketing pages. If your button doesn't fit that
  exact shape (e.g. it needs its own solid background, or the halo wraps a whole card
  rather than a button), don't force it in — that's a sign a distinct primitive is needed
  (see below), not that `GlowButton` should grow more props to cover every case.
- **Don't name two different components the same thing in two different files.**
  `pg/memberqrcode-gen.tsx` and `pg/memberqrcodegen.tsx` both exported a default
  `MemberQRCode` with meaningfully different behavior (different QR error-correction
  level, different wrapper). Two pages ended up importing the two different files under
  the same imported name. Use named exports (`export function Foo`), not `export default`,
  for anything that isn't a Next.js page/layout — it makes an accidental duplicate import
  a type error instead of a silent footgun.

### Candidates for a future primitive, not yet built

Found while consolidating `GlowButton` call sites — two other glow-decorated patterns
exist that don't fit `GlowButton`'s single-content-surface model and were deliberately
left as inline markup rather than forced in:

- **`GlowFrame`** — a border-glow *around* an existing block (a flip-card, a whole
  `Card`), not a CTA surface. See `aboutheader.tsx`'s flip-card frame and
  `projectspage.tsx`'s project-card frame.
- **`GlowPill`** — a solid-color pill with a self-glow (`bg-ieee-dark-yellow` +
  `inset-0` halo), distinct from `GlowButton`'s near-black-surface-plus-external-halo
  look. See `navbar.tsx`'s two sign-in buttons.

If you're about to build either of these, that's the sign to extract the primitive rather
than adding a fourth inline copy.

## 6. Naming

- Kebab-case filenames (`sponsor-tile.tsx`, not `SponsorTile.tsx` or `sponsortile.tsx`).
- PascalCase exports, named (not default) exports.
- No barrel (`index.ts` re-export) files — the repo doesn't use them; they blur the
  client/server component boundary in the App Router.
- App components live under a `GalleryGroup`-named subfolder
  (`components/marketing/`, `components/qr/`, …), not loose in `components/`.
