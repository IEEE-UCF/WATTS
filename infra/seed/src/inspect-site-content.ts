// Read-only pre-flight for the site-content import. Run it against the target database
// (production) BEFORE the import to see what already exists and what the import will do.
//
//   pnpm --filter @watts/seed inspect:site-content -- --as=you@example.com
//
// Safe by construction: everything runs inside a READ ONLY transaction, so the database
// rejects any write. Works before or after migration 0012 (it checks for the new tables
// and columns first). Prints no emails or secrets — only the public names already on the
// site (officers, chairs, sponsors) and counts.

import { loadRootEnv } from '@watts/config/load-env';
import postgres from 'postgres';
import { readLegacyOfficers, readLegacySponsors } from './legacy-site-content';

loadRootEnv();

const AS_EMAIL = process.argv.slice(2).find((a) => a.startsWith('--as='))?.split('=')[1] ?? null;

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const h = (title: string) => console.log(`\n• ${title}`);
const say = (line: string) => console.log(`  ${line}`);
const hostOf = (u: string | null) => {
	try {
		return u ? new URL(u).hostname : null;
	} catch {
		return null;
	}
};

async function main() {
	console.log(`Inspecting ${url.hostname}/${url.pathname.slice(1)} (read-only)`);
	const officers = await readLegacyOfficers();
	const sponsors = await readLegacySponsors();

	await sql.begin('read only', async (txn) => {
		// postgres-js types a transaction as non-callable; at runtime it is the same tagged template.
		const tx = txn as unknown as postgres.Sql;
		// 1. migration state ---------------------------------------------------
		h('migration 0012 (site-content CMS)');
		const [{ revisions }] = await tx`select to_regclass('public.content_revisions') is not null as revisions`;
		const [{ published }] = await tx`
			select exists (
				select 1 from information_schema.columns
				where table_name = 'committees' and column_name = 'published'
			) as published`;
		const migrated = Boolean(revisions && published);
		say(migrated ? 'applied' : 'NOT applied yet — approve the migrate job before running the import');

		// 2. the --as account --------------------------------------------------
		h('import author (--as)');
		if (!AS_EMAIL) {
			say('pass --as=<your login email> to check the account the import will be recorded as');
		} else {
			const [u] = await tx`
				select m.first_name, m.last_name, m.administrator, m.officer_status
				from users u left join members m on m.user_id = u.id
				where lower(u.email) = lower(${AS_EMAIL})
				limit 1`;
			if (!u) say('! no user with that email — sign in to the site once, or use a different email');
			else if (!u.first_name) say('! user found but has no member profile (history will show the author as unknown)');
			else
				say(
					`${u.first_name} ${u.last_name} — ${u.administrator ? 'admin' : u.officer_status ? 'officer' : '! not admin/officer (the import still works, but check this is the right account)'}`,
				);
		}

		// 3. committees ---------------------------------------------------------
		h('committees');
		const committees = await tx`
			select c.slug, c.title, c.active, c.about, m.first_name, m.last_name
				${migrated ? tx`, c.published` : tx``}
			from committees c left join members m on m.id = c.chair_id
			order by c.title`;
		if (committees.length === 0) say('none');
		for (const c of committees) {
			const excerpt = String(c.about).replace(/\s+/g, ' ').slice(0, 80);
			say(
				`${c.slug ?? '(no slug)'} — "${c.title}", chair ${c.first_name ? `${c.first_name} ${c.last_name}` : '(none)'}, ${c.active ? 'active' : 'inactive'}${migrated ? `, ${c.published ? 'PUBLISHED' : 'unpublished'}` : ''}`,
			);
			say(`    about: "${excerpt}${String(c.about).length > 80 ? '…' : ''}"`);
		}
		const software = committees.find((c) => c.slug === 'software');
		if (software) {
			say(
				software.published
					? '→ /committees/software is already published: the import leaves it alone'
					: `→ import will publish the sample page on the EXISTING software committee (chair shown: ${software.first_name ? `${software.first_name} ${software.last_name}` : 'none'}); its "about" is replaced, and the original is kept in History`,
			);
		} else {
			const [dawn] = await tx`
				select 1 as ok from members
				where lower(first_name) = 'dawn' and lower(last_name) = 'balaschak' limit 1`;
			say(
				dawn
					? '→ no "software" committee: the import creates it with Dawn Balaschak as chair'
					: '! no "software" committee and no member "Dawn Balaschak": the sample page will be skipped',
			);
		}

		// 4. sponsors -------------------------------------------------------------
		h('sponsorships table');
		const rows = await tx`
			select company_name, tier, active, company_logo_url
				${migrated ? tx`, logo_asset_id` : tx``}
			from sponsorships order by company_name`;
		if (rows.length === 0) say('empty');
		for (const r of rows) {
			const inCode = sponsors.find((s) => s.name.toLowerCase() === String(r.company_name).toLowerCase());
			const fate = r.logo_asset_id
				? 'already in the CMS — skipped'
				: inCode
					? `on the site today → import attaches its logo${inCode.tier !== r.tier || !r.active ? ` and sets tier ${inCode.tier}/active` : ''}`
					: 'NOT on the site today → stays hidden (public list only shows sponsors with a CMS logo)';
			say(`${r.company_name} (${r.tier}, ${r.active ? 'active' : 'inactive'}${r.company_logo_url ? ', has old logo URL' : ''}) — ${fate}`);
		}
		for (const s of sponsors) {
			if (!rows.some((r) => String(r.company_name).toLowerCase() === s.name.toLowerCase())) {
				say(`${s.name} (${s.tier}) — on the site, no row yet → import creates it`);
			}
		}

		// 5. officers --------------------------------------------------------------
		h(`officer roster (${officers.length} on the About page)`);
		if (migrated) {
			const [{ n }] = await tx`select count(*)::int as n from officer_profiles`;
			if (n > 0) say(`! ${n} officer profiles already exist — the import will skip the roster entirely`);
		}
		const members = await tx`select first_name, last_name from members`;
		const full = new Set(members.map((m) => `${m.first_name} ${m.last_name}`.toLowerCase().trim()));
		const lastNames = new Map<string, string[]>();
		for (const m of members) {
			const k = String(m.last_name).toLowerCase().trim();
			lastNames.set(k, [...(lastNames.get(k) ?? []), `${m.first_name} ${m.last_name}`]);
		}
		let linked = 0;
		for (const o of officers) {
			if (full.has(o.name.toLowerCase())) {
				linked++;
				say(`✓ ${o.name} — will be linked to their member account`);
			} else {
				const near = lastNames.get(o.name.split(' ').pop()!.toLowerCase()) ?? [];
				say(`· ${o.name} — no exact member match${near.length ? ` (same last name: ${near.join(', ')} — link by hand after import)` : ''}`);
			}
		}
		say(`${linked}/${officers.length} will be linked automatically`);

		// 6. storage ---------------------------------------------------------------
		h('public Blob uploads (the CMS needs public uploads to work)');
		const flyers = await tx`select flyer_url as u from events where flyer_url is not null`;
		const photos = await tx`select unnest(photo_urls) as u from projects where photo_urls is not null`;
		const hosts = new Map<string, number>();
		for (const r of [...flyers, ...photos]) {
			const host = hostOf(r.u);
			if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
		}
		if (hosts.size === 0) say('no uploaded event flyers or project photos yet — public uploads are untested in production');
		for (const [host, n] of hosts) {
			say(`${host}: ${n} file(s)${host.endsWith('.public.blob.vercel-storage.com') ? ' ← public Blob store works' : ''}`);
		}

		// 7. existing CMS content ----------------------------------------------------
		if (migrated) {
			h('existing CMS content');
			const [c] = await tx`
				select
					(select count(*)::int from media_assets) as assets,
					(select count(*)::int from site_media_slots where asset_id is not null) as slots,
					(select count(*)::int from content_revisions) as revisions,
					(select count(*)::int from content_revisions where status = 'pending') as pending,
					(select count(*)::int from page_editors) as editors`;
			say(
				`${c.assets} media files, ${c.slots} page-media slots set, ${c.revisions} revisions (${c.pending} pending), ${c.editors} page-editor assignments`,
			);
		}
	});
	console.log('\nNothing was changed.');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
