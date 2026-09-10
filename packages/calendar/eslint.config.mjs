import { neutral } from '@watts/eslint-config/neutral';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{ ignores: ['**/node_modules/**', '**/dist/**'] },
	...neutral,
];
