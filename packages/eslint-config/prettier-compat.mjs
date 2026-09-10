// eslint-config-prettier as a flat-config entry. Append LAST in any package whose
// formatting is owned by Prettier, so ESLint stops enforcing rules that fight the
// formatter (indent, brace-style, comma-dangle, quotes, semi, space-*, …). The
// non-formatting house rules in rules.mjs stay active.
//
// Wired into next.mjs (the website app) and opted into explicitly by @watts/ui.
// index.mjs's base is left untouched, so the Discord bot and the framework-neutral
// packages keep their stylistic rules until they adopt Prettier too.

export { default } from 'eslint-config-prettier/flat';
