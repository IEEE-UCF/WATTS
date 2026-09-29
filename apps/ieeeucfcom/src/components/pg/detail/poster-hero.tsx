import Image from 'next/image';
import type { ReactNode } from 'react';
import { Navbar } from '@/components/navbar';

export interface HeroImage {
	url: string;
	alt: string;
	/** GIF/animated uploads skip Vercel's optimizer. */
	animated?: boolean;
}

export interface HeroTag {
	label: string;
	/** solid = yellow fill (the page type); outline = yellow border (a state like CURRENT); muted = grey. */
	tone?: 'solid' | 'outline' | 'muted';
}

const TAG_TONES: Record<NonNullable<HeroTag['tone']>, string> = {
	solid: 'bg-ieee-bright-yellow text-black',
	outline: 'border border-ieee-bright-yellow bg-black/70 text-ieee-bright-yellow',
	muted: 'bg-black/70 text-white',
};

const DEFAULT_TONE: NonNullable<HeroTag['tone']> = 'muted';

export function HeroTags({ tags }: { tags: HeroTag[] }) {
	if (tags.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((t) => (
				<span
					key={t.label}
					className={`rounded-xs px-3 py-1 font-heading text-xs tracking-[0.12em] uppercase ${TAG_TONES[t.tone ?? DEFAULT_TONE]}`}
				>
					{t.label}
				</span>
			))}
		</div>
	);
}

/**
 * Full-bleed "poster" header shared by the project, committee and event pages: the
 * image fades to black at the bottom, and the tags, big yellow title, tagline and
 * actions sit on top of it. Without an image it's a plain near-black band.
 */
export function PosterHero({
	image,
	dimImage = false,
	tags = [],
	title,
	tagline,
	details,
	actions,
	aside,
}: {
	image: HeroImage | null;
	/** Faint, blurred backdrop, e.g. a flyer that's also shown full size in `aside`. */
	dimImage?: boolean;
	tags?: HeroTag[];
	title: string;
	tagline?: string | null;
	/** A row under the tagline, e.g. date / time / place. */
	details?: ReactNode;
	actions?: ReactNode;
	/** Right-hand column on wide screens (flyer, a big number); stacks below on phones. */
	aside?: ReactNode;
}) {
	const titleSize = aside
		? 'text-5xl md:text-7xl lg:text-[5.5rem]'
		: 'text-6xl md:text-8xl lg:text-[7.5rem]';
	const top = image && !dimImage ? 'pt-40 md:pt-64' : 'pt-12 md:pt-20';
	return (
		<header className="relative w-full overflow-hidden bg-ieee-near-black">
			{image && (
				<Image
					src={image.url}
					alt={dimImage ? '' : image.alt}
					fill
					sizes="100vw"
					priority
					className={`object-cover ${dimImage ? 'opacity-20 blur-sm' : 'opacity-70'}`}
					unoptimized={image.animated}
				/>
			)}
			<div
				aria-hidden
				className="absolute inset-0 bg-gradient-to-t from-black from-[6%] via-black/40 to-black/10"
			/>
			<div className="relative z-10 px-5">
				<Navbar />
			</div>
			<div
				className={`relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-12 md:px-10 md:pb-16 lg:items-end ${aside ? 'lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16' : ''} ${top}`}
			>
				<div className="flex min-w-0 flex-col gap-5">
					<HeroTags tags={tags} />
					<h1
						className={`font-display leading-[0.92] break-words text-ieee-bright-yellow ${titleSize}`}
					>
						{title}
					</h1>
					{aside ? (
						<>
							{tagline && (
								<p className="max-w-2xl font-body text-lg leading-snug text-white md:text-2xl">
									{tagline}
								</p>
							)}
							{details}
							{actions && (
								<div className="mt-2 flex flex-wrap items-center gap-3">
									{actions}
								</div>
							)}
						</>
					) : (
						<>
							{details}
							<div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
								{tagline ? (
									<p className="max-w-2xl font-body text-lg leading-snug text-white md:text-2xl">
										{tagline}
									</p>
								) : (
									<span />
								)}
								{actions && (
									<div className="flex shrink-0 flex-wrap items-center gap-3">
										{actions}
									</div>
								)}
							</div>
						</>
					)}
				</div>
				{aside && <div className="min-w-0">{aside}</div>}
			</div>
		</header>
	);
}
