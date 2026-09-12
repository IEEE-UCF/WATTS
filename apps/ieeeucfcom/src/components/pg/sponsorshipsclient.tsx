'use client';

import Image from 'next/image';
import Autoplay from 'embla-carousel-autoplay';
import { Carousel, CarouselContent, CarouselItem } from '@watts/ui/carousel';
import { useIsMobile } from '@watts/ui/use-mobile';
import { GlowButton } from '@/components/ui/glow-button';

// ---------------------------------------------------------------------------
// Hardcoded sponsor list — swap logos/names/URLs as needed
// ---------------------------------------------------------------------------
const SPONSORS: { name: string; logo: string; tier: string }[] = [
	{ name: 'Rex McCrary Foundation', logo: '/sponsors/rex.jpeg', tier: 'Gold' },
	{ name: 'Northrop Grumman', logo: '/sponsors/northrop.png', tier: 'Gold' },
	{ name: 'Cadence', logo: '/sponsors/cadence.png', tier: 'Gold' },
];

// ---------------------------------------------------------------------------
// mailto helper
// ---------------------------------------------------------------------------
interface MailToProps {
	email: string;
	subject?: string;
	body?: string;
	children?: React.ReactNode;
}

export const MailTo: React.FC<MailToProps> = ({ email, subject = '', body = '', children }) => (
	<a
		href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
	>
		{children}
	</a>
);

// ---------------------------------------------------------------------------
// Sponsors Carousel
// ---------------------------------------------------------------------------
export const SponsorsCarousel: React.FC = () => (
	<div className="w-full py-14">
		<div className="mb-12 text-center font-heading text-3xl text-ieee-bright-yellow md:text-4xl">
			OUR SPONSORS
		</div>
		<Carousel
			opts={{ align: 'center', loop: true }}
			plugins={[Autoplay({ delay: 2500, stopOnInteraction: false })]}
			className="w-full"
		>
			<CarouselContent className="-ml-6">
				{SPONSORS.map((sponsor, index) => (
					<CarouselItem key={index} className="basis-full pl-6 sm:basis-1/2 md:basis-1/3">
						<div className="group flex flex-col items-center gap-4 px-8 py-6">
							<div className="relative h-28 w-56 opacity-70 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0">
								<Image
									src={sponsor.logo}
									alt={sponsor.name}
									fill
									className="object-contain"
								/>
							</div>
							<span className="text-center font-body text-base text-muted-foreground transition-colors group-hover:text-ieee-bright-yellow">
								{sponsor.name}
							</span>
							<span className="rounded-full border border-ieee-bright-yellow px-3 py-1 font-heading text-xs tracking-widest text-ieee-bright-yellow uppercase opacity-70 transition-opacity group-hover:opacity-100">
								{sponsor.tier}
							</span>
						</div>
					</CarouselItem>
				))}
			</CarouselContent>
		</Carousel>
	</div>
);

// ---------------------------------------------------------------------------
// PDF Viewer — desktop: iframe via PDF.js; mobile: download/open card
// ---------------------------------------------------------------------------
const PDF_PATH = '/sponsors/IEEE_UCF_Sponsorship_Packet_2026_to_2027.pdf';

export const PDFViewer: React.FC = () => {
	const isMobile = useIsMobile();

	// ── Mobile: card with open / download buttons ───────────────────────────
	if (isMobile) {
		return (
			<div className="flex flex-col items-center gap-6 rounded-xl border border-white/10 bg-[#111] px-4 py-10">
				<svg
					className="h-14 w-14 text-ieee-bright-yellow"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
					/>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d="M9 13h6M9 17h3"
					/>
				</svg>
				<div className="text-center">
					<p className="mb-1 font-heading text-xl text-white">
						IEEE UCF Sponsorship Package
					</p>
					<p className="font-body text-sm text-muted-foreground">
						View the full sponsorship packet to learn about partnership opportunities.
					</p>
				</div>
				<div className="flex w-full max-w-xs flex-row gap-4">
					<a href={PDF_PATH} target="_blank" rel="noopener noreferrer" className="flex-1">
						<GlowButton innerClassName="px-7 py-3">
							<span className="font-heading text-sm text-white">OPEN PDF</span>
						</GlowButton>
					</a>
					<a
						href={PDF_PATH}
						download="IEEE-UCF-Sponsorship-Packet-2026-2027.pdf"
						className="flex-1"
					>
						<GlowButton innerClassName="px-7 py-3">
							<span className="font-heading text-sm text-white">DOWNLOAD</span>
						</GlowButton>
					</a>
				</div>
			</div>
		);
	}

	// ── Desktop: original direct iframe ─────────────────────────────────────
	return (
		<>
			<iframe src={PDF_PATH} width="100%" height="700px" />
			<div className="my-10 flex flex-row flex-wrap items-center gap-x-5 lg:gap-x-10">
				<a href={PDF_PATH} download="IEEE-UCF-Sponsorship-Packet-2026-2027.pdf">
					<GlowButton innerClassName="px-7 py-3">
						<span className="text-sm font-bold text-white">DOWNLOAD</span>
					</GlowButton>
				</a>
				<a href={PDF_PATH} target="_blank" rel="noopener noreferrer">
					<GlowButton innerClassName="px-7 py-3">
						<span className="text-sm font-bold text-white">OPEN IN NEW TAB</span>
					</GlowButton>
				</a>
			</div>
		</>
	);
};
