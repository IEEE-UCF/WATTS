import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Footer } from '@/components/footer';
import { PosterHero } from '@/components/pg/detail/poster-hero';
import { getCommitteeDirectory } from '@/lib/site-content';

// Static; refreshed when a committee page is published (site-content tag) or hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
	title: 'Committees | IEEE UCF',
	description: 'The committees that run IEEE @ UCF, and how to get involved with each one.',
};

export default async function CommitteesPage() {
	const committees = await getCommitteeDirectory();
	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-x-hidden bg-black text-white">
			<PosterHero
				image={null}
				tags={[{ label: 'Get involved', tone: 'solid' }]}
				title="Committees"
				tagline="Every committee is run by members. Pick one that fits and help run it."
			/>
			<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 pt-4 pb-20 md:px-10">
				{committees.length === 0 ? (
					<p className="font-body text-lg text-ieee-light-grey">
						Committee pages are on their way. In the meantime, see{' '}
						<Link href="/about" className="text-ieee-bright-yellow hover:underline">
							About
						</Link>
						.
					</p>
				) : (
					<ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{committees.map((c) => (
							<li key={c.slug}>
								<Link
									href={`/committees/${c.slug}`}
									className="group flex h-full flex-col overflow-hidden rounded-sm border border-ieee-dark-grey bg-ieee-near-black transition-colors hover:border-ieee-bright-yellow"
								>
									<div className="relative aspect-[16/10] w-full bg-ieee-dark-grey">
										{c.photoUrl ? (
											<Image
												src={c.photoUrl}
												alt=""
												fill
												sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
												className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
											/>
										) : (
											<div className="flex h-full items-center justify-center font-display text-3xl text-ieee-grey">
												IEEE
											</div>
										)}
									</div>
									<div className="flex flex-1 flex-col gap-2 px-6 py-5">
										<h2 className="font-display text-2xl text-ieee-bright-yellow">
											{c.title}
										</h2>
										{c.tagline && (
											<p className="font-body text-base leading-snug text-[#d6d8da]">
												{c.tagline}
											</p>
										)}
										<span className="mt-auto pt-3 font-subheading text-sm text-ieee-light-grey">
											{c.chairName ? `Chair: ${c.chairName}` : ''}
											<span className="float-right font-heading text-ieee-bright-yellow">
												View →
											</span>
										</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</div>
	);
}
