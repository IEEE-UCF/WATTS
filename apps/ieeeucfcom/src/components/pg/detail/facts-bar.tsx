import type { ReactNode } from 'react';

export interface Fact {
	label: string;
	value: ReactNode;
	/** Optional leading element, e.g. the lead's avatar. */
	leading?: ReactNode;
}

// Spelled out so Tailwind sees each class.
const MD_COLS: Record<number, string> = {
	1: 'md:grid-cols-1',
	2: 'md:grid-cols-2',
	3: 'md:grid-cols-3',
	4: 'md:grid-cols-4',
};

/**
 * The strip of prefilled facts under the hero (lead, team size, category, meeting
 * time…). Facts with no value are dropped so a sparse record doesn't show blanks.
 */
export function FactsBar({ facts }: { facts: Fact[] }) {
	const shown = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '');
	if (shown.length === 0) return null;
	return (
		<dl
			className={`mx-auto grid w-full max-w-6xl grid-cols-2 border-y border-ieee-dark-grey px-6 md:px-10 ${MD_COLS[Math.min(shown.length, 4)]}`}
		>
			{shown.map((f, i) => (
				<div
					key={f.label}
					className={`flex items-center gap-3 py-5 md:py-6 ${i % 2 === 1 ? 'border-l border-ieee-dark-grey pl-5' : ''} ${i > 0 ? 'md:border-l md:border-ieee-dark-grey md:pl-7' : ''}`}
				>
					{f.leading}
					<div className="flex min-w-0 flex-col">
						<dt className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey uppercase">
							{f.label}
						</dt>
						<dd className="truncate font-heading text-base text-white md:text-lg">
							{f.value}
						</dd>
					</div>
				</div>
			))}
		</dl>
	);
}
