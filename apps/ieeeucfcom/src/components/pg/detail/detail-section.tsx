import type { ReactNode } from 'react';

/**
 * One stacked section of a detail page. `eyebrow` is the small yellow label used for
 * body text ("OVERVIEW"); `title` is the big yellow heading used for rows of cards
 * ("THE TEAM"). `action` sits on the right of the heading (e.g. "All events →").
 */
export function DetailSection({
	eyebrow,
	title,
	action,
	children,
	className = '',
}: {
	eyebrow?: string;
	title?: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={`mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 md:px-10 ${className}`}
		>
			{(eyebrow || title || action) && (
				<div className="flex items-baseline justify-between gap-4">
					{title ? (
						<h2 className="font-display text-2xl text-ieee-bright-yellow uppercase md:text-3xl">
							{title}
						</h2>
					) : (
						<h2 className="font-heading text-xs tracking-[0.16em] text-ieee-bright-yellow uppercase md:text-sm">
							{eyebrow}
						</h2>
					)}
					{action}
				</div>
			)}
			{children}
		</section>
	);
}

/** Body copy split into paragraphs on blank lines (plain text; Markdown comes later). */
export function Prose({ text }: { text: string }) {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);
	return (
		<div className="flex flex-col gap-5 font-body text-lg leading-relaxed text-[#d6d8da] md:text-xl md:leading-[1.75]">
			{paragraphs.map((p, i) => (
				<p key={i} className="whitespace-pre-line">
					{p}
				</p>
			))}
		</div>
	);
}

const TAG_TONES = {
	skill: 'bg-ieee-dark-grey text-white',
	hardware: 'bg-ieee-light-grey text-black',
	software: 'bg-ieee-grey text-white',
} as const;

/** A labelled group of tag chips (skills / hardware / software). Hidden when empty. */
export function TagGroup({
	label,
	tags,
	tone,
}: {
	label: string;
	tags: string[];
	tone: keyof typeof TAG_TONES;
}) {
	if (tags.length === 0) return null;
	return (
		<div className="flex flex-col gap-2.5">
			<h3 className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey uppercase">
				{label}
			</h3>
			<ul className="flex flex-wrap gap-2">
				{tags.map((t) => (
					<li
						key={t}
						className={`rounded-xs px-3 py-1.5 font-subheading text-sm ${TAG_TONES[tone]}`}
					>
						{t}
					</li>
				))}
			</ul>
		</div>
	);
}
