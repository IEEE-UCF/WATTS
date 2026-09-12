'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GlowButton } from '@/components/ui/glow-button';

export default function AboutHeader() {
	const [isFlipped, setIsFlipped] = useState<boolean>(true);

	return (
		<div className="">
			<div className="animated-background absolute inset-0 top-0 left-0 z-2 h-full w-full items-center justify-center place-self-center bg-gradient-to-r px-5 [background:radial-gradient(300%_125%_at_30%_0%,#0c0a09_10%,transparent_100%)]"></div>

			<div className="absolute z-3 my-10 flex w-screen flex-row justify-center p-40">
				<div className="float flex flex-col items-center justify-center gap-y-3 self-center text-center">
					<div className="font-heading text-5xl text-ieee-bright-yellow sm:text-6xl">
						WHAT IS IEEE?
					</div>

					<div className="flex max-w-screen flex-wrap px-3 font-body text-xl text-white lg:text-3xl">
						ieee • /aɪ ˈtɹɪp.əl iː/ • institute of electrical and electronics engineers
					</div>

					<div className="mt-[23vh]"></div>

					<div className="group relative max-w-screen cursor-pointer">
						<div className="absolute -inset-2 rounded-lg bg-gradient-to-r from-ieee-bright-yellow to-ieee-bright-yellow opacity-25 blur transition duration-1000 group-hover:opacity-100 group-hover:duration-200"></div>

						<div className="group relative w-fit cursor-pointer overflow-hidden rounded-2xl bg-transparent p-[4px] transition-transform hover:scale-102">
							<div className="animated-border pointer-events-none absolute inset-0 z-0 rounded-2xl bg-[conic-gradient(var(--ieee-bright-yellow)_20deg,transparent_120deg)]"></div>

							<button
								className="relative z-10 h-[280px] w-85 max-w-screen cursor-pointer items-center justify-center rounded-2xl bg-[#0c0a09] p-5 text-white backdrop-blur-sm sm:w-120 md:h-[235px] md:w-170 lg:w-195"
								onClick={() => setIsFlipped(!isFlipped)}
							>
								{isFlipped ? (
									<div>
										<div className="font-subheading-italic text-xl text-ieee-bright-yellow sm:text-2xl">
											We are the innovators of tomorrow.
										</div>
										<div className="font-body text-base sm:text-xl">
											Located at the University of Central Florida, our IEEE
											student chapter is one of the largest in the nation and
											boasts over 300 active members. We foster technical
											experience through a collaborative environment,
											ultimately paving the way for successful careers in
											diverse engineering fields.
										</div>
									</div>
								) : (
									<div>
										<div className="font-subheading-italic text-2xl">
											Want to see our full story?
										</div>
										<div className="my-6"></div>
										<div className="w-fit place-self-center font-heading text-2xl transition-transform hover:scale-110 hover:text-ieee-bright-yellow">
											<GlowButton innerClassName="justify-start px-8 py-7">
												<Link href="https://www.youtube.com/watch?v=JyjVBBVm0g4">
													<p>WATCH VIDEO</p>
												</Link>
											</GlowButton>
										</div>
									</div>
								)}
							</button>
						</div>
					</div>
				</div>
			</div>

			<div className="h-full w-full bg-black">
				<Image
					className="absolute z-0 h-full w-full object-cover object-center opacity-100"
					src="/southeastcon/secgroup.png"
					alt="About Us Photo"
					width={2000}
					height={2000}
				/>
			</div>
		</div>
	);
}
