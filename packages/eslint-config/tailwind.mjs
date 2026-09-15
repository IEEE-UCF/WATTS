// Tailwind CSS v4 class-correctness linting — flows through `pnpm lint` (and CI's
// `verify` job). Class *ordering* is owned by prettier-plugin-tailwindcss (see
// prettier.mjs), so this block is correctness-only: duplicate / unknown / conflicting
// utilities.
//
// `no-unknown-classes` and `no-conflicting-classes` start life OFF here — the codebase
// still ships invalid classes (`text-md`, `h-100vh`, …) and the design tokens aren't
// registered with Tailwind yet (globals.css `.inline` bug). They get turned on as
// errors once the P0 foundation PR fixes the token layer and codemods the strays.

import betterTailwindcss from 'eslint-plugin-better-tailwindcss';

/**
 * @param {string} entryPoint  Tailwind CSS entry (the file that `@import`s tailwindcss),
 *   resolved relative to the linted package's cwd — e.g. `src/app/globals.css` for
 *   `@watts/web`.
 * @returns {import('eslint').Linter.Config[]}
 */
export function tailwind(entryPoint) {
	return [
		{
			files: ['**/*.{ts,tsx,js,jsx}'],
			plugins: { 'better-tailwindcss': betterTailwindcss },
			settings: {
				'better-tailwindcss': {
					entryPoint,
					detectComponentClasses: true,
				},
			},
			rules: {
				'better-tailwindcss/no-duplicate-classes': 'warn',
				// Enabled as errors by the P0 foundation PR:
				'better-tailwindcss/no-unknown-classes': 'warn',
				// 'better-tailwindcss/no-conflicting-classes': 'error',
			},
		},
	];
}

export default tailwind;
