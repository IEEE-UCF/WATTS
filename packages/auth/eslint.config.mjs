import { base } from '@watts/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{ ignores: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '*.config.mjs', 'eslint.config.mjs'] },
	...base,
	{
		languageOptions: {
			parserOptions: { tsconfigRootDir: import.meta.dirname },
		},
	},
];
