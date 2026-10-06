// One-off, after migration 0015: give every event the slug its URL should have now,
// /events/[number]/[slug from title], and keep the slug it had before as a redirect
// (page_redirects) so links already shared, like /events/gbm-3-2026-10-02, keep working.
// Safe to re-run: events whose slug already matches their title are left alone.
//
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/backfill-event-slugs.mjs          (dry run)
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/backfill-event-slugs.mjs --apply  (writes)
//
// DATABASE_URL must be passed explicitly (no .env loading) so it's always clear
// which database this touches.

import { createRequire } from 'node:module';

const appRequire = createRequire(new URL('../../apps/ieeeucfcom/package.json', import.meta.url));
const pg = appRequire('pg');

const apply = process.argv.includes('--apply');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
	console.error('Set DATABASE_URL for the database to backfill.');
	process.exit(1);
}

// Same rules as slugify (packages/core/src/slugs.ts) + eventSlug (events.ts).
function eventSlug(title) {
	const full = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (full.length <= 56) return full || 'event';
	const cut = full.slice(0, 57);
	const lastDash = cut.lastIndexOf('-');
	const trimmed = (lastDash > 0 ? cut.slice(0, lastDash) : full.slice(0, 56)).replace(/-+$/, '');
	return trimmed || 'event';
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
try {
	const { rows: dbName } = await db.query('select current_database() as name');
	console.log(`Database: ${dbName[0].name}${apply ? '' : ' (dry run; pass --apply to write)'}`);

	const { rows: hasNumber } = await db.query(
		`select 1 from information_schema.columns where table_name = 'events' and column_name = 'number'`,
	);
	if (hasNumber.length === 0) {
		console.error('events.number is missing: run migration 0015 first.');
		process.exit(1);
	}

	const { rows } = await db.query('select id, number, title, slug from events order by number');
	const plan = rows
		.map((r) => ({ ...r, next: eventSlug(r.title) }))
		.filter((r) => r.slug !== r.next);

	if (plan.length === 0) {
		console.log('Every event slug already matches its title.');
	} else {
		for (const p of plan) {
			console.log(`  /events/${p.slug ?? '(none)'}  →  /events/${p.number}/${p.next}`);
		}
		if (apply) {
			await db.query('begin');
			for (const p of plan) {
				if (p.slug) {
					await db.query(
						`insert into page_redirects (type, old_slug, target_id) values ('event', $1, $2)
						 on conflict (type, old_slug) do update set target_id = excluded.target_id`,
						[p.slug, p.id],
					);
				}
				await db.query('update events set slug = $1, updated_at = now() where id = $2', [
					p.next,
					p.id,
				]);
			}
			await db.query('commit');
			console.log(`Updated ${plan.length} event(s); old addresses saved as redirects.`);
		}
	}
	console.log(`${rows.length} events in total.`);
} catch (err) {
	await db.query('rollback').catch(() => {});
	throw err;
} finally {
	await db.end();
}
