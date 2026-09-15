'use client';
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	//   NavigationMenuList,
	NavigationMenuTrigger,
	//   navigationMenuTriggerStyle,
} from '@watts/ui/navigation-menu';
import { visibleNavGroups, type NavAuthStatus } from './shell/nav-config';

interface AvatarMenuProps {
	image: string;
	name: string;
	email?: string | null;
	/** Display label — "Administrator", "Officer · Workshop Chair", or omitted for a plain member. */
	role?: string | null;
	/** Same shape the dashboard sidebar filters on — same nav, same gate, one source of truth
	 * (nav-config.ts) instead of a second hardcoded link list living in here. */
	navAuth: NavAuthStatus;
}

/**
 * Account menu behind the Discord pfp — opens on hover (a Radix NavigationMenu default,
 * not a click-triggered dropdown). Used on the marketing navbar (the only account access
 * on public pages, so the full nav tree matters there) and the dashboard shell's topbar
 * (where the sidebar has the same links, but collapsed by default — this is the quick way
 * to reach them without opening it). Sign out is the one place it lives outside the bottom
 * of the full /settings form.
 */
const AvatarMenu: React.FC<AvatarMenuProps> = ({ image, name, email, role, navAuth }) => {
	const groups = visibleNavGroups(navAuth);

	return (
		<div className="z-100">
			<NavigationMenu viewport={false}>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="h-auto w-auto rounded-full bg-transparent p-0 hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent">
						<Image
							className="h-12 w-12 cursor-pointer rounded-full border border-white object-cover transition-all hover:scale-107"
							src={image}
							alt="Profile"
							width={2000}
							height={2000}
						/>
					</NavigationMenuTrigger>

					{/* The primitive's default `left-0` anchors the content's left edge to the
					trigger and opens rightward — fine for a trigger with room to its right, but
					this one always sits in the top-right corner, so it needs to open leftward
					instead or it runs off the viewport edge. */}
					<NavigationMenuContent className="right-0 left-auto">
						<div className="w-64 overflow-hidden rounded-md bg-ieee-dark-yellow">
							<div className="border-b border-black/15 px-3 py-2.5">
								<div className="truncate font-subheading text-sm text-black">
									{name}
								</div>
								{email && (
									<div className="truncate text-xs text-black/70">{email}</div>
								)}
								{role && (
									<span className="mt-1.5 inline-block rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-black uppercase">
										{role}
									</span>
								)}
							</div>

							<div className="flex flex-col gap-2 p-1 py-2">
								{groups.map((group) => (
									<div key={group.label}>
										<div className="px-2 pb-0.5 font-mono text-[10px] tracking-[0.1em] text-black/50 uppercase">
											{group.label}
										</div>
										{group.items.map((item) => (
											<NavigationMenuLink asChild key={item.href}>
												<Link
													href={item.href}
													className="block rounded px-2 py-1.5 font-subheading text-sm text-black transition-all hover:bg-ieee-bright-yellow"
												>
													{item.label}
												</Link>
											</NavigationMenuLink>
										))}
									</div>
								))}
							</div>

							<div className="border-t border-black/15 p-1">
								<button
									type="button"
									onClick={() => void signOut({ callbackUrl: '/' })}
									className="w-full rounded px-2 py-1.5 text-left font-subheading text-sm text-black transition-all hover:bg-ieee-bright-yellow"
								>
									SIGN OUT
								</button>
							</div>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
			</NavigationMenu>
		</div>
	);
};

export { AvatarMenu };
