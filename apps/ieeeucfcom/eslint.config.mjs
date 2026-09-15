import watts from '@watts/eslint-config/next';
import { tailwind } from '@watts/eslint-config/tailwind';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		ignores: [
			'**/node_modules/*',
			'**/dist/*',
			'**/build/*',
			'**/*.d.ts',
			'drizzle/migrations/*',
			'**/coverage/*',
			'**/.env*',
			'**/logs/*',
			'*.config.mjs',
			'eslint.config.mjs',
			'postcss.config.mjs',
		],
	},
	...watts,
	...tailwind('src/app/globals.css'),
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
