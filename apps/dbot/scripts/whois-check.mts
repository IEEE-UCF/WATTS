/**
 * Validation for the shared /whois logic (@watts/core/members `resolveWhois` +
 * `formatWhois`). Run against a freshly seeded local DB:
 *
 *   pnpm db:reset                              # wipe + migrate + seed
 *   pnpm --filter @watts/bot check:whois
 *
 * Exits non-zero if any case fails.
 */
import { loadRootEnv } from '@watts/config/load-env';

loadRootEnv();

import { createNodePgClient } from '@watts/db/node';
import {
	resolveWhois,
	formatWhois,
	pronounsForGender,
	type WhoisResult,
} from '@watts/core/members';

const { db, end } = createNodePgClient({ url: process.env.DATABASE_URL! });

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
	console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${detail && !ok ? `\n         ${detail}` : ''}`);
	if (!ok) failures++;
}

function has(s: string, ...needles: string[]) {
	return needles.every((n) => s.includes(n));
}

// ---------------------------------------------------------------------------

const john = await resolveWhois(db, { name: 'john doe' });
if (john.status === 'no-match') {
	console.error('\nSeed data missing — run `pnpm db:reset` first.\n');
	await end();
	process.exit(1);
}

console.log('\n/whois validation\n');

// 1. name lookup, officer, has attended an event
{
	const r = john;
	const text = formatWhois(r);
	console.log(`  john doe → ${text}`);
	check(
		'john doe: found, officer, last event',
		r.status === 'found' &&
			has(
				text,
				'John Doe',
				'Computer Science (BS)',
				'2025',
				'He is also an officer, serving as **Executive Chair**',
				'last seen at **IEEE GBM 1**',
			),
		text,
	);
	check(
		'john doe: no "online" links sentence (none set)',
		!text.includes('Find him online'),
		text,
	);
}

// 2. she/her + startTime tiebreak on "last seen"
{
	const r = await resolveWhois(db, { name: 'jane smith' });
	const text = formatWhois(r);
	console.log(`  jane smith → ${text}`);
	check(
		'jane smith: she/her, last event is the later one',
		r.status === 'found' &&
			has(
				text,
				'She is also an officer, serving as **Workshop Chair**',
				'last seen at **Workshop: Intro to PCB Design**',
			),
		text,
	);
}

// 3. they/them (gender NB), not an officer
{
	const r = await resolveWhois(db, { name: 'peter jones' });
	const text = formatWhois(r);
	console.log(`  peter jones → ${text}`);
	check(
		'peter jones: they/them, general member',
		r.status === 'found' &&
			has(text, 'They are a general member', 'last seen at **IEEE GBM 1**') &&
			!text.includes('officer'),
		text,
	);
}

// 4. by Discord id resolves to the same person as the name lookup
{
	const byId = await resolveWhois(db, { discordId: 'peterjones' });
	const byName = await resolveWhois(db, { name: 'peter jones' });
	check(
		'discordId "peterjones" === name "peter jones"',
		byId.status === 'found' &&
			byName.status === 'found' &&
			byId.profile.member.id === byName.profile.member.id,
	);
}

// 5. unknown Discord id → not registered
{
	const r = await resolveWhois(db, { discordId: 'nobody-xxx', label: '@ghost' });
	const text = formatWhois(r);
	console.log(`  @ghost → ${text}`);
	check(
		'unknown discord id → not-registered',
		r.status === 'not-registered' &&
			text === '**@ghost** isn\'t registered on the IEEE website.',
		text,
	);
}

// 6. ambiguous name
{
	const r = await resolveWhois(db, { name: 'j' });
	check(
		'name "j" → ambiguous (>= 2 matches)',
		r.status === 'ambiguous' && r.names.length >= 2,
		r.status === 'ambiguous' ? r.names.join(', ') : r.status,
	);
}

// 7. found with no attendance → no "last seen" sentence  (Dev Admin has none)
{
	const r = await resolveWhois(db, { name: 'dev admin' });
	const text = formatWhois(r);
	check(
		'dev admin: found, no "last seen" sentence',
		r.status === 'found' && !text.includes('last seen'),
		text,
	);
}

// 8. pure formatter: links sentence appears when a URL exists
{
	const base = john as Extract<WhoisResult, { status: 'found' }>;
	const withLink: WhoisResult = {
		status: 'found',
		profile: {
			...base.profile,
			member: {
				...base.profile.member,
				linkedinURL: 'https://linkedin.com/in/example',
				githubURL: 'https://github.com/example',
			},
		},
	};
	const text = formatWhois(withLink);
	check(
		'formatWhois: renders LinkedIn + GitHub when set',
		has(text, 'Find him online:', '[LinkedIn](https://linkedin.com/in/example)', '[GitHub](https://github.com/example)'),
		text,
	);
}

// 9. pronoun table
{
	check(
		'pronounsForGender: M/F/NB/PNTS',
		pronounsForGender('M').subject === 'he' &&
			pronounsForGender('F').subject === 'she' &&
			pronounsForGender('NB').subject === 'they' &&
			pronounsForGender('PNTS').subject === 'they',
	);
}

// ---------------------------------------------------------------------------

await end();
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
