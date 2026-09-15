'use client';
import Link from 'next/link';
import React, { useState } from 'react';
import Image from 'next/image';
import { XMarkIcon, Bars3Icon } from '@heroicons/react/24/solid';
import { trpc } from '@/lib/trpc/client';
import { AvatarMenu } from './avatarmenu';

const routes: { title: string; href: string; image: string }[] = [
	{ title: 'About', href: '/about', image: '/iconography/navbarabout.png' },
	{ title: 'Events', href: '/events', image: '/iconography/navbarevents.png' },
	{ title: 'Projects', href: '/projects', image: '/iconography/navbarprojects.png' },
	{ title: 'Sponsorships', href: '/sponsorships', image: '/iconography/navbarsponsorships.png' },
	{ title: 'Connect', href: '/connect', image: '/iconography/navbarconnect.png' },
];

const authRoutes: { title: string; href: string; image: string }[] = [
	{ title: 'Dashboard', href: '/dashboard', image: '/iconography/navbardashboard.png' },
	{ title: 'Settings', href: '/settings', image: '/iconography/navbarsettings.png' },
];

const adminRoutes: { title: string; href: string; image: string }[] = [
	{
		title: 'Admin Dashboard',
		href: '/admin/dashboard',
		image: '/iconography/navbardashboard.png',
	},
	{
		title: 'Demo Event Scanner',
		href: '/test/scan-qr',
		image: '/iconography/navbardashboard.png',
	},
	{ title: 'Testing', href: '/test/demos', image: '/iconography/navbardashboard.png' },
];

const Navbar: React.FC = () => {
	const { data: auth } = trpc.auth.getAuthStatus.useQuery();
	const [menuOpen, setMenuOpen] = useState(false);
	// Read once, ahead of any narrowing on `auth.member` below — avoids TS collapsing
	// `auth.user`'s type to `never` in the branch where `auth.member` is falsy.
	const memberFirstName = auth?.member?.firstName;
	const memberLastName = auth?.member?.lastName;
	const memberEmail = auth?.member?.ucfEmail;
	const sessionUserName = auth?.user?.name;
	const sessionUserEmail = auth?.user?.email;

	const toggleMenu = () => {
		setMenuOpen(!menuOpen);
	};

	return (
		<div className="relative flex h-40 w-full items-center justify-between">
			<div className="m-6 flex w-full justify-between">
				<div className="flex items-center justify-start">
					<Link
						href={'/'}
						className="flex flex-row items-center justify-center gap-x-5 align-middle font-body text-xl text-white transition hover:text-ieee-dark-yellow lg:text-2xl"
					>
						<Image
							className="object-contain"
							src="/iconography/ieeeucficon.png"
							alt="IEEE UCF Logo"
							width={70}
							height={70}
						/>
						IEEE @ UCF Student Chapter
					</Link>
				</div>

				<div className="hidden items-center justify-end gap-x-1 sm:flex">
					{routes.map((route, index) => (
						<Link
							key={index}
							href={route.href}
							className="inline-flex items-center font-body text-sm text-white transition hover:text-ieee-dark-yellow sm:px-1.5 md:px-3 lg:px-5"
						>
							{route.title}
						</Link>
					))}

					{auth?.hasStaffAccess && (
						<Link
							href="/staff"
							className="inline-flex items-center font-body text-sm text-white transition hover:text-ieee-dark-yellow sm:px-1.5 md:px-3 lg:px-5"
						>
							Staff
						</Link>
					)}

					{auth?.isAdmin && (
						<div className="ml-2 flex items-center gap-3 border-l border-input pl-4">
							<span className="font-heading text-xs tracking-[0.2em] text-ieee-dark-yellow">
								ADMIN
							</span>
							{adminRoutes.map((route, index) => (
								<Link
									key={index}
									href={route.href}
									className="inline-flex items-center font-body text-xs text-white transition hover:text-ieee-dark-yellow"
								>
									{route.title.toUpperCase()}
								</Link>
							))}
						</div>
					)}

					{auth?.isMember && auth?.discordAvatar ? (
						<div className="ml-3 flex items-center">
							<AvatarMenu
								image={auth.discordAvatar}
								name={
									memberFirstName
										? `${memberFirstName} ${memberLastName}`
										: (sessionUserName ?? 'Member')
								}
								email={memberEmail ?? sessionUserEmail ?? null}
								role={
									auth.isAdmin
										? 'Administrator'
										: auth.isOfficer
											? auth.officerRole
												? `Officer · ${auth.officerRole}`
												: 'Officer'
											: null
								}
							/>
						</div>
					) : (
						<div className="ml-3 flex items-center">
							<Link
								href="/auth/signin"
								className="group relative inline-flex h-fit w-fit items-center rounded-sm bg-ieee-dark-yellow py-2 font-heading text-sm text-white transition sm:px-1 md:px-2 lg:px-4"
							>
								<div className="absolute inset-0 rounded-sm bg-gradient-to-r from-ieee-bright-yellow to-ieee-bright-yellow opacity-25 blur transition duration-1000 group-hover:opacity-100 group-hover:duration-200"></div>
								<div className="relative px-2">SIGN IN</div>
							</Link>
						</div>
					)}
				</div>

				{/* <Image className="object-contain" src="/ieeemasterbrand.png" alt="IEEE UCF Logo" width={70} height={70} /> */}
			</div>

			{menuOpen && <MobileMenu toggleMenu={toggleMenu} />}

			<button
				onClick={toggleMenu}
				className="z-50 mr-5 cursor-pointer bg-ieee-dark-yellow lg:hidden"
			>
				{menuOpen ? (
					<XMarkIcon className="fixed z-50 h-7 w-7 -translate-x-7 -translate-y-3.5 bg-ieee-dark-yellow" />
				) : (
					<Bars3Icon className="h-7 w-7" />
				)}
			</button>
		</div>
	);
};

