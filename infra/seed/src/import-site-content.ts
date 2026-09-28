// One-off import: move today's hardcoded site content into the site-content CMS.
//
//   pnpm --filter @watts/seed import:site-content                  # dry run (default)
//   pnpm --filter @watts/seed import:site-content -- --apply       # write
//   pnpm --filter @watts/seed import:site-content -- --apply --as=you@example.com
//
// What it does (idempotent — safe to re-run; existing CMS content is never overwritten):
//   1. every page media slot (@watts/core/site-media-slots) with no uploaded asset →
//      uploads its current public/ file and points the slot at it
//   2. the officer roster in components/pg/aboutofficers.tsx → officer_profiles
//      (+ portraits), linked to members by exact name; unmatched names are printed.
//      Skipped entirely if any officer profile already exists.
//   3. the sponsor list in components/pg/sponsorshipsclient.tsx → sponsorships (+ logos),
//      skipping companies that already have a CMS logo
//   4. the sample Software committee page (/committees/software): chair = member
//      "Dawn Balaschak"; skipped (and printed) if that member or committee can't be found
//
// Existing rows: a sponsor row with the same company name gets the logo attached (no
// duplicate); an existing software committee gets the sample page (its old `about` is kept
// as an "Original content" revision). Run inspect-site-content.ts first to see all of this.
//
// Every write is a published revision authored by --as (default DEV_ADMIN_EMAIL), so it
// shows up in History and can be restored. public/ files are NOT deleted.
//
// Targets whatever ./.env points at: DATABASE_URL and STORAGE_PROVIDER (+ BLOB_* or S3_*).
// For production, run with the production env loaded and review the dry run first.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { loadRootEnv } from '@watts/config/load-env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, ilike } from 'drizzle-orm';
import * as schema from '@watts/db/schema';
import { APP, PUBLIC, readLegacyOfficers, readLegacySponsors } from './legacy-site-content';

loadRootEnv();

const { Committees, MediaAssets, Members, OfficerProfiles, SiteMediaSlots, Sponsorships, Users } = schema;


const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const AS_EMAIL = argv.find((a) => a.startsWith('--as='))?.split('=')[1] ?? process.env.DEV_ADMIN_EMAIL ?? 'admin@watts.local';

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set (see .env.example).');
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

// sharp ships with Next (image optimization) — resolve it through the website app.
const appRequire = createRequire(join(APP, 'package.json'));
const sharp = createRequire(appRequire.resolve('next/package.json'))('sharp') as (input: Buffer) => {
	metadata(): Promise<{ width?: number; height?: number; pageHeight?: number; pages?: number; format?: string }>;
};

const log = (msg: string) => console.log(`${APPLY ? '' : '[dry run] '}${msg}`);

// ---------------------------------------------------------------------------
// Uploading a public/ file as a media asset
// ---------------------------------------------------------------------------

function sniffType(buf: Buffer, path: string): string {
	if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
	if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return 'image/png';
	if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
	throw new Error(`Unsupported file type: ${path} (${extname(path)})`);
}

function keyFor(id: string, contentType: string) {
	const ext = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/webp': 'webp' }[contentType] ?? 'jpg';
	return `site-media/${id}.${ext}`;
}

type Storage = Awaited<ReturnType<typeof import('@watts/storage').getStorage>>;
let storage: Storage | null = null;

async function uploadPublicFile(
	publicPath: string,
	kind: 'image' | 'animated' | 'document',
	userId: string,
	alt: string | null,
): Promise<string> {
	const path = join(PUBLIC, publicPath);
	const body = await readFile(path);
	const contentType = sniffType(body, path);
	let width: number | null = null;
	let height: number | null = null;
	if (kind !== 'document') {
		const meta = await sharp(body).metadata();
		width = meta.width ?? null;
		height = meta.pageHeight ?? meta.height ?? null;
	}
	const id = randomUUID();
	const key = keyFor(id, contentType);
	if (!APPLY) {
		log(`  would upload ${publicPath} (${contentType}, ${(body.length / 1024).toFixed(0)} KB) → ${key}`);
		return id;
	}
	if (!storage) {
		const mod = await import('@watts/storage');
		storage = await mod.getStorage();
	}
	const { url } = await storage.put({ key, bucket: 'public', body, contentType });
	await db.insert(MediaAssets).values({
		id,
		kind,
		storageKey: key,
		url,
		contentType,
		sizeBytes: body.length,
		width,
		height,
		checksumSha256: createHash('sha256').update(body).digest('hex'),
		alt,
		sourceFilename: publicPath,
		uploadedByUserId: userId,
		scopeType: 'global',
	});
	log(`  uploaded ${publicPath} → ${url}`);
	return id;
}

