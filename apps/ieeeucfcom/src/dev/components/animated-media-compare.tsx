'use client';

import { useEffect, useState } from 'react';

import { AnimatedMedia, type AnimatedMediaMode } from '@/components/animated-media';

const COLUMNS: { mode: AnimatedMediaMode; label: string; ext: string }[] = [
	{ mode: 'gif', label: 'GIF (original)', ext: '.gif' },
	{ mode: 'webp', label: 'Animated WebP', ext: '.webp' },
	{ mode: 'static', label: 'Static (first frame)', ext: '-static.webp' },
	{ mode: 'video', label: 'Video (webm/mp4)', ext: '.webm' },
];

function formatBytes(n: number | null | undefined): string {
	if (n == null) return 'n/a';
	return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

/** HEAD the file so the gallery can show real byte sizes next to each rendering. */
function useBytes(url: string): number | null | undefined {
	const [bytes, setBytes] = useState<number | null | undefined>(undefined);
	useEffect(() => {
		let cancelled = false;
		setBytes(undefined);
		fetch(url, { method: 'HEAD' })
			.then((r) => {
				if (cancelled) return;
				const len = r.ok ? r.headers.get('content-length') : null;
				setBytes(len ? Number(len) : null);
			})
			.catch(() => !cancelled && setBytes(null));
		return () => {
			cancelled = true;
		};
	}, [url]);
	return bytes;
}

function Column({
	name,
	mode,
	label,
	ext,
	height,
}: {
	name: string;
	mode: AnimatedMediaMode;
	label: string;
	ext: string;
	height: number;
}) {
	const bytes = useBytes(`${name}${ext}`);
	return (
		<figure className="flex flex-col gap-2">
			<div className="relative w-full overflow-hidden rounded-sm bg-black" style={{ height }}>
				<AnimatedMedia
					name={name}
					mode={mode}
					alt={label}
					fill
					sizes="360px"
					className="object-cover object-center"
				/>
			</div>
			<figcaption className="text-xs text-muted-foreground">
				<span className="font-semibold text-foreground">{label}</span>
				<br />
				{formatBytes(bytes)}
				{bytes === null && mode === 'video' ? ' (files not generated yet)' : ''}
			</figcaption>
		</figure>
	);
}

/** Side-by-side of every delivery format for one animated asset. */
export function AnimatedMediaCompare({ name, height }: { name: string; height: number }) {
	return (
		<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{COLUMNS.map((c) => (
				<Column key={c.mode} name={name} height={height} {...c} />
			))}
		</div>
	);
}