const MobileMenu: React.FC<{ toggleMenu: () => void }> = ({ toggleMenu }) => {
	const { data: auth } = trpc.auth.getAuthStatus.useQuery();

	return (
		<div className="fixed inset-0 z-40 flex h-screen max-w-screen flex-col bg-black">
			<div className="mt-5 mb-5 flex w-full grow flex-col overflow-y-auto">
				<div className="m-6 flex flex-row items-center gap-5 gap-x-5 px-5 font-body text-xl text-white lg:text-2xl">
					<Image
						className="object-contain"
						src="/iconography/ieeeucficon.png"
						alt="IEEE UCF Logo"
						width={70}
						height={70}
					/>
					IEEE @ UCF Student Chapter
				</div>

				{/* <div className="flex w-full justify-between m-6">
				<div className="flex justify-start items-center">
					<Link href={"/"} className="text-white font-body flex-row flex align-middle justify-center items-center gap-x-5 text-xl lg:text-2xl hover:text-ieee-dark-yellow transition">
						<Image className="object-contain" src="/iconography/ieeeucficon.png" alt="IEEE UCF Logo" width={70} height={70} />IEEE @ UCF Student Chapter
					</Link>
				</div> */}
				{auth?.isMember ? (
					<div className="flex flex-col bg-ieee-dark-yellow p-5">
						<div className="">
							<div className="font-heading text-xl text-white">
								{auth?.member?.firstName.toUpperCase()}{' '}
								{auth?.member?.lastName.toUpperCase()}
							</div>
						</div>
					</div>
				) : (
					<div className=""></div>
				)}

				<div className="flex flex-col p-5">
					<div className="ml-6 font-heading text-xl text-ieee-dark-yellow">CLUB</div>
					<div className="ml-6">
						<Link
							href="/"
							onClick={toggleMenu}
							className={
								'inline-flex h-10 w-full items-center gap-3 font-subheading text-base text-white transition-colors hover:text-ieee-bright-yellow'
							}
						>
							<Image
								className="h-7 w-7 object-cover"
								src="/iconography/navbarhome.png"
								alt="Profile"
								width={2000}
								height={2000}
							/>
							Home
						</Link>

						{routes.map((route, index) => (
							<Link
								key={index}
								href={route.href}
								onClick={toggleMenu}
								className={
									'inline-flex h-10 w-full items-center gap-3 font-subheading text-base text-white transition-colors hover:text-ieee-bright-yellow'
								}
							>
								<Image
									className="h-7 w-7 object-cover"
									src={route.image}
									alt="Profile"
									width={2000}
									height={2000}
								/>

								{route.title}
							</Link>
						))}
					</div>
				</div>

				{auth?.hasStaffAccess && (
					<div className="ml-6 flex flex-col p-5">
						<div className="font-heading text-xl text-ieee-dark-yellow">STAFF</div>
						<Link
							href="/staff"
							onClick={toggleMenu}
							className="inline-flex h-10 w-full items-center gap-3 font-subheading text-base text-white transition-colors hover:text-ieee-bright-yellow"
						>
							<Image
								className="h-7 w-7 object-cover"
								src="/iconography/navbardashboard.png"
								alt=""
								width={2000}
								height={2000}
							/>
							Staff Tools
						</Link>
					</div>
				)}

				{auth?.isAdmin && (
					<div className="ml-6 flex flex-col p-5">
						<div className="font-heading text-xl text-ieee-dark-yellow">ADMIN</div>
						{adminRoutes.map((route, index) => (
							<Link
								key={index}
								href={route.href}
								onClick={toggleMenu}
								className={
									'inline-flex h-10 w-full items-center gap-3 font-subheading text-base text-white transition-colors hover:text-ieee-bright-yellow'
								}
							>
								<Image
									className="h-7 w-7 object-cover"
									src={route.image}
									alt="Profile"
									width={2000}
									height={2000}
								/>

								{route.title}
							</Link>
						))}
					</div>
				)}

				{auth?.isMember ? (
					<div className="ml-6 flex flex-col p-5">
						<div className="font-heading text-xl text-ieee-dark-yellow">ACCOUNT</div>

						{authRoutes.map((route, index) => (
							<Link
								key={index}
								href={route.href}
								onClick={toggleMenu}
								className={
									'inline-flex h-10 w-full items-center gap-3 font-subheading text-base text-white transition-colors hover:text-ieee-bright-yellow'
								}
							>
								<Image
									className="h-7 w-7 object-cover"
									src={route.image}
									alt="Profile"
									width={2000}
									height={2000}
								/>

								{route.title}
							</Link>
						))}
					</div>
				) : (
					<Link
						href="/auth/signin"
						className="group relative m-6 inline-flex h-fit w-2/5 items-center justify-center self-center rounded-sm bg-ieee-dark-yellow py-3 align-middle font-heading text-base text-white transition sm:px-1 md:px-2 lg:px-4"
					>
						<div className="absolute inset-0 rounded-sm bg-gradient-to-r from-ieee-bright-yellow to-ieee-bright-yellow opacity-25 blur transition duration-1000 group-hover:opacity-100 group-hover:duration-200"></div>

						<div className="relative px-2 text-center">SIGN IN</div>
					</Link>
				)}
			</div>
		</div>
	);
};

export { Navbar };
