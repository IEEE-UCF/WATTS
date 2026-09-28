import Image from 'next/image';
import Link from 'next/link';
import type { PublicContentPage } from '@watts/core/site-content';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { GlowButton } from '@/components/ui/glow-button';
import { ContentGallery } from '@/components/pg/content-gallery';
import { RequestInfoDropdown } from '@/components/pg/projectspage';

/**
 * Shared public layout for /committees/[slug] and /projects/[slug]. Intentionally
 * plain — content first, styling pass later (see docs/site-content/PRD.md).
 */
export function ContentPageView({ page }: { page: PublicContentPage }) {
	const paragraphs = page.body
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);
	const kind = page.type === 'committee' ? 'Committee' : 'Project';

	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-x-hidden bg-black text-white">
			<div className="relative w-full">
				{page.hero && (
					<Image
						src={page.hero.url}
						alt={page.hero.alt ?? page.title}
						fill
						sizes="100vw"
						priority
						className="object-cover opacity-40"
						unoptimized={page.hero.kind === 'animated'}
					/>
				)}
				<div className="relative z-10 px-5">
					<Navbar />
				</div>
				<div className="relative z-10 mx-auto flex max-w-4xl flex-col gap-3 px-6 py-16 md:py-24">
					<p className="font-heading text-sm tracking-widest text-ieee-bright-yellow uppercase">
						{kind}
					</p>
					<h1 className="font-heading text-4xl text-ieee-bright-yellow md:text-6xl">
						{page.title}
					</h1>
					{page.tagline && (
						<p className="font-subheading text-xl text-white md:text-2xl">
							{page.tagline}
						</p>
					)}
					{page.leadNames.length > 0 && (
						<p className="font-body text-muted-foreground">
							{page.type === 'committee' ? 'Led by ' : 'Project lead: '}
							<span className="text-white">{page.leadNames.join(', ')}</span>
						</p>
					)}
				</div>
			</div>

			<main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 pb-20">
				<section className="flex flex-col gap-4 font-body text-lg leading-relaxed">
					{paragraphs.map((p, i) => (
						<p key={i}>{p}</p>
					))}
				</section>

				<section>
					{page.type === 'committee' ? (
						<Link href={page.applyUrl ?? '/connect'} className="inline-block">
							<GlowButton innerClassName="px-10 py-4">
								<span className="font-heading text-lg text-white">APPLY</span>
							</GlowButton>
						</Link>
					) : (
						<RequestInfoDropdown projectId={page.id} />
					)}
				</section>

				<section className="flex flex-col gap-4">
					<h2 className="font-heading text-2xl text-ieee-bright-yellow">PHOTOS</h2>
					<ContentGallery
						title={page.title}
						assets={page.gallery}
						legacyUrls={page.legacyPhotoUrls}
					/>
				</section>
			</main>

			<Footer />
		</div>
	);
}
