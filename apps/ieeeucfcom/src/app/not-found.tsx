import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { GlowButton } from '@/components/ui/glow-button';

export const metadata: Metadata = {
	title: 'Page not found | IEEE UCF',
	robots: { index: false },
};

/** Site-wide 404: unknown URLs and every notFound() call (e.g. unpublished committee pages). */
export default function NotFound() {
	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-x-hidden bg-black text-white">
			<div className="relative z-10 px-5">
				<Navbar />
			</div>
			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
				<p className="font-heading text-sm tracking-widest text-ieee-bright-yellow uppercase">
					Error 404
				</p>
				<h1 className="font-heading text-5xl text-ieee-bright-yellow md:text-7xl">
					PAGE NOT FOUND
				</h1>
				<p className="max-w-xl font-body text-lg text-muted-foreground">
					This page doesn&apos;t exist, or it hasn&apos;t been published yet. Check the
					address, or head back and find what you were looking for.
				</p>
				<div className="mt-4 flex flex-wrap justify-center gap-4">
					<Link href="/" className="inline-block">
						<GlowButton innerClassName="px-8 py-3">
							<span className="font-heading text-white">BACK HOME</span>
						</GlowButton>
					</Link>
					<Link href="/events" className="inline-block">
						<GlowButton innerClassName="px-8 py-3">
							<span className="font-heading text-white">SEE EVENTS</span>
						</GlowButton>
					</Link>
				</div>
			</main>
			<Footer />
		</div>
	);
}
