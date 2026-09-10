// Next.js flat config. Layer order matches the original apps/ieeeucfcom/eslint.config.mjs:
//   eslint:recommended → next(recommended + core-web-vitals) → tseslint(recommended + stylistic) → house rules

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import { houseRules } from './rules.mjs';
import prettierCompat from './prettier-compat.mjs';

/** @type {import('eslint').Linter.Config[]} */
export const next = [
	eslint.configs.recommended,
	{
		plugins: { '@next/next': nextPlugin },
		rules: {
			...nextPlugin.configs.recommended.rules,
			...nextPlugin.configs['core-web-vitals'].rules,
		},
	},
	...tseslint.configs.recommended,
	...tseslint.configs.stylistic,
	{
		rules: houseRules,
		languageOptions: {
			parserOptions: { projectService: true },
		},
	},
	// Prettier owns formatting for @watts/web — turn off the ESLint rules that
	// would conflict. Must stay last so it wins.
	prettierCompat,
];

export default next;
