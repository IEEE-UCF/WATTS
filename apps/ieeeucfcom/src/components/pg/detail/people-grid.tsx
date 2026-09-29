import Image from 'next/image';
import type { ReactNode } from 'react';
import type { PublicPerson } from '@watts/core/site-content';

/** Round portrait, or initials when there's no photo. Leads get the yellow ring. */
export function Avatar({
	person,
	size,
}: {
	person: Pick<PublicPerson, 'name' | 'initials' | 'portraitUrl' | 'isLead'>;
	size: 'sm' | 'lg';
}) {
	const box = size === 'lg' ? 'size-20 text-2xl md:size-28 md:text-3xl' : 'size-11 text-sm';
	const tone = person.isLead
		? 'border-2 border-ieee-bright-yellow bg-ieee-warm-dark text-ieee-bright-yellow'
		: 'bg-ieee-dark-grey text-ieee-light-grey';
	return (
		<div
			className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display ${box} ${tone}`}
		>
			{person.portraitUrl ? (
				// Portraits come from several hosts (Discord, Blob); they're small, so skip the optimizer.
				<Image
					src={person.portraitUrl}
					alt=""
					fill
					sizes="112px"
					unoptimized
					className="object-cover"
				/>
			) : (
				<span aria-hidden>{person.initials}</span>
			)}
		</div>
	);
}

/**
 * Team / committee roster: portrait, name, and a "LEAD" tag or "Major · '27" line.
 * `trailing` renders as the last tile (e.g. a "You? Request to join" tile).
 */
export function PeopleGrid({ people, trailing }: { people: PublicPerson[]; trailing?: ReactNode }) {
	return (
		<ul className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
			{people.map((p) => (
				<li key={p.id} className="flex flex-col items-center gap-2.5 text-center">
					<Avatar person={p} size="lg" />
					<span className="font-heading text-sm text-white md:text-base">{p.name}</span>
					{p.isLead ? (
						<span className="font-subheading text-xs tracking-[0.12em] text-ieee-bright-yellow">
							LEAD
						</span>
					) : (
						p.detail && (
							<span className="font-body text-xs text-ieee-light-grey md:text-sm">
								{p.detail}
							</span>
						)
					)}
				</li>
			))}
			{trailing && (
				<li className="flex flex-col items-center gap-2.5 text-center">{trailing}</li>
			)}
		</ul>
	);
}
