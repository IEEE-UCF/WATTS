// Point the local app at the production mirror, or back at your dev database.
//
//   pnpm mirror:use                  # use database "watts_mirror"
//   pnpm mirror:use -- --db=<name>   # use another restored mirror
//   pnpm mirror:use -- --dev         # back to the dev database from ./.env
//   pnpm mirror:use -- --status      # show which one is active
//
// It only edits a clearly marked block at the end of ./.env.local (which overrides ./.env
// for the website, scripts and drizzle-kit). Restart the dev server after switching.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { args, isLocalUrl, readEnvFile, withDatabase } from './common';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENV_LOCAL = join(ROOT, '.env.local');
const START = '# >>> watts mirror (managed by `pnpm mirror:use`) >>>';
const END = '# <<< watts mirror <<<';

async function main() {
	const a = args();
	const local = readEnvFile(join(ROOT, '.env'));
	if (!local.DATABASE_URL || !isLocalUrl(local.DATABASE_URL)) throw new Error('DATABASE_URL in ./.env is not local.');
	const current = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8') : '';
	const start = current.indexOf(START);
	const end = current.indexOf(END);
	const without = start === -1 ? current : `${current.slice(0, start)}${current.slice(end + END.length)}`.replace(/\n{3,}/g, '\n\n');
	const active = start === -1 ? null : /DATABASE_URL=\S*\/([a-z0-9_]+)/.exec(current.slice(start, end))?.[1];
	const devDb = new URL(local.DATABASE_URL).pathname.slice(1);

	if (a.flag('status')) {
		console.log(active ? `Using the mirror database "${active}".` : `Using your dev database "${devDb}".`);
		return;
	}
	if (a.flag('dev')) {
		// Leave no empty .env.local behind if the mirror block was all it held.
		if (without.trim()) writeFileSync(ENV_LOCAL, `${without.trimEnd()}\n`);
		else if (existsSync(ENV_LOCAL)) unlinkSync(ENV_LOCAL);
		console.log(`Switched to your dev database "${devDb}". Restart the dev server.`);
		return;
	}
	const db = a.str('db', 'watts_mirror')!;
	const url = withDatabase(local.DATABASE_URL, db);
	const probe = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
	try {
		const [{ n }] = await probe`select count(*)::int as n from members`;
		console.log(`Mirror "${db}" found (${n} members).`);
	} catch {
		throw new Error(`Database "${db}" isn't ready — run \`pnpm mirror:restore\` first.`);
	} finally {
		await probe.end();
	}
	const block = `${START}\n# Switch back with: pnpm mirror:use -- --dev\nDATABASE_URL=${url}\n${END}\n`;
	writeFileSync(ENV_LOCAL, `${without.trimEnd() ? `${without.trimEnd()}\n\n` : ''}${block}`);
	console.log(`Switched to the mirror "${db}". Restart the dev server.`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
