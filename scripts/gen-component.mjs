#!/usr/bin/env node
/**
 * Scaffold a new component and automate the CONTRIBUTING.md "definition of
 * done": a gallery entry in apps/ieeeucfcom/src/dev/registry/meta.ts +
 * renders.tsx, kept in sync automatically instead of by hand.
 *
 * Usage:
 *   pnpm gen:component <kebab-name> --shared
 *   pnpm gen:component <kebab-name> --app --group <group>
 *
 * --shared  packages/ui/src/<name>.tsx, a @watts/ui primitive (semantic tokens,
 *           cva + data-slot, matching button.tsx). Registers it in
 *           packages/ui/package.json's `exports`.
 * --app     apps/ieeeucfcom/src/components/<group>/<name>.tsx, a brand-specific
 *           app component (ieee-* tokens). --group must be one of the
 *           GalleryGroup values from src/dev/registry/types.ts.
 *
 * See apps/ieeeucfcom/docs/styling/ADDING-COMPONENTS.md for when to pick which.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_GROUPS = ['ui', 'layout', 'marketing', 'dashboard', 'admin', 'qr', 'staff', 'misc'];

function usageError(message) {
	console.error(`${message}\n`);
	console.error('Usage:');
	console.error('  pnpm gen:component <kebab-name> --shared');
	console.error('  pnpm gen:component <kebab-name> --app --group <group>');
	console.error(`  <group> one of: ${APP_GROUPS.join(', ')}`);
	process.exit(1);
}

function parseArgs(argv) {
	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--group') {
			i++; // skip this flag's value too
			continue;
		}
		if (!arg.startsWith('--')) positional.push(arg);
	}
	if (positional.length !== 1) usageError('Expected exactly one component name.');
	const name = positional[0];
	if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
		usageError(`"${name}" isn't kebab-case — use e.g. "sponsor-tile", not "SponsorTile".`);
	}

	const mode = argv.includes('--shared') ? 'shared' : argv.includes('--app') ? 'app' : null;
	if (!mode) usageError('Pass --shared or --app.');
	if (argv.includes('--shared') && argv.includes('--app')) usageError('Pass only one of --shared / --app.');

	let group = null;
	if (mode === 'app') {
		const idx = argv.indexOf('--group');
		if (idx === -1 || !argv[idx + 1]) usageError('--app requires --group <group>.');
		group = argv[idx + 1];
		if (!APP_GROUPS.includes(group)) {
			usageError(`Unknown group "${group}". One of: ${APP_GROUPS.join(', ')}`);
		}
	}

	return { name, mode, group };
}

const toPascalCase = (kebab) =>
	kebab
		.split('-')
		.map((s) => s[0].toUpperCase() + s.slice(1))
		.join('');

const toCamelCase = (pascal) => pascal[0].toLowerCase() + pascal.slice(1);

function writeNewFile(path, content) {
	if (existsSync(path)) {
		console.error(`Refusing to overwrite existing file: ${path}`);
		process.exit(1);
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	console.log(`created ${path.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
}

// ---------------------------------------------------------------------------
// --shared: packages/ui/src/<name>.tsx
// ---------------------------------------------------------------------------
function scaffoldShared(name) {
	const pascal = toPascalCase(name);
	const camel = toCamelCase(pascal);
	const filePath = join(ROOT, 'packages', 'ui', 'src', `${name}.tsx`);

	const content = `import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './cn';

// TODO: real variants. This is a starting point, not a finished primitive —
// see apps/ieeeucfcom/docs/styling/ADDING-COMPONENTS.md before publishing it.
const ${camel}Variants = cva('', {
	variants: {
		variant: {
			default: '',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

interface ${pascal}Props
	extends React.ComponentProps<'div'>,
		VariantProps<typeof ${camel}Variants> {}

function ${pascal}({ className, variant, ...props }: ${pascal}Props) {
	return (
		<div
			data-slot="${name}"
			className={cn(${camel}Variants({ variant, className }))}
			{...props}
		/>
	);
}

export { ${pascal}, ${camel}Variants };
`;
	writeNewFile(filePath, content);

	// packages/ui/package.json exports — pure JSON, so parse/edit/stringify.
	const pkgPath = join(ROOT, 'packages', 'ui', 'package.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
	const exportKey = `./${name}`;
	if (pkg.exports[exportKey]) {
		console.error(`packages/ui/package.json already exports "${exportKey}" — aborting.`);
		process.exit(1);
	}
	pkg.exports[exportKey] = `./src/${name}.tsx`;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
	console.log(`updated packages/ui/package.json (added "${exportKey}")`);

	return {
		slug: `ui/${name}`,
		pascal,
		source: `@watts/ui/${name}`,
		importSpecifier: `@watts/ui/${name}`,
		group: 'ui',
		controlsLiteral: `[{ name: 'variant', type: 'select', options: ['default'], default: 'default' }]`,
		renderPropsLiteral: `variant={(p.variant as never) ?? 'default'} className={p.className as string}`,
	};
}

// ---------------------------------------------------------------------------
// --app: apps/ieeeucfcom/src/components/<group>/<name>.tsx
// ---------------------------------------------------------------------------
function scaffoldApp(name, group) {
	const pascal = toPascalCase(name);
	const filePath = join(ROOT, 'apps', 'ieeeucfcom', 'src', 'components', group, `${name}.tsx`);

	const content = `'use client';

import { cn } from '@watts/ui/cn';

// TODO: build this out — see apps/ieeeucfcom/docs/styling/ADDING-COMPONENTS.md
// for the brand-token conventions app components should follow.
interface ${pascal}Props {
	className?: string;
}

export function ${pascal}({ className }: ${pascal}Props) {
	return <div className={cn('text-white', className)}>${pascal}</div>;
}
`;
	writeNewFile(filePath, content);

	const importSpecifier = `@/components/${group}/${name}`;
	return {
		slug: `${group}/${name}`,
		pascal,
		source: importSpecifier,
		importSpecifier,
		group,
		controlsLiteral: `[]`,
		renderPropsLiteral: `className={p.className as string}`,
	};
}

// ---------------------------------------------------------------------------
// Gallery registration — insert into meta.ts + renders.tsx by anchor.
// ---------------------------------------------------------------------------
function registerInGallery({ slug, pascal, source, importSpecifier, group, controlsLiteral, renderPropsLiteral }) {
	const metaPath = join(ROOT, 'apps', 'ieeeucfcom', 'src', 'dev', 'registry', 'meta.ts');
	let meta = readFileSync(metaPath, 'utf8');
	const metaEntry =
		`\t{\n` +
		`\t\tslug: '${slug}',\n` +
		`\t\tname: '${pascal}',\n` +
		`\t\tgroup: '${group}',\n` +
		`\t\tstatus: 'ok',\n` +
		`\t\tsource: '${source}',\n` +
		`\t\t// TODO: fill in real controls once the component's props are built out.\n` +
		`\t\tcontrols: ${controlsLiteral},\n` +
		`\t},\n`;
	const closeArrayMarker = '\n];';
	const closeIdx = meta.indexOf(closeArrayMarker);
	if (closeIdx === -1) {
		console.error('Could not find `entriesMeta` array close (`];`) in meta.ts — insert manually.');
		process.exit(1);
	}
	meta = meta.slice(0, closeIdx) + '\n' + metaEntry.trimEnd() + meta.slice(closeIdx);
	writeFileSync(metaPath, meta);
	console.log('updated apps/ieeeucfcom/src/dev/registry/meta.ts');

	const rendersPath = join(ROOT, 'apps', 'ieeeucfcom', 'src', 'dev', 'registry', 'renders.tsx');
	let renders = readFileSync(rendersPath, 'utf8');

	const importLine = `import { ${pascal} } from '${importSpecifier}';\n`;
	const typeRenderMarker = 'type Render = ComponentType';
	const typeIdx = renders.indexOf(typeRenderMarker);
	if (typeIdx === -1) {
		console.error('Could not find `type Render = ComponentType` marker in renders.tsx — insert manually.');
		process.exit(1);
	}
	renders = renders.slice(0, typeIdx) + importLine + '\n' + renders.slice(typeIdx);

	const rendersEntry = `\t'${slug}': (p) => <${pascal} ${renderPropsLiteral} />,\n`;
	const closeMapMarker = '\n};';
	const closeMapIdx = renders.lastIndexOf(closeMapMarker);
	if (closeMapIdx === -1) {
		console.error('Could not find `renders` map close (`};`) in renders.tsx — insert manually.');
		process.exit(1);
	}
	renders = renders.slice(0, closeMapIdx) + '\n' + rendersEntry.trimEnd() + renders.slice(closeMapIdx);
	writeFileSync(rendersPath, renders);
	console.log('updated apps/ieeeucfcom/src/dev/registry/renders.tsx');
}

// ---------------------------------------------------------------------------
function main() {
	const { name, mode, group } = parseArgs(process.argv.slice(2));
	const entry = mode === 'shared' ? scaffoldShared(name) : scaffoldApp(name, group);
	registerInGallery(entry);

	console.log('\nNext steps:');
	console.log('  1. Fill in real variants/controls (the TODOs in the new file + meta.ts).');
	console.log('  2. pnpm format && pnpm --filter @watts/web typecheck');
	console.log(`  3. pnpm dev, then check /dev/${entry.slug}`);
}

main();
