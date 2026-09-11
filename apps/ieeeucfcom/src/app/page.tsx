'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Timer } from '@/components/timer';

import Autoplay from 'embla-carousel-autoplay';
import { Carousel, CarouselContent, CarouselItem } from '@watts/ui/carousel';
import { Card, CardContent } from '@watts/ui/card';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
	gsap.registerPlugin(ScrollTrigger);
}

const carouselList = [
	{ feature: 'TECHNICAL WORKSHOPS', photo: '/committees/workshopgif.gif' },
	{ feature: 'EMBEDDED PROJECTS', photo: '/projects/sechardwaregif1.gif' },
	{ feature: 'SOCIAL EVENTS', photo: '/committees/socialgif1.gif' },
	{ feature: 'CAREER DEVELOPMENT', photo: '/committees/prodevgif.gif' },
	{ feature: 'COMMUNITY SERVICE', photo: '/committees/servicegif.gif' },
];

export default function Home() {
	const carouselRef = useRef(null);
	const eventsRef = useRef(null);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			gsap.fromTo(
				carouselRef.current,
				{ opacity: 0, y: 100 },
				{
					opacity: 1,
					y: 0,
					duration: 1,
					ease: 'power3.out',
					scrollTrigger: {
						trigger: carouselRef.current,
						start: 'top 80%',
					},
				},
			);

			gsap.fromTo(
				eventsRef.current,
				{ opacity: 0, y: 100 },
				{
					opacity: 1,
					y: 0,
					duration: 1,
					ease: 'power3.out',
					scrollTrigger: {
						trigger: eventsRef.current,
						start: 'top 85%',
					},
				},
			);
		}
	}, []);

	return (
		<div>
			<div className="flex max-w-screen flex-col overflow-x-hidden">
				<div className="relative w-full">
					<div className="relative flex h-[165vh] w-full flex-col items-center [background:radial-gradient(125%_125%_at_50%_10%,#0c0a09_40%,#FFC72C_100%)] lg:h-[150vh] 2xl:h-[140vh]">
						<div className="w-full px-5">
							<Navbar />

							<div className="float flex flex-row flex-wrap justify-center gap-x-[3vw] self-center md:my-30 lg:my-0">
								<div className="flex flex-col items-start justify-center self-center text-center xl:text-left">
									<div className="my-8 max-w-full">
										<div className="font-[display-font] text-7xl text-[var(--ieee-bright-yellow)] lg:text-8xl">
											IEEE @ UCF
										</div>
										<div className="font-[subheading-font] text-4xl text-white lg:text-5xl">
											STUDENT CHAPTER
										</div>
										<div className="my-3 flex w-fit flex-wrap font-[body-italic-font] text-sm text-white md:text-xl lg:text-2xl">
											<div className="typewriter flex flex-wrap break-words whitespace-normal">
												From circuits to embedded systems, we engineer the
												future
											</div>
										</div>
									</div>

									<div className="group relative cursor-pointer self-center xl:self-start">
										<div className="absolute -inset-1 bg-gradient-to-r from-[var(--ieee-bright-yellow)] to-[var(--ieee-bright-yellow)] opacity-25 blur transition duration-1000 group-hover:opacity-100 group-hover:duration-200"></div>

										<div className="relative flex items-start justify-start space-x-6 rounded-sm bg-[#0c0a09] px-12 py-5 leading-none ring-1 ring-gray-900/5">
											<div className="space-y-2">
												<Link href="/about">
													<p className="font-[body-italic-font] text-xl text-white">
														LEARN MORE!
													</p>
												</Link>
											</div>
										</div>
									</div>
								</div>
								<div>
									<Image
										className="mt-10 h-60 w-auto place-self-center object-contain lg:h-110 lg:w-9/12"
										src="/iconography/ieeeucfsymbol.png"
										alt="IEEE UCF Logo"
										width={3000}
										height={3000}
									/>
								</div>
							</div>

							<div className="particles-container absolute left-0 w-full">
								<div className="particle"></div>
								<div className="particle"></div>
								<div className="particle"></div>
								<div className="particle"></div>
								<div className="particle"></div>
								<div className="particle"></div>
							</div>
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
								<radialGradient id="bg-gradient" cx="40%" cy="120%" r="125%">
									<stop offset="50%" stopColor="#000000" />
									<stop offset="100%" stopColor="#3d3110" />
								</radialGradient>
							</defs>

							<path
								d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86, 82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53, 26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
								fill="url(#bg-gradient)"
								transform="scale(1,-1) translate(0,-120)"
							/>
						</svg>
					</div>
				</div>

				<div className="-translate-y-20 [background:radial-gradient(125%_125%_at_50%_10%,#3d3110_40%,#000000_100%)]">
					<div
						ref={carouselRef}
						className="relative z-10 flex w-full -translate-y-1/2 justify-center"
					>
						<Carousel
							opts={{ align: 'center' }}
							plugins={[Autoplay({ delay: 2000 })]}
							className="w-3/4"
						>
							<CarouselContent>
								{carouselList.map((item, index) => (
									<CarouselItem
										key={index}
										className="flex basis-xs cursor-grab items-center justify-center py-3 md:basis-3/5 lg:basis-[45.45%] xl:basis-5/12 2xl:basis-1/3"
									>
										<div className="p-2">
											<div className="group relative w-full cursor-grab overflow-hidden rounded-sm bg-transparent p-[3px] transition-transform hover:scale-102">
												<div
													className="animated-border absolute inset-0 -z-10 animate-spin rounded-sm bg-[conic-gradient(var(--ieee-bright-yellow)_20deg,transparent_120deg)] p-20 transition-all duration-300"
													style={{ animationDuration: '6s' }}
												/>
												<Card className="group relative z-10 h-90 w-65 overflow-hidden rounded-sm border-none p-0 shadow-md transition sm:h-70 sm:w-70 md:h-85 md:w-85 xl:h-90 xl:w-90">
													<CardContent className="flex h-full w-full flex-col justify-end p-0">
														<div className="relative h-full w-full">
															<Image
																src={item.photo}
																alt="Photo"
																fill
																className="rounded-none object-cover object-bottom"
																priority
															/>
															<div className="pointer-events-none absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
															<span className="absolute bottom-0 left-1/2 h-fit w-full -translate-x-1/2 bg-black/60 p-2 font-[body-font] text-lg text-white">
																{item.feature}
															</span>
														</div>
													</CardContent>
												</Card>
											</div>
										</div>
									</CarouselItem>
								))}
							</CarouselContent>
						</Carousel>
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
							<radialGradient id="bg-gradient2" cx="40%" cy="110%" r="125%">
								<stop offset="50%" stopColor="#000000" />
								<stop offset="100%" stopColor="#0d0a03" />
							</radialGradient>
						</defs>

						<path
							d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86, 82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53, 26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
							fill="url(#bg-gradient2)"
							transform="scale(1,-1) translate(0,-120)"
						/>
					</svg>
				</div>

				<div className="-mt-40 flex w-full flex-col bg-[#0d0a03] p-5">
					<div className="my-5 text-center font-[heading-font] text-5xl text-[var(--ieee-bright-yellow)] lg:text-6xl">
						UPCOMING EVENTS
					</div>

					<div ref={eventsRef}>
						<div className="flex flex-row flex-wrap items-center p-1 sm:p-9">
							<Timer />
						</div>
					</div>
				</div>

				<Footer />
			</div>
		</div>
	);
}
