// i stole the component i made from another project... will edit later

'use client';
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';

// import { Github, Instagram, Linkedin, Youtube, Facebook } from 'lucide-react';

// const socials: { title: string; href: string; icon: React.ReactNode }[] = [
//     { title: "instagram", href: "https://www.instagram.com/ieeeucf/?hl=en", icon: <Instagram className="w-5 h-5 text-white hover:text-[var(--ieee-bright-yellow)]" /> },
//     { title: "linkedin", href: "https://www.linkedin.com/company/ieee-ucf/", icon: <Linkedin className="w-5 h-5 text-white hover:text-[var(--ieee-bright-yellow)]" /> },
//     { title: "youtube", href: "https://www.youtube.com/@ieeeucf2287", icon: <Youtube className="w-5 h-5 text-white hover:text-[var(--ieee-bright-yellow)]" /> },
//     { title: "facebook", href: "https://www.facebook.com/ieeeatucf/", icon: <Facebook className="w-5 h-5 text-white hover:text-[var(--ieee-bright-yellow)]" /> },
//     { title: "github", href: "https://github.com/IEEE-UCF", icon: <Github className="w-5 h-5 text-white hover:text-[var(--ieee-bright-yellow)]" /> },

// ];

const Footer: React.FC = () => {
	return (
		<div className="flex w-full flex-col items-center justify-center bg-black text-white">
			<div className="w-full bg-accent"></div>
			<div className="h-fit w-full"></div>
			<div className="flex w-full max-w-7xl flex-col gap-y-6 px-4 py-8 md:flex-row md:justify-between md:gap-x-2 md:p-10">
				<div className="mb-4 flex justify-center md:mb-0 md:justify-start">
					<Image
						className="h-24 w-24 object-cover md:h-40 md:w-40"
						src="/iconography/ieeeucflogo.png"
						alt="Events Photo"
						width={2000}
						height={2000}
					/>
				</div>
				<div className="flex w-full flex-col items-center gap-y-1 md:w-auto md:items-start md:justify-center">
					<div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs md:justify-start md:text-sm">
						<Link
							href={'/'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							HOME
						</Link>
						<span className="hidden font-[body-font] text-xl md:inline">|</span>
						<Link
							href={'/about'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							ABOUT
						</Link>
						<span className="hidden font-[body-font] text-xl md:inline">|</span>
						<Link
							href={'/connect'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							CONTACT
						</Link>
					</div>
					<div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs md:justify-start md:text-sm">
						<Link
							href={'https://www.ieee.org/accessibility_statement.html'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							ACCESSIBILITY
						</Link>
						<span className="hidden font-[body-font] text-xl md:inline">|</span>
						<Link
							href={'https://www.ieee.org/nondiscrimination'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							NONDISCRIMINATION POLICY
						</Link>
						<span className="hidden font-[body-font] text-xl md:inline">|</span>
						<Link
							href={'http://www.ieee-ethics-reporting.org'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							IEEE ETHICS REPORTING
						</Link>
						<span className="hidden font-[body-font] text-xl md:inline">|</span>
						<Link
							href={'https://privacy.ieee.org/policies'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							IEEE PRIVACY POLICY
						</Link>
						<span className="hidden font-[body-font] text-xl md:inline">|</span>
						<Link
							href={'https://www.ieee.org/site_terms_conditions.html'}
							className="font-[body-font] font-extralight text-white hover:text-[var(--ieee-bright-yellow)]"
						>
							TERMS & DISCLOSURES
						</Link>
					</div>
					<div className="flex w-full flex-col items-center gap-x-4 gap-y-2 text-center text-xs md:flex-row md:text-left md:text-base">
						© Copyright 2026 IEEE – All rights reserved. A public charity, IEEE is the
						world’s largest technical professional organization dedicated to advancing
						technology for the benefit of humanity.
					</div>
				</div>
			</div>
		</div>
	);
};

export { Footer };
