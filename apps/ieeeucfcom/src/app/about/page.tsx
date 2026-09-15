import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';

import { Metadata } from 'next';

import AboutHeader from '@/components/pg/aboutheader';
import AboutIEEE from '@/components/pg/aboutieee';
import AboutOfficers from '@/components/pg/aboutofficers';

const pageTitle = 'About | IEEE UCF';
const pageDescription =
	'IEEE UCF is one of the largest IEEE student branches in the nation, fostering collaboration, technical growth, and career success for over 300 members in diverse engineering fields.';

export const metadata: Metadata = {
	title: pageTitle,
	description: pageDescription,
	openGraph: {
		title: pageTitle,
		description: pageDescription,
		url: 'https://www.ieeeucf.com/about',
		type: 'website',
	},
};

export default function About() {
	return (
		<div className="flex max-w-screen flex-col overflow-hidden">
			<div className="relative h-[120vh] w-full">
				<div className="absolute inset-0 z-4 h-fit w-full items-center px-5">
					<Navbar />
				</div>
				<AboutHeader />
			</div>
			<div className="relative w-full -translate-y-20 overflow-hidden leading-none">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 1200 120"
					preserveAspectRatio="none"
					className="h-20 w-full"
				>
					<defs>
						<radialGradient id="bg-gradient" cx="40%" cy="120%" r="125%">
							<stop offset="50%" style={{ stopColor: 'var(--color-ieee-black)' }} />
							<stop offset="100%" style={{ stopColor: 'var(--color-ieee-black)' }} />
						</radialGradient>
					</defs>

					<path
						d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86, 82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53, 26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
						fill="url(#bg-gradient)"
						transform="scale(1,-1) translate(0,-120)"
					/>
				</svg>
			</div>
			<div className="flex w-full -translate-y-20 flex-col justify-center gap-x-3 bg-black">
				<div className="h-auto place-self-center p-10 text-white sm:w-10/12 sm:p-20">
					<div className="font-heading text-3xl text-ieee-bright-yellow md:text-4xl">
						IEEE @ UCF IN A NUTSHELL
					</div>
					<AboutIEEE />
				</div>
			</div>
			<div className="relative w-full -translate-y-40 overflow-hidden leading-none">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 1200 120"
					preserveAspectRatio="none"
					className="h-20 w-full"
				>
					<defs>
						<radialGradient id="bg-gradient3" cx="40%" cy="120%" r="125%">
							<stop
								offset="50%"
								style={{ stopColor: 'var(--color-ieee-dark-grey)' }}
							/>
							<stop
								offset="100%"
								style={{ stopColor: 'var(--color-ieee-dark-grey)' }}
							/>
						</radialGradient>
					</defs>

					<path
						d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86, 82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53, 26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
						fill="url(#bg-gradient3)"
						transform="scale(1,-1) translate(0,-120)"
					/>
				</svg>
			</div>
			<div className="-translate-y-40 bg-ieee-dark-grey">
				<AboutOfficers />
			</div>
			<div className="-mt-40">
				<Footer />
			</div>
		</div>
	);
}
