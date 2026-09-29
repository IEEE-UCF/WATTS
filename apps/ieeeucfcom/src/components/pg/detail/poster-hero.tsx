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
	tags = [],
	title,
	tagline,
	actions,
}: {
	image: HeroImage | null;
	tags?: HeroTag[];
	title: string;
	tagline?: string | null;
	actions?: ReactNode;
}) {
	return (
		<header className="relative w-full overflow-hidden bg-ieee-near-black">
			{image && (
				<Image
					src={image.url}
					alt={image.alt}
					fill
					sizes="100vw"
					priority
					className="object-cover opacity-70"
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
				className={`relative z-10 mx-auto flex max-w-6xl flex-col gap-5 px-6 pb-12 md:px-10 md:pb-16 ${image ? 'pt-40 md:pt-64' : 'pt-16 md:pt-24'}`}
			>
				<HeroTags tags={tags} />
				<h1 className="font-display text-6xl leading-[0.92] break-words text-ieee-bright-yellow md:text-8xl lg:text-[7.5rem]">
					{title}
				</h1>
				<div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
					{tagline ? (
						<p className="max-w-2xl font-body text-lg leading-snug text-white md:text-2xl">
							{tagline}
						</p>
					) : (
						<span />
					)}
					{actions && (
						<div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
					)}
				</div>
			</div>
		</header>
	);
}
