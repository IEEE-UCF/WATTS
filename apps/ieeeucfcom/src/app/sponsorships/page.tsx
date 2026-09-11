// Server component — metadata export works because there's no "use client" here
import Image from 'next/image';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Metadata } from 'next';
import { MailTo, SponsorsCarousel, PDFViewer } from '@/components/pg/sponsorshipsclient';

const pageTitle = 'Sponsorships | IEEE UCF';
const pageDescription =
	'To inquire about supporting IEEE UCF, view the sponsorship package or send a direct email.';

export const metadata: Metadata = {
	title: pageTitle,
	description: pageDescription,
	openGraph: {
		title: pageTitle,
		description: pageDescription,
		url: 'https://www.ieeeucf.com/sponsorships',
		type: 'website',
	},
};

export default function SponsorshipsPage() {
	return (
		<div className="flex max-w-screen flex-col overflow-hidden bg-black">
			{/* Hero */}
			<div className="relative h-[120vh] w-full">
				<div className="absolute inset-0 z-4 h-fit w-full items-center px-5">
					<Navbar />
				</div>

				<div className="animated-background absolute inset-0 top-0 left-0 z-2 h-full w-full items-center bg-gradient-to-r px-5 [background:radial-gradient(125%_125%_at_50%_10%,#0c0a09_5%,transparent_100%)]" />

				<div className="absolute z-3 my-20 flex w-screen flex-row justify-center p-40">
					<div className="float flex flex-col items-center justify-center gap-y-5 self-center text-center">
						<div className="font-[heading-font] text-5xl text-[var(--ieee-bright-yellow)] sm:text-6xl">
							SPONSORSHIPS
						</div>
						<div className="w-3/4 font-[body-font] text-xl text-white lg:text-2xl">
							Without sponsors, nothing would be possible for IEEE @ UCF. To inquire
							about supporting IEEE @ UCF, view the sponsorship package below or click
							the button to send a direct email.
						</div>
						<div className="group relative cursor-pointer">
							<div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-[var(--ieee-bright-yellow)] to-[var(--ieee-bright-yellow)] opacity-25 blur transition duration-1000 group-hover:opacity-100 group-hover:duration-200" />
							<div className="relative flex items-start justify-start space-x-6 rounded-lg bg-[#0c0a09] px-10 py-7 leading-none ring-1 ring-gray-900/5">
								<div className="space-y-2 text-2xl font-bold text-white">
									<MailTo
										email="ieee@ucf.edu"
										subject="Sponsorship Inquiry"
										body="Hello IEEE at UCF,"
									>
										INQUIRE ABOUT SPONSORING
									</MailTo>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="h-full w-full bg-black">
					<Image
						className="absolute z-0 h-full w-full object-cover opacity-50"
						src="/committees/socialgif2.gif"
						alt="About Us Photo"
						width={2000}
						height={2000}
					/>
				</div>
			</div>

			{/* Wave divider */}
			<div className="relative w-full -translate-y-20 overflow-hidden leading-none">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 1200 120"
					preserveAspectRatio="none"
					className="h-20 w-full"
				>
					<defs>
						<radialGradient id="bg-gradient" cx="40%" cy="120%" r="125%">
							<stop offset="50%" stopColor="#000000" />
							<stop offset="100%" stopColor="#000000" />
						</radialGradient>
					</defs>
					<path
						d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86, 82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53, 26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
						fill="url(#bg-gradient)"
						transform="scale(1,-1) translate(0,-120)"
					/>
				</svg>
			</div>

			{/* Sponsors carousel */}
			<div className="border-b border-white/10 bg-black px-10">
				<SponsorsCarousel />
			</div>

			{/* PDF section — PDFViewer handles mobile vs desktop internally */}
			<div className="m-4 rounded-xl bg-black p-6 md:m-10 md:p-10">
				<PDFViewer />
			</div>

			<Footer />
		</div>
	);
}
