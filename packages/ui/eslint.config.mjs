import { base } from '@watts/eslint-config';
import prettierCompat from '@watts/eslint-config/prettier-compat';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{ ignores: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '*.config.mjs', 'eslint.config.mjs'] },
	...base,
	{
		languageOptions: {
			parserOptions: { tsconfigRootDir: import.meta.dirname },
		},
	},
	// Prettier owns formatting for @watts/ui — must stay last so it wins.
	prettierCompat,
];
