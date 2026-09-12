import Image from 'next/image';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

import { Metadata } from 'next';
import EventSidebar from '@/components/pg/eventsidebar';

const pageTitle = 'Events | IEEE UCF';
const pageDescription =
	'IEEE UCF offers technical workshops, career sessions, social events, and service opportunities to help students grow skills and expand networks.';

export const metadata: Metadata = {
	title: pageTitle,
	description: pageDescription,
	openGraph: {
		title: pageTitle,
		description: pageDescription,
		url: 'https://www.ieeeucf.com/events',
		type: 'website',
	},
};

export default function EventsPage() {
	return (
		<div className="flex max-w-screen flex-col overflow-hidden">
			<div className="relative h-[120vh] w-full">
				<div className="absolute inset-0 z-4 h-fit w-full items-center px-5">
					<Navbar />
				</div>

				<div className="animated-background absolute inset-0 top-0 left-0 z-2 h-full w-full items-center bg-gradient-to-r px-5 [background:radial-gradient(125%_125%_at_50%_10%,#0c0a09_5%,transparent_100%)]"></div>

				<div className="absolute z-3 my-30 flex w-screen flex-row justify-center p-40 px-10 md:px-20 lg:justify-end lg:px-40">
					<div className="float flex flex-col items-center justify-center gap-y-5 self-end text-center lg:items-end lg:justify-end lg:text-right">
						<div className="font-[heading-font] text-5xl text-ieee-bright-yellow sm:text-6xl">
							EVENTS
						</div>
						<div className="w-3/4 font-[body-font] text-xl text-white lg:text-2xl">
							From technical workshops to career-building sessions to social
							gatherings to community service opportunities, there is unlimited
							opportunity to expand networks and grow skills in IEEE @ UCF.
						</div>
					</div>
				</div>

				<div className="h-full w-full bg-black">
					<Image
						className="absolute z-0 h-full w-full object-cover opacity-70"
						src="/gbms/gbmgif.gif"
						alt="Events Photo"
						width={2000}
						height={2000}
					/>
				</div>
			</div>

			<div className="relative w-full -translate-y-20 overflow-hidden leading-none">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 1200 120"
					preserveAspectRatio="none"
					className="h-20 w-full"
				>
					<defs>
						<radialGradient id="bg-gradient3" cx="40%" cy="120%" r="125%">
							<stop offset="50%" stopColor="#000000" />
							<stop offset="100%" stopColor="#000000" />
						</radialGradient>
					</defs>

					<path
						d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86, 82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53, 26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
						fill="url(#bg-gradient3)"
						transform="scale(1,-1) translate(0,-120)" // Flips over X-axis
					/>
				</svg>
			</div>
			<div className="-translate-y-20">
				<EventSidebar />
				<div className="bg-black p-10"></div>
			</div>

			<div className="-mt-20">
				<Footer />
			</div>
		</div>
	);
}
