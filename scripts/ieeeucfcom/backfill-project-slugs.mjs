// One-off: give every project without a slug one made from its title, so each can
// have a public page at /projects/[slug]. New projects get one automatically
// (createProject in packages/core/src/projects.ts); this covers the older rows.
//
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/backfill-project-slugs.mjs          (dry run)
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/backfill-project-slugs.mjs --apply  (writes)
//
// DATABASE_URL must be passed explicitly (no .env loading) so it's always clear
// which database this touches. Pages stay unpublished: publishing is still a choice
// made in the page editor.

import { createRequire } from 'node:module';

const appRequire = createRequire(new URL('../../apps/ieeeucfcom/package.json', import.meta.url));
const pg = appRequire('pg');

const apply = process.argv.includes('--apply');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
	console.error('Set DATABASE_URL for the database to backfill.');
	process.exit(1);
}

// Same rules as slugify in packages/core/src/slugs.ts (used by slugifyTitle).
function slugifyTitle(title) {
	const full = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (full.length <= 56) return full || 'project';
	const cut = full.slice(0, 57);
	const lastDash = cut.lastIndexOf('-');
	const trimmed = (lastDash > 0 ? cut.slice(0, lastDash) : full.slice(0, 56)).replace(/-+$/, '');
	return trimmed || 'project';
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
try {
	const { rows: dbName } = await db.query('select current_database() as name');
	console.log(`Database: ${dbName[0].name}${apply ? '' : ' (dry run; pass --apply to write)'}`);

	const { rows } = await db.query('select id, title, slug from projects order by created_at, id');
	const taken = new Set(rows.map((r) => r.slug).filter(Boolean));
	const plan = [];
	for (const r of rows.filter((r) => !r.slug)) {
		const base = slugifyTitle(r.title);
		let slug = base;
		for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
		taken.add(slug);
		plan.push({ id: r.id, title: r.title, slug });
	}

	if (plan.length === 0) {
		console.log('Every project already has a slug.');
	} else {
		for (const p of plan) console.log(`  ${p.title}  →  /projects/${p.slug}`);
		if (apply) {
			await db.query('begin');
			for (const p of plan) {
				await db.query(
					'update projects set slug = $1, updated_at = now() where id = $2 and slug is null',
					[p.slug, p.id],
				);
			}
			await db.query('commit');
			console.log(`Set ${plan.length} slug(s).`);
			// Written to the database directly, so the site's cached pages don't know yet.
			console.log(
				'Next: click "Refresh public pages" in Admin → Site content so the site shows this now.',
			);
		}
	}
} catch (err) {
	await db.query('rollback').catch(() => {});
	throw err;
} finally {
	await db.end();
}
