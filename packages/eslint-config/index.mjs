// Base flat config — framework-agnostic. `@watts/eslint-config/next` layers Next.js on top.
// Consumers add their own `{ ignores: [...] }` and `languageOptions.parserOptions.tsconfigRootDir`.

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { houseRules } from './rules.mjs';

/** @type {import('eslint').Linter.Config[]} */
export const base = [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.stylistic,
	{
		rules: houseRules,
		languageOptions: {
			parserOptions: { projectService: true },
		},
	},
];

export default base;
