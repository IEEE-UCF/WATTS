// Résumé fixtures for resume-export.authed.spec.ts.
//
// Creates three dedicated synthetic members, each with a real one-page PDF in the
// private bucket, spanning two graduation years / two majors / a dues mix / one
// officer — enough to exercise the export filters, the year→major grouping and the
// "always include officers" force-add.
//
// Talks to MinIO / S3 directly (like apps/jobs/src/archive-to-onedrive.mjs) — the
// e2e package's eslint config keeps the website-only @watts/storage out. Same
// un-bypassable guard as lib/session.ts: local / CI Postgres only. Idempotent
// (`seed` self-heals a prior crash) and fully removed by `clean`.

import { loadRootEnv } from '@watts/config/load-env';
import {
	CreateBucketCommand,
	DeleteObjectCommand,
	ListBucketsCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import pg from 'pg';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { dbHostAllowed } from './session';

loadRootEnv();

export interface ResumeFixture {
	key: string; // fixed identity key — email + storage stem
	firstName: string;
	lastName: string;
	major: string;
	graduationYear: number;
	duesPaid: boolean;
	officer: boolean;
}

export const RESUME_FIXTURES: ResumeFixture[] = [
	{ key: 'e2e-resume-alpha', firstName: 'Alpha', lastName: 'E2E-Resume', major: 'Computer Science (BS)', graduationYear: 2024, duesPaid: true, officer: false },
	{ key: 'e2e-resume-bravo', firstName: 'Bravo', lastName: 'E2E-Resume', major: 'Electrical Engineering (BSEE)', graduationYear: 2024, duesPaid: false, officer: false },
	{ key: 'e2e-resume-charlie', firstName: 'Charlie', lastName: 'E2E-Resume', major: 'Computer Science (BS)', graduationYear: 2025, duesPaid: true, officer: true },
];

export const STORAGE_IS_LOCAL = (process.env.STORAGE_PROVIDER ?? 'local') !== 'vercel';

function pool(): pg.Pool {
	const url = process.env.DATABASE_URL;
	if (!url || !dbHostAllowed()) {
		throw new Error('resume fixtures: refusing to run without a local DATABASE_URL');
	}
	return new pg.Pool({ connectionString: url });
}

function s3(): { client: S3Client; bucket: string } {
	return {
		client: new S3Client({
			endpoint: process.env.S3_ENDPOINT,
			region: process.env.S3_REGION || 'us-east-1',
			forcePathStyle: true,
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
			},
		}),
		bucket: process.env.S3_BUCKET_PRIVATE || 'resumes-private',
	};
}

/**
 * Is the object store actually up? The e2e suite runs against a local/CI Postgres
 * for the synthetic session, but object storage (MinIO) is a separate service —
 * the résumé-export spec is the only one that needs it. Returns false on
 * ECONNREFUSED etc. so the spec can skip instead of failing the run.
 */
export async function storageReachable(): Promise<boolean> {
	const { client } = s3();
	try {
		await Promise.race([
			client.send(new ListBucketsCommand({})),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
		]);
		return true;
	} catch {
		return false;
	} finally {
		client.destroy();
	}
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
	try {
		await client.send(new CreateBucketCommand({ Bucket: bucket }));
	} catch (err) {
		const code = (err as { name?: string }).name ?? '';
		if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err;
	}
}

async function makePdf(label: string): Promise<Buffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const font = await doc.embedFont(StandardFonts.HelveticaBold);
	page.drawText(label, { x: 56, y: 700, size: 20, font });
	return Buffer.from(await doc.save());
}

export async function seedResumeFixtures(): Promise<void> {
	const p = pool();
	const { client, bucket } = s3();
	try {
		await ensureBucket(client, bucket);

		for (const f of RESUME_FIXTURES) {
			const email = `${f.key}@watts.local`;
			const storageKey = `resumes/${f.key}.pdf`;

			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: storageKey,
					Body: await makePdf(`${f.firstName} ${f.lastName} - ${f.major} ${f.graduationYear}`),
					ContentType: 'application/pdf',
				}),
			);

			const { rows } = await p.query<{ id: string }>(
				`insert into members
					(discord_id, first_name, last_name, date_of_birth, personal_email, ucf_email,
					 major, gender, graduation_year, dues_paid, officer_status,
					 resume_key, resume_file_name, resume_uploaded_at)
				 values ($1,$2,$3,'2001-01-01',$4,$5,$6,'PNTS',$7,$8,$9,$10,$11, now())
				 on conflict (personal_email) do update set
					 major = excluded.major,
					 graduation_year = excluded.graduation_year,
					 dues_paid = excluded.dues_paid,
					 officer_status = excluded.officer_status,
					 resume_key = excluded.resume_key,
					 resume_file_name = excluded.resume_file_name,
					 resume_uploaded_at = now()
				 returning id`,
				[
					f.key,
					f.firstName,
					f.lastName,
					email,
					`${f.key}@ucf.edu`,
					f.major,
					f.graduationYear,
					f.duesPaid,
					f.officer,
					storageKey,
					`${f.lastName}-${f.firstName}.pdf`,
				],
			);
			await p.query(`update members set resume_url = $1 where id = $2`, [
				`/api/files/resume/${rows[0].id}`,
				rows[0].id,
			]);
		}
	} finally {
		await p.end();
		client.destroy();
	}
}

export async function cleanResumeFixtures(): Promise<void> {
	const p = pool();
	const { client, bucket } = s3();
	try {
		for (const f of RESUME_FIXTURES) {
			await client
				.send(new DeleteObjectCommand({ Bucket: bucket, Key: `resumes/${f.key}.pdf` }))
				.catch(() => undefined);
			await p.query(`delete from members where personal_email = $1`, [`${f.key}@watts.local`]);
		}
	} finally {
		await p.end();
		client.destroy();
	}
}
