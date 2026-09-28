'use client';

import { useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { uploadProjectPhoto } from '@watts/storage/client';

/**
 * Photo manager for one project. Order matters: the first photo is the main one, shown
 * on the public /projects card and in its "Learn more" panel.
 */
export function ProjectPhotos({
	projectId,
	photoUrls,
	onChanged,
}: {
	projectId: string;
	photoUrls: string[];
	onChanged: () => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
	const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const confirmPhoto = trpc.project.confirmPhoto.useMutation();
	const reorder = trpc.project.reorderPhotos.useMutation({
		onSuccess: onChanged,
		onError: (e) => setMessage({ kind: 'err', text: e.message }),
	});
	const remove = trpc.project.removePhoto.useMutation({
		onSuccess: () => {
			setConfirmRemove(null);
			setMessage({ kind: 'ok', text: 'Photo removed.' });
			onChanged();
		},
		onError: (e) => setMessage({ kind: 'err', text: e.message }),
	});
	const busy = uploading || reorder.isPending || remove.isPending;

	function move(from: number, to: number) {
		const next = [...photoUrls];
		const [url] = next.splice(from, 1);
		next.splice(to, 0, url);
		setMessage(null);
		reorder.mutate({ projectId, photoUrls: next });
	}

	async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		setUploading(true);
		setMessage(null);
		try {
			const { photoId } = await uploadProjectPhoto(projectId, file);
			await confirmPhoto.mutateAsync({ projectId, photoId, filename: file.name });
			setMessage({
				kind: 'ok',
				text:
					photoUrls.length === 0
						? 'Photo added. It is the main photo.'
						: 'Photo added at the end. Use "Make main" to feature it.',
			});
			onChanged();
		} catch (err) {
			setMessage({
				kind: 'err',
				text: err instanceof Error ? err.message : 'Photo upload failed',
			});
		} finally {
			setUploading(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">
					The <b className="text-foreground">main photo</b> is shown on the public
					Projects page card and in its &ldquo;Learn more&rdquo; panel.
				</p>
				<button
					type="button"
					disabled={busy}
					onClick={() => fileRef.current?.click()}
					className="rounded-md bg-ieee-dark-yellow px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
				>
					{uploading ? 'Uploading…' : '+ Add photo'}
				</button>
				<input
					ref={fileRef}
					type="file"
					accept="image/jpeg,image/png,image/webp"
					className="hidden"
					onChange={onFile}
				/>
			</div>

			{message && (
				<p
					className={`text-xs ${message.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}
				>
					{message.text}
				</p>
			)}

			{photoUrls.length === 0 ? (
				<p className="rounded-md border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
					No photos yet. The public page shows a placeholder until you add one.
				</p>
			) : (
				<ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
					{photoUrls.map((url, i) => (
						<li
							key={url}
							className={`flex flex-col overflow-hidden rounded-md border ${
								i === 0 ? 'border-ieee-dark-yellow' : 'border-input'
							}`}
						>
							<div className="relative">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={url}
									alt=""
									className="aspect-[4/3] w-full object-cover"
								/>
								{i === 0 && (
									<span className="absolute top-1 left-1 rounded bg-ieee-dark-yellow px-1.5 py-0.5 text-[10px] font-semibold text-black uppercase">
										Main photo
									</span>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-xs">
								{i > 0 && (
									<button
										type="button"
										disabled={busy}
										onClick={() => move(i, 0)}
										className="font-semibold text-ieee-dark-yellow hover:underline disabled:opacity-50"
									>
										Make main
									</button>
								)}
								<button
									type="button"
									disabled={busy || i === 0}
									onClick={() => move(i, i - 1)}
									aria-label="Move earlier"
									className="text-blue-400 hover:underline disabled:opacity-30"
								>
									←
								</button>
								<button
									type="button"
									disabled={busy || i === photoUrls.length - 1}
									onClick={() => move(i, i + 1)}
									aria-label="Move later"
									className="text-blue-400 hover:underline disabled:opacity-30"
								>
									→
								</button>
								{confirmRemove === url ? (
									<span className="ml-auto flex gap-2">
										<button
											type="button"
											disabled={busy}
											onClick={() =>
												remove.mutate({ projectId, photoUrl: url })
											}
											className="font-semibold text-red-400 hover:underline disabled:opacity-50"
										>
											{remove.isPending ? 'Removing…' : 'Confirm'}
										</button>
										<button
											type="button"
											onClick={() => setConfirmRemove(null)}
											className="text-muted-foreground hover:underline"
										>
											Cancel
										</button>
									</span>
								) : (
									<button
										type="button"
										disabled={busy}
										onClick={() => setConfirmRemove(url)}
										className="ml-auto text-red-400 hover:underline disabled:opacity-50"
									>
										Remove
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
