// One-off: give every event without a slug one made from its title and date, so it
// gets a public page at /events/[slug]. New events get one automatically
// (createEvent in packages/core/src/events.ts); this covers the older rows.
//
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/backfill-event-slugs.mjs          (dry run)
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/backfill-event-slugs.mjs --apply  (writes)
//
// DATABASE_URL must be passed explicitly (no .env loading) so it's always clear
// which database this touches. Hidden and archived events get slugs too, but their
// pages stay 404 until they're visible again.

import { createRequire } from 'node:module';

const appRequire = createRequire(new URL('../../apps/ieeeucfcom/package.json', import.meta.url));
const pg = appRequire('pg');

const apply = process.argv.includes('--apply');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
	console.error('Set DATABASE_URL for the database to backfill.');
	process.exit(1);
}

// Same rules as slugify + eventSlugBase in packages/core/src (slugs.ts, events.ts).
function slugify(text, maxLength, fallback) {
	const full = text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (full.length <= maxLength) return full || fallback;
	const cut = full.slice(0, maxLength + 1);
	const lastDash = cut.lastIndexOf('-');
	const trimmed = (lastDash > 0 ? cut.slice(0, lastDash) : full.slice(0, maxLength)).replace(
		/-+$/,
		'',
	);
	return trimmed || fallback;
}

function eventSlugBase(title, startTime, timeZone) {
	const date = new Intl.DateTimeFormat('en-CA', {
		timeZone: timeZone || 'America/New_York',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date(startTime));
	return `${slugify(title, 45, 'event')}-${date}`;
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
try {
	const { rows: dbName } = await db.query('select current_database() as name');
	console.log(`Database: ${dbName[0].name}${apply ? '' : ' (dry run; pass --apply to write)'}`);

	const { rows } = await db.query(
		'select id, title, slug, start_time, time_zone from events order by start_time, id',
	);
	const taken = new Set(rows.map((r) => r.slug).filter(Boolean));
	const plan = [];
	for (const r of rows.filter((r) => !r.slug)) {
		const base = eventSlugBase(r.title, r.start_time, r.time_zone);
		let slug = base;
		for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
		taken.add(slug);
		plan.push({ id: r.id, title: r.title, slug });
	}

	if (plan.length === 0) {
		console.log('Every event already has a slug.');
	} else {
		for (const p of plan) console.log(`  ${p.title}  →  /events/${p.slug}`);
		if (apply) {
			await db.query('begin');
			for (const p of plan) {
				await db.query(
					'update events set slug = $1, updated_at = now() where id = $2 and slug is null',
					[p.slug, p.id],
				);
			}
			await db.query('commit');
			console.log(`Set ${plan.length} slug(s).`);
		}
	}
} catch (err) {
	await db.query('rollback').catch(() => {});
	throw err;
} finally {
	await db.end();
}
