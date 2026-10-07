import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { GlowButton } from '@/components/ui/glow-button';

export const metadata: Metadata = {
	title: 'Link retired | IEEE UCF',
	robots: { index: false },
};

/** Where /go/<slug> sends an archived, expired or unknown short link (e.g. an old flyer QR). */
export default async function LinkRetiredPage({
	searchParams,
}: {
	searchParams: Promise<{ reason?: string }>;
}) {
	const { reason } = await searchParams;
	const missing = reason === 'missing';

	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-x-hidden bg-black text-white">
			<div className="relative z-10 px-5">
				<Navbar />
			</div>
			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
				<p className="font-heading text-sm tracking-widest text-ieee-bright-yellow uppercase">
					{missing ? 'Link not found' : 'Link retired'}
				</p>
				<h1 className="font-heading text-5xl text-ieee-bright-yellow md:text-7xl">
					{missing ? 'NOTHING HERE' : 'THIS LINK HAS ENDED'}
				</h1>
				<p className="max-w-xl font-body text-lg text-muted-foreground">
					{missing
						? "We couldn't find that link. Check the address, or see what's coming up."
						: 'The QR code or link you followed was for something that has wrapped up. See what we have coming up next.'}
				</p>
				<div className="mt-4 flex flex-wrap justify-center gap-4">
					<Link href="/events" className="inline-block">
						<GlowButton innerClassName="px-8 py-3">
							<span className="font-heading text-white">SEE EVENTS</span>
						</GlowButton>
					</Link>
					<Link href="/" className="inline-block">
						<GlowButton innerClassName="px-8 py-3">
							<span className="font-heading text-white">BACK HOME</span>
						</GlowButton>
					</Link>
				</div>
			</main>
			<Footer />
		</div>
	);
}
