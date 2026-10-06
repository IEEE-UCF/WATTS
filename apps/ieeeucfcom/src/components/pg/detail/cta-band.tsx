import type { ReactNode } from 'react';

/** The yellow call-to-action band near the bottom of a detail page. */
export function CtaBand({
	title,
	subtitle,
	action,
}: {
	title: string;
	subtitle?: string;
	action: ReactNode;
}) {
	return (
		<section className="mx-auto w-full max-w-6xl px-6 md:px-10">
			<div className="flex flex-col gap-6 rounded-sm bg-ieee-bright-yellow px-8 py-9 text-black md:flex-row md:items-center md:justify-between md:px-12 md:py-10">
				<div className="flex flex-col gap-1.5">
					<p className="font-display text-2xl md:text-3xl">{title}</p>
					{subtitle && <p className="font-subheading text-base md:text-lg">{subtitle}</p>}
				</div>
				<div className="shrink-0">{action}</div>
			</div>
		</section>
	);
}
