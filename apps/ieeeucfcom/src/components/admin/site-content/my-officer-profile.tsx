'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
	AssetPreview,
	Banner,
	buttonClass,
	fieldClass,
	primaryButtonClass,
	StatusTag,
	UploadButton,
} from './shared';

/**
 * /settings card for a member linked to an officer profile: edit your own public
 * bio/photo on /about. Non-staff submissions go to the review queue.
 */
export function MyOfficerProfileCard() {
	const utils = trpc.useUtils();
	const q = trpc.siteContent.myOfficerProfile.useQuery(undefined, { retry: false });
	const submit = trpc.siteContent.submitMyOfficerProfile.useMutation({
		onSuccess: () => void utils.siteContent.myOfficerProfile.invalidate(),
	});
	const [form, setForm] = useState<{
		major: string;
		yearLabel: string;
		bio: string;
		linkedinUrl: string;
		portraitAssetId: string | null;
		portraitUrl: string | null;
	} | null>(null);
	const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	useEffect(() => {
		const p = q.data?.profile;
		if (!p || form) return;
		setForm({
			major: p.major ?? '',
			yearLabel: p.yearLabel ?? '',
			bio: p.bio ?? '',
			linkedinUrl: p.linkedinUrl ?? '',
			portraitAssetId: p.portraitAssetId,
			portraitUrl: p.portrait?.url ?? null,
		});
	}, [q.data, form]);

	if (!q.data || !form) return null;
	const { profile, latestSubmission } = q.data;

	async function save(e: React.FormEvent) {
		e.preventDefault();
		if (!form) return;
		try {
			const res = await submit.mutateAsync({
				major: form.major || null,
				yearLabel: form.yearLabel || null,
				bio: form.bio || null,
				linkedinUrl: form.linkedinUrl || null,
				portraitAssetId: form.portraitAssetId,
			});
			setBanner({
				kind: 'ok',
				text:
					res?.status === 'published' ? 'Saved and published.' : 'Submitted for review.',
			});
		} catch (err) {
			setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
		}
	}

	return (
		<section className="rounded-lg border border-border bg-card/50 p-5 text-foreground">
			<h2 className="mb-1 text-lg font-semibold">Officer profile</h2>
			<p className="mb-4 text-sm text-muted-foreground">
				How you appear on the /about page as {profile.roleTitle}. Changes are reviewed
				before they go live.
			</p>
			{banner && <Banner {...banner} onClose={() => setBanner(null)} />}
			{latestSubmission && latestSubmission.status !== 'published' && (
				<p className="mb-4 text-sm">
					Latest submission: <StatusTag status={latestSubmission.status} />
					{latestSubmission.reviewNote && (
						<span className="text-muted-foreground">
							{' '}
							— {latestSubmission.reviewNote}
						</span>
					)}
				</p>
			)}
			<form onSubmit={save} className="space-y-4">
				<div className="flex flex-wrap items-center gap-4">
					<AssetPreview
						asset={form.portraitUrl ? { url: form.portraitUrl } : null}
						className="h-24 w-20"
					/>
					<UploadButton
						label="Upload professional photo"
						options={{
							mediaKind: 'image',
							purpose: 'officer-portrait',
							officerProfileId: profile.id,
						}}
						onUploaded={(a) =>
							setForm((f) =>
								f ? { ...f, portraitAssetId: a.id, portraitUrl: a.url } : f,
							)
						}
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1 block text-xs text-muted-foreground">Major</span>
						<input
							value={form.major}
							onChange={(e) => setForm({ ...form, major: e.target.value })}
							className={fieldClass}
						/>
					</label>
					<label className="block">
						<span className="mb-1 block text-xs text-muted-foreground">Year</span>
						<input
							value={form.yearLabel}
							onChange={(e) => setForm({ ...form, yearLabel: e.target.value })}
							className={fieldClass}
						/>
					</label>
					<label className="block sm:col-span-2">
						<span className="mb-1 block text-xs text-muted-foreground">
							LinkedIn URL
						</span>
						<input
							value={form.linkedinUrl}
							onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
							className={fieldClass}
						/>
					</label>
				</div>
				<label className="block">
					<span className="mb-1 block text-xs text-muted-foreground">Bio</span>
					<textarea
						rows={4}
						value={form.bio}
						onChange={(e) => setForm({ ...form, bio: e.target.value })}
						className={fieldClass}
					/>
				</label>
				<div className="flex gap-2">
					<button
						type="submit"
						className={primaryButtonClass}
						disabled={submit.isPending}
					>
						Submit changes
					</button>
					<button type="button" className={buttonClass} onClick={() => setForm(null)}>
						Reset
					</button>
				</div>
			</form>
		</section>
	);
}
