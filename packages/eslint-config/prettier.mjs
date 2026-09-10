// Shared Prettier config. Ported from apps/ieeeucfcom/.prettierrc, plus
// prettier-plugin-tailwindcss for deterministic Tailwind class ordering.

import { fileURLToPath } from 'node:url';

// Tailwind v4 has no JS config — the plugin reads the CSS entry (the file that
// `@import`s tailwindcss) to learn the utility order, including `@theme` tokens.
// Resolved here to an absolute path so it holds no matter which prettier.config
// file Prettier picks for a given source file (root vs apps/ieeeucfcom).
const tailwindStylesheet = fileURLToPath(
	new URL('../../apps/ieeeucfcom/src/app/globals.css', import.meta.url),
);

/** @type {import('prettier').Config} */
export default {
	semi: true,
	trailingComma: 'all',
	singleQuote: true,
	printWidth: 100,
	tabWidth: 4,
	useTabs: true,
	bracketSpacing: true,
	arrowParens: 'always',
	endOfLine: 'lf',
	plugins: ['prettier-plugin-tailwindcss'],
	tailwindStylesheet,
	tailwindFunctions: ['cn', 'cva', 'clsx'],
};
