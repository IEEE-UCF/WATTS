import watts from '@watts/eslint-config/next';

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
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
