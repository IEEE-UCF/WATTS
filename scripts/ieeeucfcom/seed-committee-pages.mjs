// Creates a committee (and its public page at /committees/[slug]) for each IEEE @ UCF
// committee that doesn't exist yet. Safe to re-run: existing slugs are left alone.
//
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/seed-committee-pages.mjs          (dry run)
//   DATABASE_URL=postgres://… node scripts/ieeeucfcom/seed-committee-pages.mjs --apply  (writes)
//
// Prefill:
// - Chair: the active member whose officer role matches (e.g. "Social Chair"). If
//   nobody holds the role the committee is skipped, because a committee needs a chair.
// - About + tagline: the committee's write-up from the About page, where there is one.
//   Those pages are published. The rest get a one-line placeholder and stay
//   unpublished until the chair writes an about section in the page editor.
// - Photos: nothing to do here. Committee pages with no photos of their own show the
//   committee's About-page photos (see COMMITTEE_ABOUT_SLOTS in packages/core).

import { createRequire } from 'node:module';

const appRequire = createRequire(new URL('../../apps/ieeeucfcom/package.json', import.meta.url));
const pg = appRequire('pg');

const apply = process.argv.includes('--apply');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
	console.error('Set DATABASE_URL for the database to seed.');
	process.exit(1);
}

// Text in `about`/`tagline` is the copy from the About page (components/pg/aboutieee.tsx).
const COMMITTEES = [
	{
		slug: 'professional-development',
		title: 'Professional Development',
		role: 'Professional Development Chair',
		tagline: "Supporting members' career advancement is critical for IEEE @ UCF.",
		about: 'The Professional Development Committee is committed to equipping members with essential career-building strategies to enhance their marketability. Members have access to workshops on resumes, LinkedIn profiles, career fairs, and elevator pitch composition and additionally can participate in mentorship programs.\n\nThrough partnerships with leading companies, IEEE @ UCF offers exclusive tours, information sessions, and frequent job opportunities, connecting members directly with potential employers.',
	},
	{
		slug: 'service',
		title: 'Service',
		role: 'Service Chair',
		tagline: 'Community involvement is a core value for IEEE @ UCF.',
		about: 'Our Service Committee enriches the entirety of Orlando, Florida by hosting events that share our passion for engineering and inspire others to explore its possibilities. We expose local elementary, middle, and high school students to electrical and computer engineering through volunteering at UCF’s annual STEM Day, FIRST Robotics events, summer camps, and more.\n\nAdditionally, we support local non-profits, like food pantries, through donations and volunteer work.',
	},
	{
		slug: 'social',
		title: 'Social',
		role: 'Social Chair',
		tagline: 'A highlight of IEEE @ UCF is the fun, connection-building social events.',
		about: 'In-person and virtual events are hosted weekly by the Social Committee and allow for the club to build a community around itself. Throughout this past year, members have enjoyed grabbing bubble tea, ice skating, playing games at arcades, partaking in board games, rollerskating, playing golf, participating in board game competitions, and more.\n\nMany members can corroborate that they have developed incredible everlasting relationships through IEEE @ UCF.',
	},
	{
		slug: 'workshop',
		title: 'Workshop',
		role: 'Workshop Chair',
		tagline:
			'Workshops are premier opportunities for IEEE @ UCF members to advance their technical knowledge and experience.',
		about: 'The Workshop Committee offers specialized, expert-led sessions on topics such as circuit analysis, Verilog, soldering, wiring, microcontroller programming, and beyond.\n\nThese workshops provide members with valuable technical skills often not introduced until later stages of their academic careers, giving them a significant early advantage.',
	},
	{ slug: 'projects', title: 'Projects', role: 'Project Chair' },
	{ slug: 'outreach', title: 'Outreach', role: 'Outreach Chair' },
	{ slug: 'marketing', title: 'Marketing', role: 'Marketing Chair' },
	{ slug: 'finance', title: 'Finance', role: 'Treasurer' },
];

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
try {
	const { rows: dbName } = await db.query('select current_database() as name');
	console.log(`Database: ${dbName[0].name}${apply ? '' : ' (dry run; pass --apply to write)'}\n`);

	const { rows: existing } = await db.query('select slug, title from committees');
	const taken = new Map(existing.map((r) => [r.slug, r.title]));

	const plan = [];
	for (const c of COMMITTEES) {
		if (taken.has(c.slug)) {
			console.log(`  skip  ${c.title}: /committees/${c.slug} already exists`);
			continue;
		}
		const { rows: chairs } = await db.query(
			`select id, first_name, last_name from members
			 where active and officer_role = $1 order by updated_at desc`,
			[c.role],
		);
		if (chairs.length === 0) {
			console.log(`  skip  ${c.title}: nobody holds "${c.role}" (a committee needs a chair)`);
			continue;
		}
		const chair = chairs[0];
		const published = Boolean(c.about);
		plan.push({ ...c, chair, published });
		console.log(
			`  add   ${c.title} → /committees/${c.slug}, chair ${chair.first_name} ${chair.last_name}` +
				(chairs.length > 1
					? ` (${chairs.length} members hold "${c.role}"; newest picked)`
					: '') +
				(published ? ', published' : ', unpublished until it has an about section'),
		);
	}

	if (apply && plan.length > 0) {
		await db.query('begin');
		for (const c of plan) {
			const about =
				c.about ??
				`The ${c.title} Committee is part of IEEE @ UCF. More about what it does is coming soon.`;
			const {
				rows: [row],
			} = await db.query(
				`insert into committees (title, slug, about, tagline, chair_id, published)
				 values ($1, $2, $3, $4, $5, $6) returning id`,
				[c.title, c.slug, about, c.tagline ?? null, c.chair.id, c.published],
			);
			// Same as createCommittee in packages/core: the chair is also a member, flagged.
			await db.query(
				`insert into committee_members (committee_id, member_id, is_chair)
				 values ($1, $2, true) on conflict do nothing`,
				[row.id, c.chair.id],
			);
		}
		await db.query('commit');
		console.log(`\nCreated ${plan.length} committee(s).`);
		// Written to the database directly, so the cached /committees page doesn't know yet.
		console.log(
			'Next: click "Refresh public pages" in Admin → Site content so /committees lists them now\n' +
				'(otherwise it catches up within the hour).',
		);
	} else if (plan.length === 0) {
		console.log('\nNothing to add.');
	}
} catch (err) {
	await db.query('rollback').catch(() => {});
	throw err;
} finally {
	await db.end();
}
