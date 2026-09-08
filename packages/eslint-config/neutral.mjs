// Framework-neutrality guard for the bot-shareable packages (@watts/db, @watts/core,
// @watts/permissions). These must never reach for next / next-auth / @trpc / react /
// discord.js, or for the website-only sibling packages — otherwise the Discord bot (a
// later, separate effort) can't consume them without rework.
//
// Deliberately import-only: no typed linting / projectService, so it is fast and can
// never flake on type-checker setup. Layer it AFTER a package's own config, or use it
// standalone.

import tseslint from 'typescript-eslint';

const message =
	'@watts/{db,core,permissions} must stay framework-neutral so the Discord bot can consume them. Keep next / next-auth / @trpc / react / discord.js and the website-only packages (@watts/api, @watts/auth, @watts/storage) out.';

const banned = {
	paths: [
		{ name: 'next', message },
		{ name: 'next-auth', message },
		{ name: 'react', message },
		{ name: 'react-dom', message },
		{ name: 'discord.js', message },
		{ name: '@watts/api', message },
		{ name: '@watts/auth', message },
		{ name: '@watts/storage', message },
	],
	patterns: [
		{
			group: ['next/*', 'next-auth/*', '@trpc/*', 'react/*', 'react-dom/*', 'discord.js/*'],
			message,
		},
	],
};

/** @type {import('eslint').Linter.Config[]} */
export const neutral = [
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
		languageOptions: { parser: tseslint.parser },
		rules: { 'no-restricted-imports': ['error', banned] },
	},
];

export default neutral;