// ---------------------------------------------------------------------------

async function main() {
	const { SITE_MEDIA_SLOTS } = await import('@watts/core/site-media-slots');
	const core = await import('@watts/core/site-content');

	const [user] = await db.select().from(Users).where(eq(Users.email, AS_EMAIL)).limit(1);
	if (!user) throw new Error(`No user with email ${AS_EMAIL} (pass --as=<email>)`);
	const [me] = await db.select().from(Members).where(eq(Members.userId, user.id)).limit(1);
	const actor = {
		userId: user.id,
		memberId: me?.id ?? null,
		administrator: true,
		officerStatus: true,
		permissions: [] as string[],
	};
	console.log(`${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} as ${AS_EMAIL}; storage=${process.env.STORAGE_PROVIDER ?? 'local'}\n`);

	// 1. slots ----------------------------------------------------------------
	console.log('• page media slots');
	const existingSlots = new Map((await db.select().from(SiteMediaSlots)).map((r) => [r.slotKey, r.assetId]));
	for (const slot of SITE_MEDIA_SLOTS) {
		if (existingSlots.get(slot.key)) {
			log(`  ${slot.key}: already set, skipped`);
			continue;
		}
		const file = slot.kind === 'animated' ? `${slot.defaultSrc}.webp` : slot.defaultSrc;
		const assetId = await uploadPublicFile(file, slot.kind, user.id, slot.label);
		if (APPLY) {
			await core.submitChange(db, { entityType: 'slot', entityId: slot.key, snapshot: { assetId }, actor, direct: true });
		}
	}

	// 2. officers ---------------------------------------------------------------
	console.log('\n• officer roster');
	const [anyOfficer] = await db.select({ id: OfficerProfiles.id }).from(OfficerProfiles).limit(1);
	if (anyOfficer) {
		log('  officer profiles already exist — skipped');
	} else {
		const officers = await readLegacyOfficers();
		const members = await db.select({ id: Members.id, first: Members.firstName, last: Members.lastName }).from(Members);
		const byName = new Map(members.map((m) => [`${m.first} ${m.last}`.toLowerCase().trim(), m.id]));
		const unmatched: string[] = [];
		for (const o of officers) {
			const memberId = byName.get(o.name.toLowerCase()) ?? null;
			if (!memberId) unmatched.push(o.name);
			log(`  ${o.name} — ${o.role}${memberId ? ' (linked to member)' : ''}`);
			const portraitAssetId = await uploadPublicFile(o.photo, 'image', user.id, o.name);
			if (APPLY) {
				await core.createOfficerProfile(
					db,
					{
						memberId,
						displayName: o.name,
						roleTitle: o.role,
						group: o.type === 'Executive' ? 'executive' : 'chair',
						major: o.major || null,
						yearLabel: o.year || null,
						bio: o.bio ?? null,
						linkedinUrl: o.linkedin || null,
						portraitAssetId,
						active: true,
					},
					actor,
				);
			}
		}
		if (unmatched.length) {
			console.log(`  ! not linked to a member (link them in /admin/site-content → Officers): ${unmatched.join(', ')}`);
		}
	}

	// 3. sponsors ---------------------------------------------------------------
	console.log('\n• sponsors');
	const sponsors = await readLegacySponsors();
	for (const [i, sp] of sponsors.entries()) {
		const matches = await db.select().from(Sponsorships).where(ilike(Sponsorships.companyName, sp.name));
		if (matches.some((m) => m.logoAssetId)) {
			log(`  ${sp.name}: already in the CMS, skipped`);
			continue;
		}
		// A row for this company from before the CMS: give it the logo instead of adding
		// a duplicate. Its description/website are kept; tier and visibility follow what the
		// site shows today. The old values are kept in History (baseline revision).
		const [existing] = matches;
		if (existing) {
			log(
				`  ${sp.name}: existing row (tier ${existing.tier}, ${existing.active ? 'active' : 'inactive'}) — will attach the logo${
					existing.tier !== sp.tier || !existing.active ? `, set tier ${sp.tier} and active` : ''
				}`,
			);
			const logoAssetId = await uploadPublicFile(sp.logo, 'image', user.id, sp.name);
			if (APPLY) {
				await core.submitChange(db, {
					entityType: 'sponsor',
					entityId: existing.id,
					snapshot: {
						companyName: existing.companyName,
						tier: sp.tier,
						description: existing.description,
						websiteUrl: existing.websiteUrl,
						logoAssetId,
						active: true,
					},
					actor,
					direct: true,
				});
				await db.update(Sponsorships).set({ sortOrder: i }).where(eq(Sponsorships.id, existing.id));
			}
			continue;
		}
		log(`  ${sp.name} (${sp.tier}) — new row`);
		const logoAssetId = await uploadPublicFile(sp.logo, 'image', user.id, sp.name);
		if (APPLY) {
			const { id } = await core.createSponsor(
				db,
				{ companyName: sp.name, tier: sp.tier, description: null, websiteUrl: null, logoAssetId, active: true },
				actor,
			);
			await db.update(Sponsorships).set({ sortOrder: i }).where(eq(Sponsorships.id, id));
		}
	}

	// 4. sample Software committee page ----------------------------------------
	console.log('\n• sample committee page: /committees/software');
	let [committee] = await db.select().from(Committees).where(eq(Committees.slug, 'software')).limit(1);
	if (!committee) {
		const [dawn] = await db
			.select({ id: Members.id })
			.from(Members)
			.where(and(ilike(Members.firstName, 'Dawn'), ilike(Members.lastName, 'Balaschak')))
			.limit(1);
		if (!dawn) {
			console.log('  ! no "software" committee and no member "Dawn Balaschak" — skipped');
		} else if (APPLY) {
			const { createCommittee } = await import('@watts/core/committees');
			({ committee } = await createCommittee(db, {
				title: 'Software Committee',
				slug: 'software',
				about: 'placeholder',
				chairId: dawn.id,
			}));
			log('  created the Software committee (chair: Dawn Balaschak)');
		} else {
			log('  would create the Software committee (chair: Dawn Balaschak)');
		}
	}
	if (committee && !committee.published) {
		const [chair] = await db
			.select({ first: Members.firstName, last: Members.lastName })
			.from(Members)
			.where(eq(Members.id, committee.chairId))
			.limit(1);
		const excerpt = committee.about.replace(/\s+/g, ' ').slice(0, 120);
		log(`  existing committee "${committee.title}", chair ${chair ? `${chair.first} ${chair.last}` : '(unknown)'}`);
		log(`  its description will be replaced (the original is kept in History): "${excerpt}${committee.about.length > 120 ? '…' : ''}"`);
	}
	if (committee?.published) {
		log('  already published — skipped');
	} else if (committee && APPLY) {
		await core.submitChange(db, {
			entityType: 'committee_page',
			entityId: committee.id,
			snapshot: {
				tagline: 'Build the software that runs IEEE @ UCF.',
				about: [
					'The Software Committee is run by Dawn Balaschak, our Software Chair.',
					'Members design, build and maintain the tools the branch runs on — this website, the Discord bot, and event and membership systems — while learning modern web development together.',
					'No experience required: bring curiosity and we will help you ship your first feature.',
				].join('\n\n'),
				applyUrl: '/connect',
				heroAssetId: null,
				galleryAssetIds: [],
				published: true,
			},
			actor,
			direct: true,
		});
		log('  published the sample page');
	} else if (committee) {
		log('  would publish the sample page');
	}

	console.log(`\n✅ ${APPLY ? 'import complete' : 'dry run complete — re-run with --apply to write'}`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
