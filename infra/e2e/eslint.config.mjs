import { neutral } from '@watts/eslint-config/neutral';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{ ignores: ['**/node_modules/**', 'playwright-report/**', 'test-results/**', 'screenshots/**'] },
	...neutral,
];
