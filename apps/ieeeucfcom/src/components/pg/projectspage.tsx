'use client';

import Image from 'next/image';
import { Navbar } from '@/components/navbar';
import { SidebarProvider } from '@watts/ui/sidebar';
import { useState, useEffect, useRef } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Button } from '@watts/ui/button';
import { Card, CardContent } from '@watts/ui/card';
import { Footer } from '@/components/footer';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { trpc } from '@/lib/trpc/client';
import type { Project } from '@watts/db/schema';

type ProjectWithLead = Project & { lead: string | null };

gsap.registerPlugin(ScrollTrigger);

export default function ProjectsPage() {
	const [selectedProject, setSelectedProject] = useState<ProjectWithLead | null>(null);
	const cardsRef = useRef<HTMLDivElement[]>([]);

	const { data: projectData = [] } = trpc.project.getAll.useQuery();

	useEffect(() => {
		if (cardsRef.current.length > 0) {
			gsap.fromTo(
				cardsRef.current,
				{ opacity: 0, y: 40 },
				{
					opacity: 1,
					y: 0,
					duration: 0.8,
					ease: 'power3.out',
					stagger: 0.15,
					scrollTrigger: {
						trigger: cardsRef.current[0].parentElement,
						start: 'top 20%',
					},
				},
			);
		}
	}, [projectData]);

	const viewSidebar = (project: ProjectWithLead) => setSelectedProject(project);
	const closeSidebar = () => setSelectedProject(null);

	const parseSkills = (info: string | null): string[] =>
		info
			? info
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			: [];

	return (
		<SidebarProvider
			className="flex max-w-screen flex-col overflow-hidden"
			defaultOpen={false}
			open={selectedProject !== null}
			onOpenChange={(open) => {
				if (!open) setSelectedProject(null);
			}}
		>
			<div
				className={`flex max-w-screen flex-col overflow-hidden bg-transparent transition-all duration-300 ${
					selectedProject ? 'blur-sm' : 'blur-none'
				}`}
			>
				<div className="relative h-[120vh] w-full">
					<div className="absolute inset-0 z-4 h-fit w-full items-center px-5">
						<Navbar />
					</div>
					<div className="absolute inset-0 top-0 left-0 z-2 h-full w-full animated-background items-center bg-gradient-to-r px-5 [background:radial-gradient(125%_125%_at_50%_10%,#0c0a09_5%,transparent_100%)]"></div>
					<div className="absolute z-3 my-30 flex w-screen flex-row justify-center p-40 px-10 md:px-20 lg:justify-end lg:px-40">
						<div className="flex w-full flex-col items-center gap-y-5 text-center lg:items-start lg:text-left">
							<div className="font-[heading-font] text-5xl text-[var(--ieee-bright-yellow)] sm:text-6xl">
								PROJECTS
							</div>
							<div className="w-full font-[body-font] text-xl text-white lg:w-3/4 lg:text-2xl">
								Tackle real-world challenges by joining or leading IEEE @ UCF's
								hands-on projects. Members of all skill levels and backgrounds can
								get involved to develop technical experience, collaborate with
								others, and push the boundaries of engineering.
							</div>
						</div>
					</div>
					<div className="relative h-full w-full bg-black">
						<Image
							className="absolute z-0 h-full w-full object-cover object-center opacity-100"
							src="/projects/sechardwaregif2.gif"
							alt="Projects Photo"
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

				<div className="flex -translate-y-20 flex-row flex-wrap justify-start bg-black px-3 py-20">
					{projectData.map((project, index) => {
						const hwSkills = parseSkills(project.hardwareInfo).map((s) => ({
							label: s,
							type: 'hw',
						}));
						const swSkills = parseSkills(project.softwareInfo).map((s) => ({
							label: s,
							type: 'sw',
						}));
						const allSkills = [...hwSkills, ...swSkills];
						const maxVisible = 6;
						const visibleSkills = allSkills.slice(0, maxVisible - 1);
						const remaining =
							allSkills.length > maxVisible
								? allSkills.length - visibleSkills.length
								: 0;
						const photoUrl = Array.isArray(project.photoUrls)
							? (project.photoUrls[0] ?? null)
							: (project.photoUrls ?? null);

						return (
							<div
								key={project.id}
								ref={(el) => {
									if (el) cardsRef.current[index] = el;
								}}
								className="flex h-fit w-full flex-col p-3 opacity-0 transition hover:scale-102 md:basis-1/2 lg:basis-1/3"
							>
								<div className="group relative cursor-pointer transition-transform hover:scale-102">
									<div className="absolute -inset-0.5 rounded-sm bg-gradient-to-r from-[var(--ieee-bright-yellow)] to-[var(--ieee-bright-yellow)] opacity-25 blur transition duration-300 group-hover:opacity-100 group-hover:duration-200"></div>
									<Card className="relative h-fit border-0 bg-black">
										<CardContent>
											<Image
												className="mb-4 h-80 w-full rounded-sm border-white object-cover object-center"
												src={photoUrl ?? '/larry.png'}
												alt={project.title}
												width={2000}
												height={2000}
											/>
											<div className="mb-2 text-xl font-bold text-white">
												{project.title}
											</div>
											{project.lead && (
												<div className="mb-2 text-gray-300">
													Project Lead: {project.lead}
												</div>
											)}
											<div className="mb-4 text-gray-400">
												{project.overview?.slice(0, 120)}...
											</div>
											<div className="mb-4 flex flex-wrap gap-2">
												{visibleSkills.map((skill, idx) => (
													<div
														key={idx}
														className={`w-fit rounded-sm px-3 py-1 text-sm text-white ${skill.type === 'hw' ? 'bg-[var(--ieee-light-grey)]' : 'bg-[var(--ieee-grey)]'}`}
													>
														{skill.label}
													</div>
												))}
												{remaining > 0 && (
													<div className="w-fit rounded-sm bg-[var(--ieee-dark-grey)] px-3 py-1 font-[subheading-font] text-sm text-white">
														+{remaining} more
													</div>
												)}
											</div>
											<div
												className="relative flex w-full cursor-pointer flex-row justify-between text-white transition hover:scale-103 hover:text-amber-300"
												onClick={() => viewSidebar(project)}
											>
												LEARN MORE
												<ChevronRight />
											</div>
										</CardContent>
									</Card>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{selectedProject && (
				<div className="fixed inset-0 z-[200] flex items-center justify-center">
					<div className="flex h-full w-full max-w-[95vw] flex-col overflow-y-auto rounded-sm bg-black p-4 sm:max-w-md">
						<div className="mb-4 flex items-center justify-between">
							<div className="text-xl text-[var(--ieee-bright-yellow)]">
								{selectedProject.title?.toUpperCase()}
							</div>
							<Button
								onClick={closeSidebar}
								className="cursor-pointer bg-transparent text-white transition-transform hover:scale-150 hover:bg-transparent"
							>
								<X size={24} />
							</Button>
						</div>
						<div className="mb-6">
							<Image
								className="mb-4 h-48 w-full rounded-sm object-cover"
								src={
									Array.isArray(selectedProject.photoUrls)
										? (selectedProject.photoUrls[0] ?? '/larry.png')
										: (selectedProject.photoUrls ?? '/larry.png')
								}
								alt={selectedProject.title}
								width={600}
								height={400}
							/>
						</div>
						<div className="flex-1 space-y-4 overflow-auto">
							<div>
								<div className="mb-2 text-lg font-semibold text-[var(--ieee-bright-yellow)]">
									Overview
								</div>
								<div className="text-white">{selectedProject.overview}</div>
							</div>
							{selectedProject.lead && (
								<div>
									<div className="mb-2 text-lg font-semibold text-[var(--ieee-bright-yellow)]">
										Project Lead
									</div>
									<div className="text-white">{selectedProject.lead}</div>
								</div>
							)}
							<div>
								<h3 className="mb-2 text-lg font-semibold text-white">Hardware</h3>
								<div className="flex flex-wrap gap-2 text-white">
									{parseSkills(selectedProject.hardwareInfo).length ? (
										parseSkills(selectedProject.hardwareInfo).map((item, i) => (
											<div
												key={i}
												className="rounded-sm bg-[var(--ieee-light-grey)] px-3 py-1 text-sm"
											>
												{item}
											</div>
										))
									) : (
										<p>No hardware specified</p>
									)}
								</div>
							</div>
							<div>
								<h3 className="mb-2 text-lg font-semibold text-white">Software</h3>
								<div className="flex flex-wrap gap-2 text-white">
									{parseSkills(selectedProject.softwareInfo).length ? (
										parseSkills(selectedProject.softwareInfo).map((item, i) => (
											<div
												key={i}
												className="rounded-sm bg-[var(--ieee-grey)] px-3 py-1 text-sm"
											>
												{item}
											</div>
										))
									) : (
										<p>No software specified</p>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
			<div className="-mt-20">
				<Footer />
			</div>
		</SidebarProvider>
	);
}
